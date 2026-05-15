const CHAPTERS = {
  himalayas: "The Himalayas",
  conquest: "The Conquest",
  "turn-transition": "",
  "the-turn": "The Turn",
  "the-cost": "The Cost",
};

const FINAL_IMAGE_SRC = "img/himalayas_space_view.jpg";
const DATA = {};
let activeChapter = null;

const vizModules = {
  conquest: window.vizRoutes,
  "the-turn": window.vizGrowth,
  "the-cost": window.vizCost,
};

let ch1Atlas = null;

const FADE_MS = 280;
let chapterTransitionTimer = null;
let chapterTransitionId = 0;

function isPaperChartChapter(chapter) {
  return chapter === "the-turn" || chapter === "the-cost";
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
]).then(([deaths, yearly, routes]) => {
  DATA.deaths = deaths;
  DATA.yearly = yearly;
  DATA.routes = routes;

  ch1Atlas = document.getElementById("ch1-atlas");

  const vizContainer = document.getElementById("viz-container");
  vizModules["conquest"].init(document.getElementById("ch2-conquest"), routes);
  vizModules["the-turn"].init(vizContainer, yearly);
  vizModules["the-cost"].init(vizContainer, deaths);

  initScrollama();
});
