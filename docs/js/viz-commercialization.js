// Section 05 "The Business": commercialization wall.
// Same visual grammar as viz-growth.js (section 3) — stacked small-multiple
// panels on a shared year axis, colored direct-labels, dashed disaster lines.
// The four panels are grouped into two pairs that the scroll reveals in turn.
// NOTE: the group classes `turn-panel-commercial` / `turn-panel-risk` are reused
// verbatim from section 3 so the existing substep dimming CSS applies with no
// new styles; here they mean "the client" (substep 0) and "support & payoff"
// (substep 1), not commercial/risk.
window.vizCommercial = (function () {
  let container;
  let data;
  let wall;
  let activeSubstep = 0;
  let resizeTimer = null;

  const YEAR_MIN = 1970;
  const YEAR_MAX = 2017;
  const EVENTS = [{ year: 1996 }, { year: 2014 }, { year: 2015 }];

  const COLORS = {
    ink: "#1d1c1a",
    muted: "#6f6a61",
    rule: "#d8d2c7",
    faintRule: "#e8e2d8",
    age: "#4778a8",
    oxygen: "#9b7622",
    oxygenFill: "rgba(241, 200, 75, 0.18)",
    hired: "#6f332f",
    success: "#6b8e4e",
    successFill: "rgba(107, 142, 78, 0.16)",
  };

  function init(cont, rows) {
    container = cont;
    data = rows
      .filter((d) => +d.year >= YEAR_MIN && +d.year <= YEAR_MAX)
      .map((d) => ({
        year: +d.year,
        age: +d.age,
        oxygen: +d.oxygen_pct,
        hired: +d.hired_pct,
        success: +d.success_pct,
      }));

    window.addEventListener("resize", handleResize);
  }

  function show(substep = 0) {
    if (!container || !data) return;
    activeSubstep = normalizeSubstep(substep);
    render();
  }

  function update(substep = 0) {
    activeSubstep = normalizeSubstep(substep);
    if (!wall) return;
    wall.dataset.substep = String(activeSubstep);
  }

  function hide() {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    if (container) container.innerHTML = "";
    wall = null;
  }

  function normalizeSubstep(substep) {
    return Number.isFinite(+substep) ? Math.max(0, Math.min(1, +substep)) : 0;
  }

  function handleResize() {
    if (!wall) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  }

  function render() {
    if (!container || !data) return;

    container.innerHTML = "";
    wall = document.createElement("section");
    wall.className = "turn-wall commercial-wall";
    wall.dataset.substep = String(activeSubstep);
    wall.setAttribute("aria-label", "The Business charts");

    const body = document.createElement("div");
    body.className = "turn-wall-body";

    const chartStack = document.createElement("div");
    chartStack.className = "turn-chart-stack";
    const panels = makePanels();
    panels.forEach((panel, index) => {
      const panelEl = document.createElement("section");
      panelEl.className = `turn-chart-panel ${panel.groupClass}`;
      panelEl.dataset.key = panel.key;

      const header = document.createElement("div");
      header.className = "turn-panel-header";

      const title = document.createElement("h3");
      title.className = "turn-panel-title";
      title.textContent = panel.title;

      const label = document.createElement("span");
      label.className = "turn-direct-label";
      label.style.color = panel.color;
      label.textContent = panel.directLabel;

      const plot = document.createElement("div");
      plot.className = "turn-panel-plot";

      header.appendChild(title);
      header.appendChild(label);
      panelEl.appendChild(header);
      panelEl.appendChild(plot);
      chartStack.appendChild(panelEl);
      panel.node = panelEl;
      panel.plotNode = plot;
      panel.isLast = index === panels.length - 1;
    });

    const source = document.createElement("p");
    source.className = "turn-source";
    source.innerHTML =
      "<span>Dashed lines mark 1996 disaster, 2014 avalanche, 2015 earthquake.</span>" +
      "<span>Source: Himalayan Database.</span>" +
      "<span>Clients only; excludes hired staff.</span>";

    body.appendChild(chartStack);
    body.appendChild(source);
    wall.appendChild(body);
    container.appendChild(wall);

    // Fade the wall in (matching The Cost) so the instant The Cost -> The Business
    // swap doesn't pop; section 5 is entered without the graphic crossfade.
    requestAnimationFrame(() => { if (wall) wall.classList.add("is-visible"); });

    drawChart(panels);
  }

  function drawChart(panels) {
    const drawn = panels.map((panel) => {
      const plotNode = panel.plotNode;
      const width = plotNode.clientWidth || 320;
      const height = plotNode.clientHeight || 120;
      const compact = width < 560 || height < 120;
      const margin = {
        top: compact ? 6 : 8,
        right: compact ? 10 : 14,
        bottom: panel.isLast ? (compact ? 24 : 28) : 8,
        left: compact ? 42 : 58,
      };
      const chartW = Math.max(160, width - margin.left - margin.right);
      const chartH = Math.max(44, height - margin.top - margin.bottom);
      const svg = d3
        .select(plotNode)
        .append("svg")
        .attr("class", "turn-chart")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

      const group = svg
        .append("g")
        .attr("class", `turn-panel turn-panel-${panel.key}`)
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, chartW]);
      const { y, values } = drawPanel(group, panel, x, chartW, chartH, {
        compact,
        isLast: panel.isLast,
      });
      const hoverApi = createHoverLayer(group, panel, x, y, chartW, chartH, compact);
      return { group, panel, x, y, values, width: chartW, height: chartH, hoverApi };
    });
    attachPanelHover(drawn);
  }

  function makePanels() {
    const last = data[data.length - 1];
    const maxOf = (key) => d3.max(data, (d) => d[key]);

    return [
      {
        key: "age",
        groupClass: "turn-panel-commercial",
        title: "Average age of clients",
        value: (d) => d.age,
        domain: [25, Math.ceil(maxOf("age") / 5) * 5],
        nice: false,
        color: COLORS.age,
        type: "line",
        tickFormat: d3.format("d"),
        valueFormat: (v) => `${v.toFixed(1)} yrs`,
        directLabel: `${Math.round(last.age)} yrs in ${last.year}`,
      },
      {
        key: "oxygen",
        groupClass: "turn-panel-commercial",
        title: "Supplemental oxygen use",
        value: (d) => d.oxygen,
        domain: [0, maxOf("oxygen")],
        color: COLORS.oxygen,
        fill: COLORS.oxygenFill,
        type: "area",
        tickFormat: (d) => d3.format(".0f")(d) + "%",
        valueFormat: formatPct,
        directLabel: `${Math.round(last.oxygen)}% in ${last.year}`,
      },
      {
        key: "hired",
        groupClass: "turn-panel-risk",
        title: "Hired-staff share of climbers",
        value: (d) => d.hired,
        domain: [0, maxOf("hired")],
        color: COLORS.hired,
        type: "line",
        tickFormat: (d) => d3.format(".0f")(d) + "%",
        valueFormat: formatPct,
        directLabel: `${Math.round(last.hired)}% in ${last.year}`,
      },
      {
        key: "success",
        groupClass: "turn-panel-risk",
        title: "Summit success rate",
        value: (d) => d.success,
        domain: [0, maxOf("success")],
        color: COLORS.success,
        fill: COLORS.successFill,
        type: "area",
        tickFormat: (d) => d3.format(".0f")(d) + "%",
        valueFormat: formatPct,
        directLabel: `${Math.round(last.success)}% in ${last.year}`,
      },
    ];
  }

  function drawPanel(g, panel, x, width, height, options) {
    const y = d3.scaleLinear().domain(panel.domain).range([height, 0]);
    if (panel.nice !== false) y.nice();
    const values = data.filter((d) => Number.isFinite(panel.value(d)));
    const ticks = options.compact ? 2 : 3;

    g.append("g")
      .attr("class", "turn-y-axis")
      .call(
        d3
          .axisLeft(y)
          .ticks(ticks)
          .tickSize(-width)
          .tickPadding(7)
          .tickFormat(panel.tickFormat)
      )
      .call((sel) => {
        sel.select(".domain").remove();
        sel.selectAll(".tick line").attr("stroke", COLORS.faintRule);
        sel.selectAll(".tick text").attr("fill", COLORS.muted);
      });

    g.append("line")
      .attr("class", "turn-panel-rule")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", height)
      .attr("y2", height);

    drawEventLines(g, x, width, height);

    if (panel.type === "area") {
      g.append("path")
        .datum(values)
        .attr("class", "turn-area")
        .attr("fill", panel.fill)
        .attr(
          "d",
          d3
            .area()
            .x((d) => x(d.year))
            .y0(height)
            .y1((d) => y(panel.value(d)))
        );
    }

    g.append("path")
      .datum(values)
      .attr("class", "turn-line")
      .attr("fill", "none")
      .attr("stroke", panel.color)
      .attr("d", lineFor(x, y, panel.value));

    if (options.isLast) {
      g.append("g")
        .attr("class", "turn-x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(options.compact ? 5 : 8))
        .call((sel) => {
          sel.select(".domain").attr("stroke", COLORS.rule);
          sel.selectAll(".tick line").attr("stroke", COLORS.rule);
          sel.selectAll(".tick text").attr("fill", COLORS.muted);
        });
    }

    return { y, values };
  }

  function createHoverLayer(g, panel, x, y, width, height, compact) {
    const layer = g.append("g")
      .attr("class", "turn-hover")
      .style("display", "none")
      .style("pointer-events", "none");

    const guide = layer.append("line")
      .attr("class", "turn-hover-line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", COLORS.ink)
      .attr("stroke-opacity", 0.45)
      .attr("stroke-width", 1);

    const dot = layer.append("circle")
      .attr("class", "turn-hover-dot")
      .attr("r", 3.5)
      .attr("fill", panel.color)
      .attr("stroke", "#f7f1e4")
      .attr("stroke-width", 1.5);

    const labelGroup = layer.append("g").attr("class", "turn-hover-label");
    const labelBg = labelGroup.append("rect")
      .attr("fill", "rgba(28, 26, 22, 0.94)")
      .attr("rx", 3);
    const yearText = labelGroup.append("text")
      .attr("class", "turn-hover-year")
      .attr("fill", "#cfc6ad")
      .attr("font-size", compact ? 9 : 10)
      .attr("font-family", "Inter, system-ui, sans-serif")
      .attr("dominant-baseline", "hanging");
    const valueText = labelGroup.append("text")
      .attr("class", "turn-hover-value")
      .attr("fill", "#f3efe7")
      .attr("font-size", compact ? 11 : 12)
      .attr("font-weight", 600)
      .attr("font-family", "Inter, system-ui, sans-serif")
      .attr("dominant-baseline", "hanging");

    return {
      show(d) {
        const px = x(d.year);
        const py = y(panel.value(d));
        layer.style("display", null);
        guide.attr("x1", px).attr("x2", px);
        dot.attr("cx", px).attr("cy", py);
        const fmt = (panel.valueFormat || panel.tickFormat)(panel.value(d));
        const padX = 6;
        const padY = 4;
        const lineGap = 2;
        yearText.attr("x", padX).attr("y", padY).text(d.year);
        const yearBox = yearText.node().getBBox();
        valueText.attr("x", padX).attr("y", padY + yearBox.height + lineGap).text(fmt);
        const valueBox = valueText.node().getBBox();
        const labelW = Math.max(yearBox.width, valueBox.width) + padX * 2;
        const labelH = padY * 2 + yearBox.height + lineGap + valueBox.height;
        const flipX = px + 10 + labelW > width;
        let tx = flipX ? px - 10 - labelW : px + 10;
        tx = Math.max(0, Math.min(width - labelW, tx));
        const ty = Math.max(0, Math.min(height - labelH, py - labelH / 2));
        labelGroup.attr("transform", `translate(${tx}, ${ty})`);
        labelBg.attr("x", 0).attr("y", 0).attr("width", labelW).attr("height", labelH);
      },
      hide() {
        layer.style("display", "none");
      },
    };
  }

  function attachPanelHover(drawn) {
    const bisect = d3.bisector((d) => d.year).left;

    drawn.forEach((d) => {
      const overlay = d.group.append("rect")
        .attr("class", "turn-hover-overlay")
        .attr("width", d.width)
        .attr("height", d.height)
        .attr("fill", "transparent")
        .style("pointer-events", "all")
        .style("cursor", "crosshair");
      overlay
        .on("pointermove", function (event) {
          const [mx] = d3.pointer(event, this);
          const year = d.x.invert(mx);
          const i = bisect(d.values, year);
          const left = d.values[i - 1];
          const right = d.values[i];
          const nearest = !left ? right
            : !right ? left
            : Math.abs(year - left.year) <= Math.abs(year - right.year) ? left : right;
          if (nearest) d.hoverApi.show(nearest);
        })
        .on("pointerleave", () => d.hoverApi.hide());
    });
  }

  function drawEventLines(g, x, width, height) {
    EVENTS.forEach((event) => {
      const xv = x(event.year);
      if (xv < 0 || xv > width) return;

      g.append("line")
        .attr("class", "turn-event-line")
        .attr("x1", xv)
        .attr("x2", xv)
        .attr("y1", 0)
        .attr("y2", height);
    });
  }

  function lineFor(x, y, value) {
    return d3
      .line()
      .defined((d) => Number.isFinite(value(d)))
      .x((d) => x(d.year))
      .y((d) => y(value(d)));
  }

  function formatPct(value) {
    return d3.format(".1f")(value).replace(".0", "") + "%";
  }

  return { init, show, update, hide };
})();
