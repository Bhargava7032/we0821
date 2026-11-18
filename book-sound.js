"use strict";
/* ==========================================================================
   Book sound: page-turn audio synthesized from scratch (no audio files)
   --------------------------------------------------------------------------
   Modelled on a 70–80 GSM book page:
     crinkle   hundreds of tiny clicks (0.5–5 ms) as the fibres flex; their
               density follows how sharply the sheet is bending
     rustle    bright friction noise (energy around 2–6 kHz) whose loudness
               flutters irregularly as the sheet wobbles through the air
     air       a faint low whoosh of moved air
     peel      a few stick-slip clicks as the page leaves the one below
     flap      a soft, muffled paper-on-paper landing with a small bounce
   Hardcover boards: cloth rub, sparse spine crackle, more air and a low thud.

   Each turn is rendered sample by sample into a fresh buffer whose length
   matches the animation, so the landing lands when the page does. Rendering
   takes a couple of milliseconds.

   Browsers allow audio only after a user gesture, so the context is created
   on the first tap/click/key. script.js calls window.BookSound; every method
   is safe to call before audio is unlocked or while muted.
   ========================================================================== */
(() => {
  const STORAGE_KEY = "book-sound";
  const MASTER_VOLUME = .7;
  let ctx = null;
  let master = null;
  let room = null;
  let drag = null;
  let muted = false;
  try { muted = window.localStorage.getItem(STORAGE_KEY) === "off"; } catch { /* storage unavailable */ }

  const rand = (min, max) => min + Math.random() * (max - min);
  const white = () => Math.random() * 2 - 1;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /* ---- Tiny DSP toolkit (RBJ biquads, run in place) --------------------- */

  function biquad(type, frequency, q, gainDb = 0) {
    const sr = ctx.sampleRate;
    const w0 = 2 * Math.PI * Math.min(frequency, sr * .45) / sr;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const A = 10 ** (gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
    else if (type === "highpass") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
    else if (type === "bandpass") { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
    else { b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  function filter(data, ...stages) {
    for (const [type, frequency, q, gain] of stages) {
      const [b0, b1, b2, a1, a2] = biquad(type, frequency, q, gain);
      let z1 = 0;
      let z2 = 0;
      for (let i = 0; i < data.length; i += 1) {
        const x = data[i];
        const y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        data[i] = y;
      }
    }
    return data;
  }

  // Smooth random wobble (cosine-interpolated points every 10–35 ms).
  function flutter(length, depth) {
    const sr = ctx.sampleRate;
    const out = new Float32Array(length);
    let i = 0;
    let from = Math.random();
    while (i < length) {
      const span = Math.floor(sr * rand(.01, .035));
      const to = Math.random();
      for (let j = 0; j < span && i < length; j += 1, i += 1) {
        const t = (1 - Math.cos(Math.PI * j / span)) / 2;
        out[i] = 1 - depth + depth * 2 * (from + (to - from) * t);
      }
      from = to;
    }
    return out;
  }

  // Sparse clicks whose rate (per second) and size follow shape(u), u = 0..1.
  function crinkle(data, start, length, maxRate, size, shape, longest = .005) {
    const sr = ctx.sampleRate;
    let t = 0;
    const seconds = length / sr;
    while (t < seconds) {
      t += -Math.log(1 - Math.random()) / maxRate;
      const u = t / seconds;
      if (u >= 1) break;
      const density = shape(u);
      if (Math.random() > density) continue;           // thinning: rate follows shape
      const grain = Math.floor(sr * (.0005 + Math.random() ** 2 * longest));
      const amp = size * density * (.2 + Math.random() ** 3 * 1.8);
      const decay = grain / 3;
      const at = start + Math.floor(t * sr);
      for (let j = 0; j < grain && at + j < data.length; j += 1) {
        data[at + j] += white() * amp * Math.exp(-j / decay);
      }
    }
  }

  // Bend of the sheet over the turn: rises fast, peaks ~40%, eases out.
  const bend = (u) => (u < .4
    ? Math.sin((u / .4) * Math.PI / 2) ** 1.6
    : Math.cos(((u - .4) / .6) * Math.PI / 2) ** 1.25);

  function mixInto(data, layer, gain, start = 0) {
    for (let i = 0; i < layer.length && start + i < data.length; i += 1) data[start + i] += layer[i] * gain;
  }

  function normalize(data, peak) {
    let max = 0;
    for (let i = 0; i < data.length; i += 1) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) for (let i = 0; i < data.length; i += 1) data[i] *= peak / max;
    // Tiny fades so a buffer never clicks at its edges.
    const fade = Math.min(64, data.length >> 2);
    for (let i = 0; i < fade; i += 1) { data[i] *= i / fade; data[data.length - 1 - i] *= i / fade; }
    return data;
  }

  /* ---- Sound recipes ---------------------------------------------------- */

  // Soft paper-on-paper landing with a smaller bounce just after.
  function flap(data, at, level) {
    const sr = ctx.sampleRate;
    const length = Math.floor(sr * .09);
    const hit = new Float32Array(length);
    const bounce = Math.floor(sr * rand(.018, .03));
    for (let i = 0; i < length; i += 1) {
      const first = Math.exp(-i / (sr * .012));
      const second = i > bounce ? .35 * Math.exp(-(i - bounce) / (sr * .008)) : 0;
      hit[i] = white() * (first + second);
    }
    filter(hit, ["lowpass", rand(1800, 2600), .7], ["peaking", rand(380, 520), 1, 5]);
    mixInto(data, hit, level, at);
    crinkle(data, at, Math.floor(sr * .05), 260, .05 * level, (u) => 1 - u, .002);
  }

  function renderPage(seconds, level, lifted) {
    const sr = ctx.sampleRate;
    const length = Math.floor(sr * seconds);
    const tail = Math.floor(sr * .12);
    const data = new Float32Array(length + tail);
    const wobble = flutter(length, .55);

    // Rustle: bright friction noise that flutters with the sheet.
    const rustle = new Float32Array(length);
    for (let i = 0; i < length; i += 1) rustle[i] = white() * bend(i / length) * wobble[i];
    filter(rustle, ["highpass", rand(800, 1100), .7], ["peaking", rand(3200, 4600), .8, 6], ["lowpass", rand(9000, 11000), .7]);
    mixInto(data, rustle, .55);

    // Crinkle: micro-clicks clustered where the bend is sharpest.
    const crisp = new Float32Array(length);
    crinkle(crisp, 0, length, 520, .9, (u) => bend(u) ** 1.3);
    filter(crisp, ["highpass", 1400, .7], ["lowpass", 9500, .7]);
    mixInto(data, crisp, 1);

    // Air: the low whoosh of the moving sheet.
    const air = new Float32Array(length);
    for (let i = 0; i < length; i += 1) air[i] = white() * bend(i / length) ** 2;
    filter(air, ["lowpass", rand(380, 520), .7], ["lowpass", 600, .7]);
    mixInto(data, air, .9);

    // Peel: stick-slip as the page leaves the one beneath it.
    if (lifted) crinkle(data, 0, Math.floor(sr * .07), 420, .5, (u) => 1 - u, .003);

    flap(data, Math.floor(length * .96), .42);
    return normalize(data, .55 * level);
  }

  function renderBoard(seconds, level) {
    const sr = ctx.sampleRate;
    const length = Math.floor(sr * seconds);
    const data = new Float32Array(length + Math.floor(sr * .2));
    const motion = (u) => Math.sin(Math.PI * Math.min(1, u / .95)) ** 1.4;

    // Cloth rub and sparse spine crackle as the hinge flexes.
    const rub = new Float32Array(length);
    for (let i = 0; i < length; i += 1) rub[i] = white() * motion(i / length) * .5;
    crinkle(rub, 0, Math.floor(length * .45), 90, .7, (u) => 1 - u, .006);
    filter(rub, ["bandpass", rand(1100, 1500), .8], ["lowpass", 4000, .7]);
    mixInto(data, rub, .6);

    // A heavier board pushes more air.
    const air = new Float32Array(length);
    for (let i = 0; i < length; i += 1) air[i] = white() * motion(i / length) ** 2;
    filter(air, ["lowpass", 320, .7], ["lowpass", 420, .7]);
    mixInto(data, air, 1.4);

    // Thud: the board settling onto the page block.
    const at = Math.floor(length * .97);
    const thud = new Float32Array(Math.floor(sr * .18));
    for (let i = 0; i < thud.length; i += 1) {
      const t = i / sr;
      thud[i] = Math.sin(2 * Math.PI * 82 * t) * Math.exp(-t / .07) * .9
        + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / .035) * .45
        + white() * Math.exp(-t / .012) * .5;
    }
    filter(thud, ["lowpass", 1400, .7]);
    mixInto(data, thud, 1, at);
    crinkle(data, at + Math.floor(sr * .02), Math.floor(sr * .08), 200, .06, (u) => 1 - u, .002);
    return normalize(data, .7 * level);
  }

  // Loopable rustle bed for dragging (cross-faded so the loop is seamless).
  function renderDragBed(hard) {
    const sr = ctx.sampleRate;
    const length = sr * 3;
    const fade = Math.floor(sr * .15);
    const data = new Float32Array(length + fade);
    const wobble = flutter(data.length, .6);
    for (let i = 0; i < data.length; i += 1) data[i] = white() * wobble[i] * (hard ? .6 : .45);
    if (!hard) crinkle(data, 0, data.length, 380, .8, () => .8);
    filter(data, ...(hard
      ? [["bandpass", 900, .8], ["lowpass", 2500, .7]]
      : [["highpass", 900, .7], ["peaking", 4000, .8, 6], ["lowpass", 10000, .7]]));
    for (let i = 0; i < fade; i += 1) {
      const t = i / fade;
      data[i] = data[i] * t + data[length + i] * (1 - t);
    }
    const loop = data.subarray(0, length);
    return toBuffer(normalize(loop, .5));
  }

  function toBuffer(data) {
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    return buffer;
  }

  /* ---- Playback ---------------------------------------------------------- */

  function unlock() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      ctx = new AudioContextClass();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 2.5;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(compressor).connect(ctx.destination);

      // A whisper of room so the paper sounds near, not inside your head.
      const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * .16), ctx.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = ir.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1) data[i] = white() * Math.exp(-i / (ctx.sampleRate * .03));
        filter(data, ["lowpass", 5000, .7]);
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = ir;
      room = ctx.createGain();
      room.gain.value = .16;
      room.connect(convolver).connect(master);
      prewarm();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  const ready = () => Boolean(ctx && ctx.state === "running" && !muted);

  // Play a rendered buffer, drifting across the stereo field like a page.
  function play(buffer, { pan = 0, level = 1, when = ctx.currentTime + .005 } = {}) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    let out = source;
    if (level !== 1) {
      const gain = ctx.createGain();
      gain.gain.value = level;
      out = out.connect(gain);
    }
    if (ctx.createStereoPanner && pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, when);
      panner.pan.linearRampToValueAtTime(-pan, when + buffer.duration * .9);
      out = out.connect(panner);
    }
    out.connect(master);
    out.connect(room);
    source.start(when);
    return source;
  }

  /*
    One complete turn, matched to the animation.
    duration  seconds the visual turn takes
    hard      true for a hardcover board
    level     overall loudness (riffles and snap-backs are quieter)
    lifted    false when continuing from a drag (the corner is already up)
  */
  function turn({ duration = .85, hard = false, level = 1, lifted = true } = {}) {
    if (!ready()) return;
    play(take(hard, Math.max(.15, duration), lifted), { pan: hard ? .15 : .3, level });
  }

  /*
    Rendering takes ~10 ms, too long for the frame a turn starts in, so a
    few variations of the common turn lengths are rendered ahead in idle
    time. Lengths are bucketed to 50 ms; anything unusual renders live.
  */
  const pool = new Map();
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2000 }) : window.setTimeout(fn, 250));
  const bucket = (seconds) => Math.round(seconds * 20) / 20;
  const poolKey = (hard, seconds, lifted) => `${hard ? "board" : "page"}:${bucket(seconds)}:${hard ? "" : lifted}`;
  const render = (hard, seconds, lifted) => toBuffer(hard ? renderBoard(seconds, 1) : renderPage(seconds, 1, lifted));

  function refill(hard, seconds, lifted) {
    const key = poolKey(hard, seconds, lifted);
    const list = pool.get(key) || [];
    pool.set(key, list);
    if (list.length >= 3 || list.filling) return;
    list.filling = true;
    idle(() => {
      list.filling = false;
      if (!ctx) return;
      list.push(render(hard, bucket(seconds), lifted));
      if (list.length < 3) refill(hard, seconds, lifted);
    });
  }

  function take(hard, seconds, lifted) {
    const list = pool.get(poolKey(hard, seconds, lifted));
    const buffer = list?.length ? list.shift() : render(hard, bucket(seconds), lifted);
    refill(hard, seconds, lifted);
    return buffer;
  }

  // Turn lengths used by script.js: button turns, cover, and riffles.
  function prewarm() {
    refill(false, .85, true);
    refill(true, 1.05, false);
    refill(false, .62, true);
    refill(true, .8, false);
    idle(() => { beds ??= { soft: renderDragBed(false), hard: renderDragBed(true) }; });
  }

  function peel() {
    if (!ready()) return;
    const sr = ctx.sampleRate;
    const data = new Float32Array(Math.floor(sr * .08));
    crinkle(data, 0, data.length, 500, .6, (u) => 1 - u, .003);
    filter(data, ["highpass", 1500, .7]);
    play(toBuffer(normalize(data, .16)));
  }

  // Continuous rustle while the reader holds the page.
  let beds = null;
  function dragStart(hard = false) {
    if (!ready() || drag) return;
    beds ??= { soft: renderDragBed(false), hard: renderDragBed(true) };
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = hard ? beds.hard : beds.soft;
    source.loop = true;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = hard ? 1200 : 3000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(tone).connect(gain);
    gain.connect(master);
    gain.connect(room);
    source.start(now, Math.random() * 2);
    drag = { source, tone, gain, hard };
    if (!hard) peel();
  }

  // speed: pointer speed in px/ms. Faster drags are louder and brighter.
  function dragMove(speed) {
    if (!drag || !ctx) return;
    const now = ctx.currentTime;
    const amount = clamp(Math.abs(speed) / 1.4, 0, 1);
    drag.gain.gain.setTargetAtTime((drag.hard ? .35 : .9) * amount ** .8, now, .04);
    drag.tone.frequency.setTargetAtTime((drag.hard ? 700 : 2200) + amount * (drag.hard ? 1500 : 9000), now, .05);
  }

  function dragEnd() {
    if (!drag || !ctx) { drag = null; return; }
    const { source, gain } = drag;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .035);
    source.stop(now + .3);
    drag = null;
  }

  function setMuted(value) {
    muted = Boolean(value);
    try { window.localStorage.setItem(STORAGE_KEY, muted ? "off" : "on"); } catch { /* storage unavailable */ }
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, .05);
    if (muted) dragEnd();
  }

  // Unlock audio on the first gesture of any kind (iOS needs a tap/click).
  ["pointerdown", "pointerup", "click", "keydown", "touchend"].forEach((type) => {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  });

  window.BookSound = {
    turn, peel, dragStart, dragMove, dragEnd, setMuted, unlock,
    get muted() { return muted; },
    get running() { return Boolean(ctx && ctx.state === "running"); },
  };
})();
