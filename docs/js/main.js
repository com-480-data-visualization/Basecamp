const CHAPTERS = {
  himalayas: "The Himalayas",
  conquest: "The Conquest",
  "the-turn": "The Turn",
  "the-cost": "The Cost",
};

const DATA = {};
let activeChapter = null;

const vizModules = {
  conquest: window.vizRoutes,
  "the-turn": window.vizGrowth,
  "the-cost": window.vizCost,
};

// Ch.1 cinematic elements
const ch1 = {
  container: null,
  imageWrap: null,
  textWide: null,
  textZoom: null,
};

const FADE_MS = 280;

function showChapter(chapter, substep, graphic, label) {
  if (chapter === activeChapter) {
    // Same chapter, different substep — just update in place
    if (vizModules[chapter] && vizModules[chapter].update) {
      vizModules[chapter].update(substep);
    }
    return;
  }

  graphic.style.opacity = "0";

  setTimeout(() => {
    // hide previous
    if (activeChapter && vizModules[activeChapter]) {
      vizModules[activeChapter].hide();
    }
    ch1.container.classList.toggle("active", chapter === "himalayas");

    activeChapter = chapter;

    // update graphic background and label
    graphic.dataset.active = chapter;
    const hasVisual = vizModules[chapter] || chapter === "himalayas" || chapter === "conquest";
    label.style.display = hasVisual ? "none" : "";
    label.textContent = CHAPTERS[chapter];

    // Enable pointer-events on viz-container only when D3 charts are active
    const vizCont = document.getElementById("viz-container");
    vizCont.style.pointerEvents = vizModules[chapter] && chapter !== "conquest" ? "auto" : "none";

    if (vizModules[chapter]) {
      vizModules[chapter].show(substep);
    }

    graphic.style.opacity = "1";
  }, FADE_MS);
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

Promise.all([
  d3.json("data/deaths.json"),
  d3.json("data/yearly_stats.json"),
  d3.json("data/routes_2.json"),
]).then(([deaths, yearly, routes]) => {
  DATA.deaths = deaths;
  DATA.yearly = yearly;
  DATA.routes = routes;

  // Ch.1 cinematic refs
  ch1.container = document.getElementById("ch1-cinematic");
  ch1.imageWrap = document.getElementById("ch1-image-wrap");
  ch1.textWide = document.getElementById("ch1-text-wide");
  ch1.textZoom = document.getElementById("ch1-text-zoom");

  const vizContainer = document.getElementById("viz-container");
  vizModules["conquest"].init(document.getElementById("ch2-conquest"), routes);
  vizModules["the-turn"].init(vizContainer, yearly);
  vizModules["the-cost"].init(vizContainer, deaths);

  initScrollama();
});
