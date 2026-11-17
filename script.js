const pageSections = [...document.querySelectorAll(".page-view")];
const totalBookPages = pageSections.length + 6;
let pageTransitioning = false;
let stepLetterPage = null;

// Browsers only allow fullscreen after a user gesture. Request it on the
// visitor's first interaction, so the first tap/click that starts the story
// also enters fullscreen where the browser supports it.
let fullscreenRequested = false;
async function requestStoryFullscreen() {
  if (fullscreenRequested) return false;
  fullscreenRequested = true;
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (request) {
    try {
      await request.call(root);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const fullscreenWelcome = document.getElementById("fullscreen-welcome");
const bookControls = document.getElementById("book-controls");
const bookProgress = document.getElementById("book-progress");
let activeLetterPageIndex = 0;

function updateBookProgress() {
  const activePage = pageSections.find((page) => !page.hidden);
  if (!activePage || !bookProgress) return;
  const pageNumber = Number(activePage.dataset.page);
  const bookPageNumber = pageNumber === 3
    ? pageNumber + activeLetterPageIndex
    : pageNumber > 3
      ? pageNumber + 6
      : pageNumber;
  bookProgress.textContent = `Page ${bookPageNumber} of ${totalBookPages}`;
}

document.getElementById("fullscreen-start")?.addEventListener("click", async () => {
  await requestStoryFullscreen();
  if (fullscreenWelcome) {
    fullscreenWelcome.classList.add("is-opening");
    window.setTimeout(() => { fullscreenWelcome.hidden = true; }, 540);
  }
  if (bookControls) bookControls.hidden = false;
  updateBookProgress();
});

document.getElementById("book-previous")?.addEventListener("click", () => navigateStory(-1));
document.getElementById("book-next")?.addEventListener("click", () => navigateStory(1));

function clearLivePageDrag(element) {
  if (!element?.classList.contains("is-live-dragging")) return;
  element.classList.remove("is-live-dragging");
  element.style.transition = "";
  element.style.transform = "";
  element.style.transformOrigin = "";
  element.style.filter = "";
}

function showPage(pageNumber, direction = 0) {
  const targetPage = pageSections.find((page) => page.dataset.page === String(pageNumber));
  const currentPage = pageSections.find((page) => !page.hidden);
  if (!targetPage || !currentPage || targetPage === currentPage || pageTransitioning) return false;

  const slideDirection = direction || (Number(targetPage.dataset.page) > Number(currentPage.dataset.page) ? 1 : -1);
  const incomingClass = slideDirection > 0 ? "slide-from-right" : "slide-from-left";
  const outgoingClass = slideDirection > 0 ? "slide-out-left" : "slide-out-right";
  const turnClass = slideDirection > 0 ? "book-turn-forward" : "book-turn-backward";
  pageTransitioning = true;
  targetPage.hidden = false;
  targetPage.setAttribute("aria-hidden", "false");
  currentPage.setAttribute("aria-hidden", "true");
  targetPage.classList.add("is-sliding-in", incomingClass, slideDirection > 0 ? "book-page-under-forward" : "book-page-under-backward");
  currentPage.classList.add("is-sliding-out", outgoingClass, turnClass);
  void targetPage.offsetWidth;
  clearLivePageDrag(currentPage);
  targetPage.scrollTop = 0;
  window.requestAnimationFrame(() => {
    targetPage.classList.remove(incomingClass);
  });

  let finished = false;
  const finishTransition = () => {
    if (finished) return;
    finished = true;
    currentPage.hidden = true;
    currentPage.classList.remove("is-sliding-out", outgoingClass, turnClass);
    targetPage.classList.remove("is-sliding-in", "book-page-under-forward", "book-page-under-backward");
    pageTransitioning = false;
    updateBookProgress();
  };
  currentPage.addEventListener("animationend", (event) => {
    if (event.target === currentPage && event.animationName.startsWith("real-page-")) finishTransition();
  }, { once: true });
  window.setTimeout(finishTransition, 1050);
  return true;
}

function navigateStory(direction) {
  if (pageTransitioning) return false;
  const activePage = pageSections.find((page) => !page.hidden);
  if (!activePage) return false;
  const currentNumber = Number(activePage.dataset.page);

  if (currentNumber === 3 && stepLetterPage?.(direction)) return true;
  const destination = currentNumber + direction;
  if (destination >= 1 && destination <= 5) return showPage(destination, direction);
  return false;
}

const ignoredGestureTarget = (target) => target instanceof Element && target.closest(
  "button, a, input, textarea, select, option, [contenteditable='true'], [role='button']",
);

let gestureStart = null;
const gestureSurface = document.getElementById("site-pages");
gestureSurface?.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || ignoredGestureTarget(event.target)) return;
  const activePage = pageSections.find((page) => !page.hidden);
  const dragElement = activePage?.dataset.page === "3"
    ? activePage.querySelector(".page3-part.is-active")
    : activePage;
  gestureStart = { id: event.pointerId, x: event.clientX, y: event.clientY, pointerType: event.pointerType, dragElement };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
});
gestureSurface?.addEventListener("pointermove", (event) => {
  if (!gestureStart || gestureStart.id !== event.pointerId || !gestureStart.dragElement) return;
  const dx = event.clientX - gestureStart.x;
  const dy = event.clientY - gestureStart.y;
  if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
  const progress = Math.min(1, Math.abs(dx) / Math.max(window.innerWidth, 1));
  const angle = Math.round(progress * 148) * (dx < 0 ? -1 : 1);
  const sheet = gestureStart.dragElement;
  sheet.classList.add("is-live-dragging");
  sheet.style.transition = "none";
  sheet.style.transformOrigin = dx < 0 ? "left center" : "right center";
  sheet.style.transform = `rotateY(${angle}deg) rotateZ(${dx < 0 ? "-.8deg" : ".8deg"})`;
  sheet.style.filter = `brightness(${1 - progress * .36})`;
});
gestureSurface?.addEventListener("pointerup", (event) => {
  if (!gestureStart || gestureStart.id !== event.pointerId) return;
  const start = gestureStart;
  gestureStart = null;
  if (window.getSelection()?.toString()) {
    resetLivePageDrag(start.dragElement);
    return;
  }
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const threshold = start.pointerType === "mouse" ? 85 : Math.max(48, window.innerWidth * .2);
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.35 || Math.abs(dy) > 110) {
    resetLivePageDrag(start.dragElement);
    return;
  }
  if (!navigateStory(dx < 0 ? 1 : -1)) resetLivePageDrag(start.dragElement);
});
function resetLivePageDrag(element) {
  if (!element?.classList.contains("is-live-dragging")) return;
  element.style.transition = "transform 260ms ease, filter 260ms ease";
  element.style.transform = "rotateY(0deg)";
  element.style.filter = "brightness(1)";
  window.setTimeout(() => clearLivePageDrag(element), 280);
}
gestureSurface?.addEventListener("pointercancel", () => {
  resetLivePageDrag(gestureStart?.dragElement);
  gestureStart = null;
});

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

// Turn the existing Page 3 letter nodes into seven book pages without
// copying or editing any of the original letter text.
const page3Scene = document.querySelector(".page3-scene");
const page3Paper = document.querySelector(".page3-paper");

if (page3Scene && page3Paper) {
  const letterHeading = page3Paper.querySelector(":scope > .page3-letter-heading");
  const letterSections = [...page3Paper.querySelectorAll(":scope > .page3-letter-section")];
  const letterParagraphs = [...page3Paper.querySelectorAll("p, blockquote")]
    .filter((node) => !node.classList.contains("page3-eyebrow"));
  const pageTitles = [
    "Nee Santhosham – Naa Santhosham",
    "Nee Father's Love",
    "Nee Family – Naa Family",
    "Mana Beautiful Memories",
    "Mana Future, Mana Dreams",
    "Trust, Understanding & Respect",
    "Forever – I Choose You",
  ];
  // Paragraph nodes are moved intact. These groups balance the page lengths.
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
  const letterPages = pageTitles.map((title, index) => {
    const letterPage = document.createElement("section");
    letterPage.className = `page3-part page3-part--${index + 1}${index === 0 ? " is-active" : ""}`;
    const heading = index === 0
      ? document.createElement("h2")
      : letterSections[index - 1].querySelector("h2");
    heading.classList.add("page3-part-title");
    if (index === 0) {
      heading.id = "page3-part-1-title";
      heading.textContent = title;
    }
    letterPage.setAttribute("aria-labelledby", heading.id);
    letterPage.setAttribute("aria-hidden", String(index !== 0));
    letterPage.append(heading, createDivider());
    if (index === 0) {
      letterPage.append(letterHeading);
      letterHeading.hidden = true;
    }
    for (const paragraphIndex of paragraphGroups[index]) {
      const paragraph = letterParagraphs[paragraphIndex];
      if (paragraph) letterPage.append(paragraph);
    }
    letterPage.append(createDivider());
    return letterPage;
  });

  page3Paper.querySelectorAll("p > strong").forEach((promise) => {
    if (!promise.closest(".page3-salutation")) promise.classList.add("page3-promise-highlight");
  });

  page3Paper.replaceChildren(...letterPages);
  const showLetterPage = (nextIndex, direction = 1) => {
    if (nextIndex < 0 || nextIndex >= letterPages.length || nextIndex === activeLetterPageIndex || pageTransitioning) return;
    pageTransitioning = true;
    const outgoingPage = letterPages[activeLetterPageIndex];
    activeLetterPageIndex = nextIndex;
    const activePage = letterPages[activeLetterPageIndex];
    const turnClass = direction > 0 ? "book-turn-forward" : "book-turn-backward";
    const underPageClass = direction > 0 ? "book-page-under-forward" : "book-page-under-backward";
    outgoingPage.classList.add("is-sliding-out", turnClass);
    activePage.classList.add("is-active", underPageClass);
    activePage.setAttribute("aria-hidden", "false");
    outgoingPage.setAttribute("aria-hidden", "true");
    void activePage.offsetWidth;
    clearLivePageDrag(outgoingPage);
    window.setTimeout(() => {
      outgoingPage.classList.remove("is-active", "is-sliding-out", turnClass);
      activePage.classList.remove(underPageClass);
      pageTransitioning = false;
    }, 1050);
    outgoingPage.addEventListener("animationend", (event) => {
      if (event.target !== outgoingPage || !event.animationName.startsWith("real-page-")) return;
      outgoingPage.classList.remove("is-active", "is-sliding-out", turnClass);
      activePage.classList.remove(underPageClass);
      pageTransitioning = false;
    }, { once: true });
    updateBookProgress();
    page3Scene.dataset.letterPage = String(activeLetterPageIndex + 1);
  };
  stepLetterPage = (direction) => {
    const nextIndex = activeLetterPageIndex + direction;
    if (nextIndex < 0 || nextIndex >= letterPages.length) return false;
    showLetterPage(nextIndex, direction);
    return true;
  };
  page3Scene.dataset.letterPage = "1";
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
