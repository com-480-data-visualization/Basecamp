// Hold the visitor at the intro until the atlas image behind "The Himalayas"
// has decoded, so it never reveals mid-load.
(function gateIntroScroll() {
  const root = document.documentElement;
  if (!root.classList.contains("is-loading")) return;

  const release = () => root.classList.remove("is-loading");
  const atlas = document.querySelector(".ch1-atlas-image");

  if (atlas && atlas.decode) {
    atlas.decode().then(release, release);
  } else if (atlas && !atlas.complete) {
    atlas.addEventListener("load", release, { once: true });
    atlas.addEventListener("error", release, { once: true });
  } else {
    release();
  }

  // Backstop: never trap the visitor if the image stalls or fails to load.
  setTimeout(release, 8000);
})();

const CHAPTERS = {
  himalayas: "The Himalayas",
  conquest: "The Conquest",
  "turn-transition": "",
  "the-turn": "The Turn",
  "the-cost": "The Cost",
  "the-commercial": "The Business",
};

const FINAL_IMAGE_SRC = "img/himalayas_space_view.jpg";
const DATA = {};
let activeChapter = null;

const vizModules = {
  conquest: window.vizRoutes,
  "the-turn": window.vizGrowth,
  "the-cost": window.vizCost,
  "the-commercial": window.vizCommercial,
};

let ch1Atlas = null;

const FADE_MS = 280;
let chapterTransitionTimer = null;
let chapterTransitionId = 0;

function isPaperChartChapter(chapter) {
  return chapter === "the-turn" || chapter === "the-cost" || chapter === "the-commercial";
}

function showChapter(chapter, substep, graphic, label) {
  if (chapter === activeChapter && !chapterTransitionTimer) {
    if (vizModules[chapter] && vizModules[chapter].update) {
      vizModules[chapter].update(substep);
    }
    return;
  }

  const transitionId = ++chapterTransitionId;
  if (chapterTransitionTimer) {
    clearTimeout(chapterTransitionTimer);
    chapterTransitionTimer = null;
  }

  function commitChapter() {
    if (transitionId !== chapterTransitionId) return;

    if (activeChapter && vizModules[activeChapter]) {
      vizModules[activeChapter].hide();
    }
    ch1Atlas.classList.toggle("active", chapter === "himalayas");

    activeChapter = chapter;

    graphic.dataset.active = chapter;
    const hasVisual = vizModules[chapter] || chapter === "himalayas" || chapter === "conquest" || chapter === "turn-transition";
    label.style.display = hasVisual ? "none" : "";
    label.textContent = CHAPTERS[chapter];

    const vizCont = document.getElementById("viz-container");
    vizCont.style.pointerEvents = vizModules[chapter] && chapter !== "conquest" ? "auto" : "none";

    if (vizModules[chapter]) {
      vizModules[chapter].show(substep);
    }

    graphic.style.opacity = "1";
    chapterTransitionTimer = null;
  }

  if (activeChapter === null) {
    commitChapter();
    return;
  }

  if (isPaperChartChapter(activeChapter) && isPaperChartChapter(chapter)) {
    commitChapter();
    return;
  }

  graphic.style.opacity = "0";
  chapterTransitionTimer = setTimeout(commitChapter, FADE_MS);
}

function initScrollama() {
  const graphic = document.getElementById("graphic");
  const label = graphic.querySelector(".graphic-label");

  const scroller = scrollama();

  scroller
    .setup({
      step: ".step",
      offset: 0.5,
    })
    .onStepEnter(({ element }) => {
      const chapter = element.dataset.chapter;
      const substep = element.dataset.substep !== undefined ? +element.dataset.substep : 0;
      document.querySelectorAll(".step").forEach((s) => s.classList.remove("is-active"));
      element.classList.add("is-active");
      showChapter(chapter, substep, graphic, label);
    });

  window.addEventListener("resize", scroller.resize);
}

function initFinalImagePlate() {
  const image = document.getElementById("closing-image-plate");
  if (image) {
    image.src = FINAL_IMAGE_SRC;
  }
}

initFinalImagePlate();

Promise.all([
  d3.json("data/deaths.json"),
  d3.json("data/yearly_stats.json"),
  d3.json("data/routes_2.json?v=route-notes-1"),
  d3.json("data/commercialization.json?v=commercial-1"),
]).then(([deaths, yearly, routes, commercial]) => {
  DATA.deaths = deaths;
  DATA.yearly = yearly;
  DATA.routes = routes;
  DATA.commercial = commercial;

  ch1Atlas = document.getElementById("ch1-atlas");

  const vizContainer = document.getElementById("viz-container");
  vizModules["conquest"].init(document.getElementById("ch2-conquest"), routes);
  vizModules["the-turn"].init(vizContainer, yearly);
  vizModules["the-cost"].init(vizContainer, deaths);
  vizModules["the-commercial"].init(vizContainer, commercial);

  initScrollama();
});
