window.vizRoutes = (function () {
  let container, routes;
  let svgPromise;
  let detailEl = null;

  function makeSwatch(color) {
    const s = document.createElement("span");
    s.style.cssText = `display:inline-block;flex-shrink:0;width:10px;height:10px;border-radius:50%;background:${color};border:1px solid rgba(0,0,0,0.18);`;
    return s;
  }

  function init(el, data) {
    container = el;
    routes = data.routes;
    svgPromise = fetch("img/everest_routes_2.svg").then((r) => r.text());
  }

  function show() {
    if (!container || !routes) return;
    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.height = "100%";
    buildContent();
  }

  function hide() {
    if (container) {
      container.innerHTML = "";
      container.style.display = "none";
    }
  }

  async function buildContent() {
    // Left: map
    const mapEl = document.createElement("div");
    mapEl.className = "ch2-map";
    container.appendChild(mapEl);

    // Right: info panel
    const panelEl = document.createElement("div");
    panelEl.className = "ch2-panel";
    container.appendChild(panelEl);

    const title = document.createElement("div");
    title.className = "ch2-panel-title";
    title.textContent = "Climbing Everest";
    panelEl.appendChild(title);

    const intro = document.createElement("p");
    intro.className = "ch2-panel-intro";
    intro.textContent =
      "From 1921 to 1996, expeditions approached from every face — north, south, east, west. Each new route was a different answer to the same problem. Select a route to read its story.";
    panelEl.appendChild(intro);

    const sorted = [...routes].sort((a, b) => a.year - b.year);

    const dropEl = document.createElement("div");
    dropEl.className = "ch2-dropdown";
    panelEl.appendChild(dropEl);

    const triggerSwatch = makeSwatch("transparent");
    triggerSwatch.style.border = "none";
    const triggerLabel = document.createElement("span");
    triggerLabel.className = "ch2-dropdown-label";
    triggerLabel.textContent = "Select a route\u2026";
    const triggerArrow = document.createElement("span");
    triggerArrow.className = "ch2-dropdown-arrow";
    triggerArrow.textContent = "\u25BE";

    const trigger = document.createElement("div");
    trigger.className = "ch2-dropdown-trigger";
    trigger.appendChild(triggerSwatch);
    trigger.appendChild(triggerLabel);
    trigger.appendChild(triggerArrow);
    dropEl.appendChild(trigger);

    const optList = document.createElement("div");
    optList.className = "ch2-dropdown-list";
    dropEl.appendChild(optList);

    sorted.forEach((route) => {
      const opt = document.createElement("div");
      opt.className = "ch2-dropdown-option";
      opt.appendChild(makeSwatch(route.color_hex));
      const lbl = document.createElement("span");
      lbl.textContent = `${route.year} \u2014 ${route.team}`;
      opt.appendChild(lbl);
      opt.addEventListener("click", () => {
        triggerSwatch.style.background = route.color_hex;
        triggerSwatch.style.border = "1px solid rgba(0,0,0,0.18)";
        triggerLabel.textContent = `${route.year} \u2014 ${route.team}`;
        optList.classList.remove("open");
        detailEl.innerHTML = `<strong>${route.label}</strong><br><br>${route.note}`;
        detailEl.classList.add("has-content");
      });
      optList.appendChild(opt);
    });

    trigger.addEventListener("click", () => optList.classList.toggle("open"));
    document.addEventListener("click", (e) => {
      if (!dropEl.contains(e.target)) optList.classList.remove("open");
    });

    detailEl = document.createElement("div");
    detailEl.className = "ch2-route-detail";
    panelEl.appendChild(detailEl);

    // Load and inject SVG
    try {
      const svgText = await svgPromise;
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, "image/svg+xml");

      // Remove legend layer before extracting svg
      const legendLayer = doc.getElementById("layer7");
      if (legendLayer) legendLayer.remove();

      // Belt-and-suspenders: remove any remaining French legend text
      doc.querySelectorAll("text").forEach((el) => {
        const t = el.textContent;
        if (
          t.includes("Sommet") ||
          t.includes("Camp de base") ||
          t.includes("Voies") ||
          t.includes("ascensions")
        ) {
          el.remove();
        }
      });

      const svg = doc.querySelector("svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("viewBox", "0 0 1207.5 730");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.pointerEvents = "none";

      mapEl.appendChild(svg);
    } catch (e) {
      console.error("Failed to load route map:", e);
      mapEl.textContent = "Map unavailable.";
    }
  }


  return { init, show, hide };
})();
