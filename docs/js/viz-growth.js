window.vizGrowth = (function () {
  let container, data;

  function init(cont, yearly) {
    container = cont;
    data = yearly
      .filter((d) => +d.year >= 1950 && +d.year <= 2017)
      .map((d) => ({
        year: +d.year,
        expeditions: +d.total_expeditions,
        deaths: +d.total_deaths,
        deathRate: +d.death_rate * 100,
      }));
  }

  function show() {
    if (!container || !data) return;
    container.innerHTML = "";

    const width = container.clientWidth;
    const height = container.clientHeight;

    const margin = { top: 80, right: 90, bottom: 46, left: 62 };
    const gap = 18;
    const w = width - margin.left - margin.right;
    const panelH = Math.floor(
      (height - margin.top - margin.bottom - 2 * gap) / 3
    );

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("overflow", "visible");

    // ── Title + subtitle ──
    svg
      .append("text")
      .attr("x", margin.left)
      .attr("y", 22)
      .style("font-size", "15px")
      .style("font-weight", "700")
      .style("fill", "#1a1a1a")
      .text("Expeditions, deaths, and death rate, 1950\u20132017");

    svg
      .append("text")
      .attr("x", margin.left)
      .attr("y", 44)
      .style("font-size", "12px")
      .style("fill", "#888")
      .text(
        "All Himalayan peaks. Death rate = deaths per 100 members."
      );

    // ── Shared x scale ──
    const x = d3.scaleLinear().domain([1950, 2017]).range([0, w]);

    const EVENTS = [
      { year: 1996, label: "1996 disaster" },
      { year: 2014, label: "2014 avalanche" },
      { year: 2015, label: "2015 earthquake" },
    ];

    // ── Panel 1: Expeditions (line) ──
    const y1 = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.expeditions)])
      .nice()
      .range([panelH, 0]);
    const g1 = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    renderPanel(g1, w, panelH, y1, x, EVENTS, true, (d) =>
      d3.format("d")(d)
    );
    g1.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#5C86AE")
      .attr("stroke-width", 1.5)
      .attr(
        "d",
        d3
          .line()
          .x((d) => x(d.year))
          .y((d) => y1(d.expeditions))
      );
    addLabel(g1, "Expeditions", 18);

    // ── Panel 2: Deaths (bars) ──
    const y2 = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.deaths)])
      .nice()
      .range([panelH, 0]);
    const g2 = svg
      .append("g")
      .attr(
        "transform",
        `translate(${margin.left},${margin.top + panelH + gap})`
      );
    renderPanel(g2, w, panelH, y2, x, EVENTS, false, (d) =>
      d3.format("d")(d)
    );
    const barW = Math.max(2, w / data.length - 0.5);
    g2
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => x(d.year) - barW / 2)
      .attr("y", (d) => y2(d.deaths))
      .attr("width", barW)
      .attr("height", (d) => panelH - y2(d.deaths))
      .attr("fill", "#c25a5a")
      .attr("opacity", 0.65);
    addLabel(g2, "Deaths", 18);

    // ── Panel 3: Death rate (line) ──
    const y3 = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.deathRate)])
      .nice()
      .range([panelH, 0]);
    const g3 = svg
      .append("g")
      .attr(
        "transform",
        `translate(${margin.left},${margin.top + 2 * (panelH + gap)})`
      );
    renderPanel(g3, w, panelH, y3, x, EVENTS, false, (d) =>
      d3.format(".0f")(d) + "%"
    );
    g3.append("path")
      .datum(data.filter((d) => d.deathRate != null && !isNaN(d.deathRate)))
      .attr("fill", "none")
      .attr("stroke", "#943232")
      .attr("stroke-width", 1.5)
      .attr(
        "d",
        d3
          .line()
          .x((d) => x(d.year))
          .y((d) => y3(d.deathRate))
      );
    addLabel(g3, "Death rate (%)", 18);

    // X axis on bottom of panel 3 only
    g3
      .append("g")
      .attr("transform", `translate(0,${panelH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8))
      .call((sel) => {
        sel.select(".domain").attr("stroke", "#ddd");
        sel.selectAll(".tick line").attr("stroke", "#ddd");
        sel
          .selectAll(".tick text")
          .style("font-size", "12px")
          .style("fill", "#777");
      });

    // ── Source note ──
    svg
      .append("text")
      .attr("x", margin.left)
      .attr("y", height - 4)
      .style("font-size", "11px")
      .style("fill", "#bbb")
      .text(
        "Source: Himalayan Database. Dashed lines mark 1996 disaster, 2014 avalanche, 2015 earthquake."
      );
  }

  function renderPanel(g, w, panelH, y, x, events, showLabels, fmt) {
    // Y axis + gridlines
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-w)
          .tickPadding(6)
          .tickFormat(fmt)
      )
      .call((sel) => {
        sel.select(".domain").remove();
        sel.selectAll(".tick line").attr("stroke", "#eee");
        sel
          .selectAll(".tick text")
          .style("font-size", "11px")
          .style("fill", "#999");
      });

    // Bottom border
    g.append("line")
      .attr("x1", 0)
      .attr("x2", w)
      .attr("y1", panelH)
      .attr("y2", panelH)
      .attr("stroke", "#eee");

    // Event lines + labels
    events.forEach((ev, i) => {
      const xv = x(ev.year);
      g.append("line")
        .attr("x1", xv).attr("x2", xv)
        .attr("y1", 0).attr("y2", panelH)
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "3,3");

      if (showLabels) {
        // 1996: right | 2014: left | 2015: right
        const goLeft = i === 1;
        g.append("text")
          .attr("x", xv + (goLeft ? -4 : 4))
          .attr("y", 14)
          .style("font-size", "10.5px")
          .style("fill", "#aaa")
          .style("text-anchor", goLeft ? "end" : "start")
          .text(ev.label);
      }
    });
  }

  function addLabel(g, text, y = -10) {
    g.append("text")
      .attr("x", 3)
      .attr("y", y)
      .style("font-size", "12px")
      .style("font-weight", "600")
      .style("fill", "#666")
      .style("letter-spacing", "0.04em")
      .style("text-transform", "uppercase")
      .text(text);
  }

  function hide() {
    if (container) container.innerHTML = "";
  }

  return { init, show, hide };
})();
