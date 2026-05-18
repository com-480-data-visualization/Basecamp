window.vizRoutes = (function () {
  let container = null;
  let routes = null;
  let routeByLabel = null;

  let mapEl = null;
  let statusEl = null;
  let routeItemsByLabel = null;
  let clearBtn = null;
  let recordEl = null;

  let everestApi = null;
  let everestPromise = null;
  let currentLabel = null;
  let wantsAnimation = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    const full = value.length === 3
      ? value.split("").map((ch) => ch + ch).join("")
      : value;
    const intValue = parseInt(full, 16);
    return {
      r: ((intValue >> 16) & 255) / 255,
      g: ((intValue >> 8) & 255) / 255,
      b: (intValue & 255) / 255,
    };
  }

  function rgbToHex({ r, g, b }) {
    const parts = [r, g, b].map((value) => {
      return Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0");
    });
    return `#${parts.join("")}`;
  }

  function rgbToHsl({ r, g, b }) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };

    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;

    return { h, s: d / (1 - Math.abs(2 * l - 1)), l };
  }

  function hueToRgb(p, q, t) {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  }

  function hslToRgb({ h, s, l }) {
    if (s === 0) return { r: l, g: l, b: l };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: hueToRgb(p, q, h + 1 / 3),
      g: hueToRgb(p, q, h),
      b: hueToRgb(p, q, h - 1 / 3),
    };
  }

  function routeDisplayColor(color, active = false) {
    const hsl = rgbToHsl(hexToRgb(color));
    if (hsl.l < 0.05) return active ? "#2d281f" : "#4a4132";

    const saturation = active ? 0.78 : 0.52;
    const lightnessScale = active ? 0.88 : 0.72;
    const lightnessOffset = active ? 0.08 : 0.04;
    const maxLightness = active ? 0.66 : 0.58;

    return rgbToHex(hslToRgb({
      h: hsl.h,
      s: clamp(hsl.s * saturation, 0.18, active ? 0.86 : 0.64),
      l: clamp(hsl.l * lightnessScale + lightnessOffset, 0.32, maxLightness),
    }));
  }

  function makeSwatch(color) {
    const s = document.createElement("span");
    s.className = "ch2-route-swatch";
    s.style.background = color;
    return s;
  }

  function routeName(route) {
    return route.label.replace(/^\d{4}\s*/, "");
  }

  function appendText(parent, tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function init(el, data) {
    container = el;
    routes = data.routes;
    routeByLabel = Object.fromEntries(routes.map((r) => [r.label, r]));
    buildDOM();
  }

  function buildDOM() {
    container.innerHTML = "";
    routeItemsByLabel = {};

    mapEl = document.createElement("div");
    mapEl.className = "ch2-map";
    container.appendChild(mapEl);

    statusEl = document.createElement("div");
    statusEl.className = "ch2-map-status";
    statusEl.textContent = "Loading terrain…";
    mapEl.appendChild(statusEl);

    const indexEl = document.createElement("nav");
    indexEl.className = "ch2-route-index";
    indexEl.setAttribute("aria-label", "Everest route index");
    indexEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    container.appendChild(indexEl);

    const indexHeader = document.createElement("div");
    indexHeader.className = "ch2-index-header";
    indexEl.appendChild(indexHeader);

    appendText(indexHeader, "h3", "ch2-index-title", "Route index");
    appendText(
      indexHeader,
      "p",
      "ch2-index-intro",
      "Sixteen major Everest route lines, ordered by first ascent or attempt."
    );

    const routeList = document.createElement("div");
    routeList.className = "ch2-route-list";
    indexEl.appendChild(routeList);

    const sorted = [...routes].sort((a, b) => a.year - b.year);
    sorted.forEach((route, i) => {
      const btn = document.createElement("button");
      btn.className = "ch2-route-row";
      btn.type = "button";
      btn.setAttribute("aria-pressed", "false");
      appendText(btn, "span", "ch2-route-number", String(i + 1).padStart(2, "0"));
      appendText(btn, "span", "ch2-route-year", route.year);
      const nameWrap = document.createElement("span");
      nameWrap.className = "ch2-route-name";
      nameWrap.appendChild(makeSwatch(routeDisplayColor(route.color_hex)));
      appendText(nameWrap, "span", "ch2-route-label", routeName(route));
      btn.appendChild(nameWrap);
      appendText(btn, "span", "ch2-route-state", "");
      btn.addEventListener("click", () => setSelectedRoute(route.label));
      routeList.appendChild(btn);
      routeItemsByLabel[route.label] = btn;
    });

    const panelEl = document.createElement("div");
    panelEl.className = "ch2-panel";
    panelEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    container.appendChild(panelEl);

    const panelHead = document.createElement("div");
    panelHead.className = "ch2-panel-head";
    panelEl.appendChild(panelHead);
    appendText(panelHead, "div", "ch2-panel-kicker", "Selected route");

    clearBtn = document.createElement("button");
    clearBtn.className = "ch2-clear-btn";
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.hidden = true;
    clearBtn.addEventListener("click", () => setSelectedRoute(null));
    panelHead.appendChild(clearBtn);

    recordEl = document.createElement("div");
    recordEl.className = "ch2-route-record";
    panelEl.appendChild(recordEl);

    mapEl.addEventListener("route-selected", (e) => {
      setSelectedRoute(e.detail.label);
    });
    mapEl.addEventListener("route-deselected", () => {
      setSelectedRoute(null);
    });

    setSelectedRoute(null);
  }

  function waitForEverest3D(timeoutMs = 8000) {
    if (window.Everest3D) return Promise.resolve(window.Everest3D);
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (window.Everest3D) { resolve(window.Everest3D); return; }
        if (performance.now() - start > timeoutMs) {
          reject(new Error("Everest3D module did not load in time"));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function ensure3D() {
    if (everestPromise) return everestPromise;
    everestPromise = waitForEverest3D()
      .then((mod) => mod.create(mapEl, { routes }))
      .then((api) => {
        everestApi = api;
        if (statusEl && statusEl.parentNode) statusEl.parentNode.removeChild(statusEl);
        if (currentLabel) api.setSelected(currentLabel);
        return api;
      })
      .catch((err) => {
        console.error("Failed to init Everest 3D:", err);
        if (statusEl) {
          statusEl.textContent = "3D terrain unavailable: " + (err && err.message ? err.message : err);
        }
        return null;
      });
    return everestPromise;
  }

  function setSelectedRoute(label) {
    if (label === currentLabel) {
      renderSelection(label);
      return;
    }
    currentLabel = label;
    renderSelection(label);
    if (everestApi) everestApi.setSelected(label);
  }

  function renderSelection(label) {
    const route = label ? routeByLabel[label] : null;
    for (const [itemLabel, item] of Object.entries(routeItemsByLabel)) {
      const selected = itemLabel === label;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    clearBtn.hidden = !route;
    renderRecord(route);
  }

  function renderRecord(route) {
    recordEl.replaceChildren();

    if (!route) {
      appendText(recordEl, "div", "ch2-record-year", "1924-1996");
      appendText(recordEl, "h3", "ch2-record-title", "Select a route");
      appendText(
        recordEl,
        "p",
        "ch2-record-note",
        "Choose a line from the route index or from the mountain."
      );
      return;
    }

    const color = routeDisplayColor(route.color_hex, true);
    const heading = document.createElement("div");
    heading.className = "ch2-record-heading";
    heading.appendChild(makeSwatch(color));
    appendText(heading, "div", "ch2-record-year", String(route.year));
    recordEl.appendChild(heading);

    appendText(recordEl, "h3", "ch2-record-title", routeName(route));
    appendText(recordEl, "p", "ch2-record-note", route.note);
  }

  function show() {
    if (!container) return;
    container.style.display = "flex";
    wantsAnimation = true;
    ensure3D().then((api) => {
      if (!api || !wantsAnimation) return;
      api.resize();
      api.start();
    });
  }

  function hide() {
    if (container) container.style.display = "none";
    wantsAnimation = false;
    if (everestApi) everestApi.stop();
  }

  return { init, show, hide };
})();
