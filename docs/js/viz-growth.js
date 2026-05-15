window.vizGrowth = (function () {
  let container;
  let data;
  let wall;
  let activeSubstep = 0;
  let resizeTimer = null;

  const YEAR_MIN = 1950;
  const YEAR_MAX = 2017;
  const EVENTS = [
    { year: 1996 },
    { year: 2014 },
    { year: 2015 },
  ];

  const COLORS = {
    ink: "#1d1c1a",
    muted: "#6f6a61",
    rule: "#d8d2c7",
    faintRule: "#e8e2d8",
    agency: "#9b7622",
    agencyFill: "rgba(241, 200, 75, 0.18)",
    expedition: "#4778a8",
    death: "#9f3d35",
    rate: "#6f332f",
  };

  function init(cont, yearly) {
    container = cont;
    data = yearly
      .filter((d) => +d.year >= YEAR_MIN && +d.year <= YEAR_MAX)
      .map((d) => ({
        year: +d.year,
        expeditions: +d.total_expeditions,
        deaths: +d.total_deaths,
        deathRate: +d.death_rate * 100,
        agencyPct: +d.agency_pct * 100,
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
    wall.className = "turn-wall";
    wall.dataset.substep = String(activeSubstep);
    wall.setAttribute("aria-label", "The Turn charts");

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
      "<span>Source: Himalayan Database.</span>";

    body.appendChild(chartStack);
    body.appendChild(source);
    wall.appendChild(body);
    container.appendChild(wall);

    drawChart(panels);
  }

  function drawChart(panels) {
    panels.forEach((panel) => {
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
      drawPanel(group, panel, x, chartW, chartH, {
        compact,
        isLast: panel.isLast,
      });
    });
  }

  function makePanels() {
    const last = data[data.length - 1];

    return [
      {
        key: "agency",
        groupClass: "turn-panel-commercial",
        title: "Trekking agency use (%)",
        value: (d) => d.agencyPct,
        domain: [0, 100],
        color: COLORS.agency,
        fill: COLORS.agencyFill,
        type: "area",
        tickFormat: (d) => d3.format(".0f")(d) + "%",
        directLabel: formatPct(last.agencyPct) + " in 2017",
      },
      {
        key: "expeditions",
        groupClass: "turn-panel-commercial",
        title: "Expeditions per year",
        value: (d) => d.expeditions,
        domain: [0, d3.max(data, (d) => d.expeditions)],
        color: COLORS.expedition,
        type: "line",
        tickFormat: d3.format("d"),
        directLabel: "about 10x since the 1970s",
      },
      {
        key: "deaths",
        groupClass: "turn-panel-risk",
        title: "Deaths per year",
        value: (d) => d.deaths,
        domain: [0, d3.max(data, (d) => d.deaths)],
        color: COLORS.death,
        type: "bars",
        opacity: 0.5,
        tickFormat: d3.format("d"),
        directLabel: "disaster years",
      },
      {
        key: "death-rate",
        groupClass: "turn-panel-risk",
        title: "Death rate",
        value: (d) => d.deathRate,
        domain: [0, d3.max(data, (d) => d.deathRate)],
        color: COLORS.rate,
        type: "line",
        tickFormat: (d) => d3.format(".0f")(d) + "%",
        directLabel: "rate fell by the 2010s",
      },
    ];
  }

  function drawPanel(g, panel, x, width, height, options) {
    const y = d3.scaleLinear().domain(panel.domain).nice().range([height, 0]);
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

    if (panel.type === "bars") {
      const barW = Math.max(1.5, width / data.length - 0.8);
      g.selectAll(".turn-bar")
        .data(values)
        .join("rect")
        .attr("class", "turn-bar")
        .attr("x", (d) => x(d.year) - barW / 2)
        .attr("y", (d) => y(panel.value(d)))
        .attr("width", barW)
        .attr("height", (d) => height - y(panel.value(d)))
        .attr("fill", panel.color)
        .attr("opacity", panel.opacity || 1);
    } else {
      g.append("path")
        .datum(values)
        .attr("class", "turn-line")
        .attr("fill", "none")
        .attr("stroke", panel.color)
        .attr("d", lineFor(x, y, panel.value));
    }

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
