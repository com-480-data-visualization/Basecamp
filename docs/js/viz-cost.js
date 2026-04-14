window.vizCost = (function () {
  let container, allDeaths, everestDeaths;
  let svg, g, dotsG, medianG, headerG;
  let yScale, chartW, chartH, margin;
  let currentSubstep = -1;
  let currentDataset = null; // "all" or "everest"

  const ORANGE  = "#C96A2B";
  const BLUE    = "#5C86AE";
  const NEUTRAL = "#A8A8A8";
  const TEXT    = "#2B2B2B";

  function init(cont, deathData) {
    container = cont;
    const valid = deathData
      .filter(d => d.death_height_metres != null && +d.death_height_metres >= 5000)
      .map(d => ({ ...d, alt: +d.death_height_metres, _jitter: Math.random() }));
    allDeaths = valid;
    everestDeaths = valid.filter(d => d.peak_name === "Everest");
  }

  function show(substep = 0) {
    if (!container || !allDeaths) return;
    container.innerHTML = "";
    currentSubstep = -1;
    currentDataset = null;
    buildChart();
    applySubstep(substep, false);
  }

  function update(substep) {
    applySubstep(substep, true);
  }

  function hide() {
    if (container) container.innerHTML = "";
    currentSubstep = -1;
    currentDataset = null;
  }

  // ── Build the chart scaffold (axes, labels) ─────────────────────────────
  function buildChart() {
    const W = container.clientWidth;
    const H = container.clientHeight;

    margin = { top: 72, right: 36, bottom: 90, left: 56 };
    chartW = W - margin.left - margin.right;
    chartH = H - margin.top - margin.bottom;

    yScale = d3.scaleLinear().domain([4900, 8950]).range([chartH, 0]);

    svg = d3.select(container)
      .append("svg")
      .attr("width", W)
      .attr("height", H)
      .style("overflow", "visible");

    g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Y gridlines
    [5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 8849].forEach(alt => {
      g.append("line")
        .attr("x1", 0).attr("x2", chartW)
        .attr("y1", yScale(alt)).attr("y2", yScale(alt))
        .attr("stroke", "#eee");
    });

    // Y axis labels
    [5000, 6000, 7000, 8000, 8849].forEach(alt => {
      g.append("text")
        .attr("x", -8).attr("y", yScale(alt) + 4)
        .style("font-size", "11px").style("fill", "#999").style("text-anchor", "end")
        .text(alt === 8849 ? "8,849 m" : d3.format(",d")(alt) + " m");
    });

    // Center divider
    g.append("line")
      .attr("x1", chartW * 0.5).attr("x2", chartW * 0.5)
      .attr("y1", 0).attr("y2", chartH)
      .attr("stroke", "#e0e0e0");

    // Dot and median groups
    dotsG = g.append("g");
    medianG = g.append("g");

    // Column headers (will be updated with counts)
    headerG = g.append("g");

    // Source note
    svg.append("text")
      .attr("x", margin.left).attr("y", H - 4)
      .style("font-size", "11px").style("fill", "#bbb")
      .text("Source: Himalayan Database. Dashed lines = median death altitude per group.");
  }

  // ── Render dots for a dataset ───────────────────────────────────────────
  function renderDots(deaths, colored, animated, dataChanged) {
    const T = animated ? 500 : 0;

    const hiredCenter = chartW * 0.28;
    const clientCenter = chartW * 0.68;
    const bandwidth = chartW * 0.28;

    function cx(d) {
      const center = d._role === "hired" ? hiredCenter : clientCenter;
      return center + (d._jitter - 0.5) * bandwidth;
    }
    function fill(d) {
      return colored ? (d._role === "hired" ? ORANGE : BLUE) : NEUTRAL;
    }
    const opacity = colored ? 0.6 : 0.5;

    const allDots = deaths.map(d => ({ ...d, _role: d.hired ? "hired" : "client" }));

    if (dataChanged && animated) {
      // Fade out old dots, then draw new ones
      dotsG.selectAll("circle")
        .transition().duration(T / 2).attr("opacity", 0)
        .remove()
        .end()
        .then(() => {
          dotsG.selectAll("circle").data(allDots).join("circle")
            .attr("cx", cx).attr("cy", d => yScale(d.alt))
            .attr("r", 2.8).attr("fill", fill).attr("opacity", 0)
            .transition().duration(T / 2).attr("opacity", opacity);
          bindTooltip();
        });
      return;
    }

    // Same dataset: just update colors/opacity in place
    const dots = dotsG.selectAll("circle").data(allDots);
    dots.exit().transition().duration(T).attr("opacity", 0).remove();
    const enter = dots.enter().append("circle")
      .attr("cx", cx).attr("cy", d => yScale(d.alt))
      .attr("r", 2.8).attr("fill", fill).attr("opacity", 0);
    enter.transition().duration(T).attr("opacity", opacity);
    dots.transition().duration(T).attr("fill", fill).attr("opacity", opacity);

    bindTooltip();
  }

  function bindTooltip() {
    d3.select(container).selectAll(".wp-tip").remove();
    d3.select(container).style("position", "relative");
    const tip = d3.select(container)
      .append("div").attr("class", "wp-tip")
      .style("position", "absolute").style("pointer-events", "none")
      .style("opacity", 0).style("background", "#fff")
      .style("border", "1px solid #ddd").style("border-radius", "4px")
      .style("padding", "8px 12px").style("font-size", "12px")
      .style("color", "#333").style("line-height", "1.6")
      .style("max-width", "200px").style("z-index", "10");

    dotsG.selectAll("circle")
      .on("mouseover", (_event, d) => {
        tip.html(
          `<strong>${d.death_cause || "Unknown cause"}</strong><br>` +
          `${d3.format(",d")(d.alt)} m · ${d.year}<br>` +
          `${d.peak_name} · ${d.hired ? "Hired staff" : "Client"}` +
          (d.citizenship ? `<br>${d.citizenship}` : "")
        ).style("opacity", 1);
      })
      .on("mousemove", event => {
        const r = container.getBoundingClientRect();
        tip.style("left", (event.clientX - r.left + 14) + "px")
           .style("top",  (event.clientY - r.top  - 36) + "px");
      })
      .on("mouseout", () => tip.style("opacity", 0));
  }

  // ── Render median lines ─────────────────────────────────────────────────
  function renderMedians(deaths, visible, animated) {
    const T = animated ? 500 : 0;
    medianG.selectAll("*").remove();
    if (!visible) return;

    const hired = deaths.filter(d => d.hired);
    const clients = deaths.filter(d => !d.hired);
    const medH = d3.median(hired, d => d.alt);
    const medC = d3.median(clients, d => d.alt);

    const hiredCenter = chartW * 0.28;
    const clientCenter = chartW * 0.68;
    const bandwidth = chartW * 0.28;

    [{ med: medH, cx: hiredCenter, color: ORANGE },
     { med: medC, cx: clientCenter, color: BLUE }].forEach(({ med, cx, color }) => {
      const line = medianG.append("line")
        .attr("x1", cx - bandwidth * 0.45).attr("x2", cx + bandwidth * 0.45)
        .attr("y1", yScale(med)).attr("y2", yScale(med))
        .attr("stroke", color).attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,3");

      const label = medianG.append("text")
        .attr("x", cx + bandwidth * 0.48).attr("y", yScale(med) + 4)
        .style("font-size", "11px").style("fill", color).style("font-weight", "600")
        .text(d3.format(",d")(med) + " m");

      if (animated) {
        line.attr("opacity", 0).transition().duration(T).attr("opacity", 1);
        label.attr("opacity", 0).transition().duration(T).attr("opacity", 1);
      }
    });
  }

  // ── Update column headers ───────────────────────────────────────────────
  function renderHeaders(deaths, colored, animated) {
    const T = animated ? 500 : 0;
    headerG.selectAll("*").remove();

    const nHired = deaths.filter(d => d.hired).length;
    const nClient = deaths.length - nHired;
    const hiredCenter = chartW * 0.28;
    const clientCenter = chartW * 0.68;

    const hLabel = headerG.append("text")
      .attr("x", hiredCenter).attr("y", -14)
      .style("font-size", "11px").style("font-weight", "600")
      .style("letter-spacing", "0.05em").style("text-transform", "uppercase")
      .style("fill", colored ? ORANGE : "#666").style("text-anchor", "middle")
      .text("Hired staff (" + nHired + ")");

    const cLabel = headerG.append("text")
      .attr("x", clientCenter).attr("y", -14)
      .style("font-size", "11px").style("font-weight", "600")
      .style("letter-spacing", "0.05em").style("text-transform", "uppercase")
      .style("fill", colored ? BLUE : "#666").style("text-anchor", "middle")
      .text("Clients (" + nClient + ")");

    if (animated) {
      hLabel.attr("opacity", 0).transition().duration(T).attr("opacity", 1);
      cLabel.attr("opacity", 0).transition().duration(T).attr("opacity", 1);
    }
  }

  // ── Update title/subtitle ───────────────────────────────────────────────
  function renderTitle(dataset, animated) {
    const T = animated ? 500 : 0;
    svg.selectAll(".wp-title, .wp-subtitle, .wp-subtitle2").remove();

    const isEverest = dataset === "everest";
    const deaths = isEverest ? everestDeaths : allDeaths;

    const title = isEverest
      ? "Deaths by altitude on Everest"
      : "Deaths by altitude in Himalayan expeditions";
    const sub = isEverest
      ? "Same chart, Everest only. n = " + deaths.length + "."
      : "Each dot is one death. n = " + deaths.length + ". All peaks, altitude \u2265 5,000 m.";

    const t = svg.append("text").attr("class", "wp-title")
      .attr("x", margin.left).attr("y", 24)
      .style("font-size", "15px").style("font-weight", "700").style("fill", TEXT)
      .text(title);

    const s = svg.append("text").attr("class", "wp-subtitle")
      .attr("x", margin.left).attr("y", 46)
      .style("font-size", "12px").style("fill", "#888")
      .text(sub);

    if (animated) {
      t.attr("opacity", 0).transition().duration(T).attr("opacity", 1);
      s.attr("opacity", 0).transition().duration(T).attr("opacity", 1);
    }
  }

  // ── Substep logic ───────────────────────────────────────────────────────
  // 0: All Himalayas, neutral dots
  // 1: All Himalayas, colored + medians
  // 2: Everest, colored + medians
  // 3: Everest, closing callout (death rates)
  function applySubstep(n, animated) {
    if (n === currentSubstep) return;
    currentSubstep = n;

    const dataset = n >= 2 ? "everest" : "all";
    const deaths = dataset === "everest" ? everestDeaths : allDeaths;
    const colored = n >= 1;
    const showMedians = n >= 1;
    const dataChanged = dataset !== currentDataset;
    currentDataset = dataset;

    renderTitle(dataset, animated);
    renderHeaders(deaths, colored, animated);
    renderDots(deaths, colored, animated || dataChanged, dataChanged);
    renderMedians(deaths, showMedians, animated);

    // Substep 3: death rate callout
    g.selectAll(".wp-callout").remove();
    if (n === 3) {
      const callout = g.append("g").attr("class", "wp-callout");

      const items = [
        { color: ORANGE, label: "Hired staff", rate: "2.0%", detail: "318 / 15,731 members" },
        { color: BLUE, label: "Paying clients", rate: "1.3%", detail: "788 / 60,788 members" },
      ];
      items.forEach((item, i) => {
        const cy = chartH + 28 + i * 30;
        callout.append("circle").attr("cx", 7).attr("cy", cy).attr("r", 5).attr("fill", item.color);
        callout.append("text").attr("x", 22).attr("y", cy + 5)
          .style("font-size", "15px").style("font-weight", "700").style("fill", item.color)
          .text(item.rate);
        callout.append("text").attr("x", 72).attr("y", cy + 5)
          .style("font-size", "12px").style("fill", TEXT)
          .text(item.label + " death rate");
        callout.append("text").attr("x", 72).attr("y", cy + 20)
          .style("font-size", "10px").style("fill", "#999")
          .text(item.detail + ", all peaks");
      });

      if (animated) {
        callout.attr("opacity", 0).transition().duration(500).attr("opacity", 1);
      }
    }
  }

  return { init, show, update, hide };
})();
