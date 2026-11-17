const pageSections = [...document.querySelectorAll(".page-view")];
let pageTransitioning = false;
let stepLetterScreen = null;
let setLetterScreen = null;

function showPage(pageNumber, direction = 0) {
  const targetPage = pageSections.find((page) => page.dataset.page === String(pageNumber));
  const currentPage = pageSections.find((page) => !page.hidden);
  if (!targetPage || !currentPage || targetPage === currentPage || pageTransitioning) return false;

  const slideDirection = direction || (Number(targetPage.dataset.page) > Number(currentPage.dataset.page) ? 1 : -1);
  const incomingClass = slideDirection > 0 ? "slide-from-right" : "slide-from-left";
  const outgoingClass = slideDirection > 0 ? "slide-out-left" : "slide-out-right";
  pageTransitioning = true;
  targetPage.hidden = false;
  targetPage.setAttribute("aria-hidden", "false");
  currentPage.setAttribute("aria-hidden", "true");
  targetPage.classList.add("is-sliding-in", incomingClass);
  currentPage.classList.add("is-sliding-out", outgoingClass);
  void targetPage.offsetWidth;
  targetPage.scrollTop = 0;
  window.requestAnimationFrame(() => targetPage.classList.remove(incomingClass));

  let finished = false;
  const finishTransition = () => {
    if (finished) return;
    finished = true;
    currentPage.hidden = true;
    currentPage.classList.remove("is-sliding-out", outgoingClass);
    targetPage.classList.remove("is-sliding-in");
    pageTransitioning = false;
  };
  targetPage.addEventListener("transitionend", (event) => {
    if (event.target === targetPage && event.propertyName === "transform") finishTransition();
  }, { once: true });
  window.setTimeout(finishTransition, 520);
  return true;
}

function navigateStory(direction) {
  if (pageTransitioning) return;
  const activePage = pageSections.find((page) => !page.hidden);
  if (!activePage) return;
  const currentNumber = Number(activePage.dataset.page);

  if (currentNumber === 3 && stepLetterScreen?.(direction)) return;
  if (currentNumber === 4 && direction < 0) setLetterScreen?.(6);
  const destination = currentNumber + direction;
  if (destination >= 1 && destination <= 5) showPage(destination, direction);
}

const ignoredGestureTarget = (target) => target instanceof Element && target.closest(
  "button, a, input, textarea, select, option, [contenteditable='true'], [role='button']",
);

let gestureStart = null;
const gestureSurface = document.getElementById("site-pages");
gestureSurface?.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || ignoredGestureTarget(event.target)) return;
  gestureStart = { id: event.pointerId, x: event.clientX, y: event.clientY, pointerType: event.pointerType };
});
gestureSurface?.addEventListener("pointerup", (event) => {
  if (!gestureStart || gestureStart.id !== event.pointerId) return;
  const start = gestureStart;
  gestureStart = null;
  if (window.getSelection()?.toString()) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const threshold = start.pointerType === "mouse" ? 85 : 48;
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.35 || Math.abs(dy) > 110) return;
  navigateStory(dx < 0 ? 1 : -1);
});
gestureSurface?.addEventListener("pointercancel", () => { gestureStart = null; });

document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || window.getSelection()?.toString()) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    navigateStory(event.key === "ArrowRight" ? 1 : -1);
  }
});

function addFloatingParticles(containerSelector, particleCount, heartEvery, durationRange) {
  const field = document.querySelector(containerSelector);
  if (!field) return;

  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement("span");
    const isHeart = index % heartEvery === 0;
    const isPetal = containerSelector === ".page3-particles" && !isHeart && index % 3 === 0;
    const prefix = containerSelector === ".particles"
      ? ""
      : containerSelector.replace("-particles", "").replace(".", "");
    const particleClass = prefix ? `${prefix}-particle` : "particle";
    particle.className = `${particleClass}${isHeart ? ` ${particleClass}--heart` : ""}${isPetal ? ` ${particleClass}--petal` : ""}`;
    particle.setAttribute("aria-hidden", "true");
    if (isHeart) particle.textContent = "♥";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.setProperty("--size", isHeart ? `${9 + Math.random() * 9}px` : isPetal ? `${8 + Math.random() * 7}px` : `${2 + Math.random() * 3}px`);
    particle.style.setProperty("--duration", `${durationRange[0] + Math.random() * durationRange[1]}s`);
    particle.style.setProperty("--delay", `${-Math.random() * 24}s`);
    particle.style.setProperty("--drift", `${Math.round(Math.random() * 64 - 32)}px`);
    particle.style.setProperty("--opacity", `${0.25 + Math.random() * 0.45}`);
    field.append(particle);
  }
}

const isSmallScreen = window.matchMedia("(max-width: 700px)").matches;
addFloatingParticles(".particles", isSmallScreen ? 16 : 26, 6, [12, 14]);
addFloatingParticles(".page2-particles", isSmallScreen ? 10 : 18, 4, [15, 12]);
addFloatingParticles(".page3-particles", 18, 4, [17, 13]);
addFloatingParticles(".page4-particles", isSmallScreen ? 10 : 18, 4, [17, 13]);
addFloatingParticles(".page10-particles", isSmallScreen ? 12 : 22, 5, [16, 14]);

// Turn the existing Page 3 letter nodes into seven in-page screens without
// copying or editing any of the original letter text.
const page3Scene = document.querySelector(".page3-scene");
const page3Paper = document.querySelector(".page3-paper");

if (page3Scene && page3Paper) {
  const letterHeading = page3Paper.querySelector(":scope > .page3-letter-heading");
  const letterSections = [...page3Paper.querySelectorAll(":scope > .page3-letter-section")];
  const letterParagraphs = [...page3Paper.querySelectorAll("p, blockquote")]
    .filter((node) => !node.classList.contains("page3-eyebrow"));
  const screenTitles = [
    "Nee Santhosham – Naa Santhosham",
    "Nee Father's Love",
    "Nee Family – Naa Family",
    "Mana Beautiful Memories",
    "Mana Future, Mana Dreams",
    "Trust, Understanding & Respect",
    "Forever – I Choose You",
  ];
  // Paragraph nodes are moved intact. These thematic groups balance the
  // longest original sections so every chapter can fit a single viewport.
  const paragraphGroups = [
    [0, 1, 2, 3, 4, 5, 6, 52, 55],
    [7, 8, 9, 10, 11, 49, 56, 57],
    [12, 13, 14, 15, 16, 17, 18, 19],
    [20, 21, 22, 24, 25, 26, 27, 28, 29],
    [23, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 53, 54],
    [58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68],
  ];
  const createDivider = () => {
    const divider = document.createElement("div");
    divider.className = "page3-paper-divider";
    divider.setAttribute("aria-hidden", "true");
    divider.innerHTML = "<span></span><b>♡</b><span></span>";
    return divider;
  };
  const screens = screenTitles.map((title, index) => {
    const screen = document.createElement("section");
    screen.className = `page3-part page3-part--${index + 1}${index === 0 ? " is-active" : ""}`;
    const heading = index === 0
      ? document.createElement("h2")
      : letterSections[index - 1].querySelector("h2");
    heading.classList.add("page3-part-title");
    if (index === 0) {
      heading.id = "page3-part-1-title";
      heading.textContent = title;
    }
    screen.setAttribute("aria-labelledby", heading.id);
    screen.append(heading, createDivider());
    if (index === 0) {
      screen.append(letterHeading);
      letterHeading.hidden = true;
    }
    for (const paragraphIndex of paragraphGroups[index]) {
      const paragraph = letterParagraphs[paragraphIndex];
      if (paragraph) screen.append(paragraph);
    }
    screen.append(createDivider());
    return screen;
  });

  page3Paper.querySelectorAll("p > strong").forEach((promise) => {
    if (!promise.closest(".page3-salutation")) promise.classList.add("page3-promise-highlight");
  });

  page3Paper.replaceChildren(...screens);
  let activeScreen = 0;
  const showLetterScreen = (nextIndex, direction = 1) => {
    if (nextIndex < 0 || nextIndex >= screens.length) return;
    screens[activeScreen].classList.remove("is-active", "letter-slide-from-left", "letter-slide-from-right");
    activeScreen = nextIndex;
    const activeSection = screens[activeScreen];
    activeSection.classList.add("is-active", direction > 0 ? "letter-slide-from-right" : "letter-slide-from-left");
    window.setTimeout(() => activeSection.classList.remove("letter-slide-from-left", "letter-slide-from-right"), 420);
    page3Scene.dataset.letterPart = String(activeScreen + 1);
  };
  stepLetterScreen = (direction) => {
    const nextIndex = activeScreen + direction;
    if (nextIndex < 0 || nextIndex >= screens.length) return false;
    showLetterScreen(nextIndex, direction);
    return true;
  };
  setLetterScreen = (index) => showLetterScreen(index, index >= activeScreen ? 1 : -1);
  page3Scene.dataset.letterPart = "1";
}

const yesButton = document.getElementById("proposal-accept-yes");
const noButton = document.getElementById("noButton");

noButton?.addEventListener("click", (event) => {
  event.preventDefault();
  const noPageUrl = new URL("./no.html", window.location.href);
  window.location.assign(noPageUrl.href);
});

yesButton?.addEventListener("click", () => {
  const acceptanceUrl = new URL("./accepted.html", window.location.href);
  window.location.assign(acceptanceUrl.href);
});

const requestedPage = window.location.hash.match(/^#page-([1-5])$/);
if (requestedPage) showPage(Number(requestedPage[1]));
