window.vizCost = (function () {
  let container, allDeaths, everestDeaths;
  let register, plotNode, copyTitle, statsNode;
  let svg, g, dotsG, roleG, medianG, bracketG, yScale, chartW, chartH, margin;
  let currentSubstep = -1;
  let currentDataset = null;
  let renderVersion = 0;
  let resizeTimer = null;

  const COLORS = {
    staff: "#c56f3d",
    client: "#4778a8",
    neutral: "#8f8c86",
    ink: "#1d1c1a",
    muted: "#6f6a61",
    rule: "#d8d2c7",
    faintRule: "#e8e2d8",
    death: "#9f3d35",
  };

  const ALTITUDES = [5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 8848];

  function init(cont, deathData) {
    container = cont;
    allDeaths = deathData
      .filter((d) => d.death_height_metres != null && +d.death_height_metres >= 5000)
      .map((d, index) => ({
        ...d,
        alt: +d.death_height_metres,
        _id: index,
        _jitter: stableJitter(d, index),
        _role: d.hired ? "hired" : "client",
      }));
    everestDeaths = allDeaths.filter((d) => d.peak_name === "Everest");

    window.addEventListener("resize", handleResize);
  }

  function show(substep = 0) {
    if (!container || !allDeaths) return;
    renderVersion += 1;
    container.innerHTML = "";
    currentSubstep = -1;
    currentDataset = null;
    buildRegister();
    applySubstep(substep, false);
  }

  function update(substep) {
    applySubstep(substep, true);
  }

  function hide() {
    renderVersion += 1;
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    if (container) d3.select(container).selectAll("*").interrupt();
    if (container) container.innerHTML = "";
    register = null;
    plotNode = null;
    currentSubstep = -1;
    currentDataset = null;
  }

  function buildRegister() {
    register = document.createElement("section");
    register.className = "cost-register";
    register.setAttribute("aria-label", "The Cost chart");

    const body = document.createElement("div");
    body.className = "cost-register__body";

    const intro = document.createElement("header");
    intro.className = "cost-register__intro";
    intro.innerHTML =
      "<h3>Deaths by altitude</h3>" +
      "<p>Recorded deaths with a reported altitude of 5,000 m or higher.</p>";

    const frame = document.createElement("div");
    frame.className = "cost-register__frame";

    const copy = document.createElement("div");
    copy.className = "cost-register__copy";

    copyTitle = document.createElement("h4");
    copyTitle.className = "cost-register__copy-title";

    statsNode = document.createElement("div");
    statsNode.className = "cost-register__stats";

    copy.appendChild(copyTitle);
    copy.appendChild(statsNode);

    plotNode = document.createElement("div");
    plotNode.className = "cost-register__plot";

    frame.appendChild(copy);
    frame.appendChild(plotNode);

    const footer = document.createElement("div");
    footer.className = "cost-register__footer";

    const source = document.createElement("p");
    source.className = "cost-register__source";
    source.innerHTML =
      "<span>Dashed lines = median death altitude per group.</span>" +
      "<span>Source: Himalayan Database.</span>";

    footer.appendChild(source);

    body.appendChild(intro);
    body.appendChild(frame);
    body.appendChild(footer);
    register.appendChild(body);
    container.appendChild(register);

    buildChart();
    requestAnimationFrame(() => {
      if (register) register.classList.add("is-visible");
    });
  }

  function buildChart() {
    if (!plotNode) return;
    plotNode.innerHTML = "";

    const W = Math.max(320, plotNode.clientWidth || 640);
    const H = Math.max(320, plotNode.clientHeight || 560);
    const compact = W < 560;

    margin = {
      top: compact ? 48 : 58,
      right: compact ? 78 : 128,
      bottom: compact ? 30 : 36,
      left: compact ? 50 : 66,
    };
    chartW = Math.max(180, W - margin.left - margin.right);
    chartH = Math.max(220, H - margin.top - margin.bottom);
    yScale = d3.scaleLinear().domain([4900, 8950]).range([chartH, 0]);

    svg = d3.select(plotNode)
      .append("svg")
      .attr("class", "cost-register__svg")
      .attr("width", W)
      .attr("height", H)
      .attr("viewBox", `0 0 ${W} ${H}`);

    g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    drawScaffold(compact);

    dotsG = g.append("g").attr("class", "cost-register__dots");
    roleG = g.append("g").attr("class", "cost-register__role-labels");
    medianG = g.append("g").attr("class", "cost-register__medians");
    bracketG = g.append("g").attr("class", "cost-register__bracket");
  }

  function drawScaffold(compact) {
    const bands = [
      [5000, 6000],
      [6000, 7000],
      [7000, 8000],
      [8000, 8848],
    ];

    g.selectAll(".cost-altitude-band")
      .data(bands)
      .join("rect")
      .attr("class", "cost-altitude-band")
      .attr("x", 0)
      .attr("y", (d) => yScale(d[1]))
      .attr("width", chartW)
      .attr("height", (d) => yScale(d[0]) - yScale(d[1]))
      .attr("fill", (_d, i) => (i % 2 === 0 ? "rgba(232, 226, 216, 0.28)" : "transparent"));

    ALTITUDES.forEach((alt) => {
      g.append("line")
        .attr("class", "cost-altitude-rule")
        .attr("x1", 0)
        .attr("x2", chartW)
        .attr("y1", yScale(alt))
        .attr("y2", yScale(alt));
    });

    [5000, 6000, 7000, 8000, 8848].forEach((alt) => {
      g.append("text")
        .attr("class", "cost-altitude-label")
        .attr("x", -10)
        .attr("y", yScale(alt) + 4)
        .attr("text-anchor", "end")
        .text(alt === 8849 ? "8,848 m" : d3.format(",d")(alt) + " m");
    });

    g.append("text")
      .attr("class", "cost-axis-title")
      .attr("x", -10)
      .attr("y", -7)
      .attr("text-anchor", "end")
      .text("Altitude");

  }

  function applySubstep(substep, animated) {
    if (!register || !svg) return;

    const nextSubstep = normalizeSubstep(substep);
    if (nextSubstep === currentSubstep) return;
    const previousSubstep = currentSubstep;
    currentSubstep = nextSubstep;

    const state = makeState(nextSubstep);
    const datasetChanged = state.dataset !== currentDataset;
    currentDataset = state.dataset;
    register.dataset.substep = String(nextSubstep);

    updateCopy(state);

    renderVersion += 1;
    const version = renderVersion;
    svg.selectAll("*").interrupt();
    renderDots(state, animated, datasetChanged, version);
    renderRoleLabels(state, animated, previousSubstep);
    renderMedians(state, animated, previousSubstep);
  }

  function makeState(substep) {
    const dataset = substep >= 2 ? "everest" : "all";
    const deaths = dataset === "everest" ? everestDeaths : allDeaths;
    const hired = deaths.filter((d) => d.hired);
    const clients = deaths.filter((d) => !d.hired);
    const medHired = d3.median(hired, (d) => d.alt);
    const medClient = d3.median(clients, (d) => d.alt);
    const gap = Math.abs(medClient - medHired);

    if (substep === 0) {
      return {
        substep,
        dataset,
        deaths,
        splitRoles: false,
        colored: false,
        showMedians: false,
        showBracket: false,
        title: "All Himalayan deaths above 5,000 m",
        stats: [
          { value: d3.format(",d")(deaths.length), label: "deaths" },
          { value: "5,000 m+", label: "included altitude" },
        ],
      };
    }

    if (substep === 1) {
      return {
        substep,
        dataset,
        deaths,
        splitRoles: true,
        colored: true,
        showMedians: true,
        showBracket: false,
        medHired,
        medClient,
        title: "All peaks, split by role",
        stats: [
          { value: d3.format(",d")(hired.length), label: "hired staff deaths" },
          { value: d3.format(",d")(clients.length), label: "client deaths" },
          { value: d3.format(",d")(medHired) + " m", label: "hired staff median" },
          { value: d3.format(",d")(medClient) + " m", label: "client median" },
        ],
      };
    }

    if (substep === 2) {
      return {
        substep,
        dataset,
        deaths,
        splitRoles: true,
        colored: true,
        showMedians: true,
        showBracket: false,
        medHired,
        medClient,
        gap,
        title: "Everest only",
        stats: [
          { value: d3.format(",d")(deaths.length), label: "Everest deaths" },
          { value: d3.format(",d")(medHired) + " m", label: "hired staff median" },
          { value: d3.format(",d")(medClient) + " m", label: "client median" },
        ],
      };
    }

    return {
      substep,
      dataset,
      deaths,
      splitRoles: true,
      colored: true,
      showMedians: true,
      showBracket: true,
      medHired,
      medClient,
      gap,
      title: "Everest median gap",
      stats: [
        { value: d3.format(",d")(medHired) + " m", label: "hired staff median" },
        { value: d3.format(",d")(medClient) + " m", label: "client median" },
        { value: d3.format(",d")(gap) + " m", label: "vertical gap" },
      ],
    };
  }

  function updateCopy(state) {
    copyTitle.textContent = state.title;
    statsNode.innerHTML = "";

    state.stats.forEach((stat) => {
      const item = document.createElement("div");
      item.className = "cost-register__stat";

      const value = document.createElement("span");
      value.className = "cost-register__stat-value";
      value.textContent = stat.value;

      const label = document.createElement("span");
      label.className = "cost-register__stat-label";
      label.textContent = stat.label;

      item.appendChild(value);
      item.appendChild(label);
      statsNode.appendChild(item);
    });
  }

  function renderDots(state, animated, datasetChanged, version) {
    const duration = animated ? 520 : 0;
    const opacity = state.colored ? 0.68 : 0.48;

    const dots = dotsG.selectAll("circle").data(state.deaths, (d) => d._id);

    dots.exit()
      .transition()
      .duration(datasetChanged ? duration * 0.65 : duration)
      .attr("opacity", 0)
      .remove();

    const enter = dots.enter()
      .append("circle")
      .attr("cx", (d) => dotX(d, state))
      .attr("cy", (d) => yScale(d.alt))
      .attr("r", 2.55)
      .attr("fill", (d) => dotFill(d, state))
      .attr("opacity", 0);

    enter.merge(dots)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr("cx", (d) => dotX(d, state))
      .attr("cy", (d) => yScale(d.alt))
      .attr("fill", (d) => dotFill(d, state))
      .attr("opacity", opacity)
      .on("end", () => {
        if (version === renderVersion) bindTooltip();
      });

    if (!animated) bindTooltip();
  }

  function renderMedians(state, animated, previousSubstep) {
    const duration = animated ? 420 : 0;
    bracketG.selectAll("*").remove();
    if (!state.showMedians) {
      medianG.selectAll(".cost-median")
        .transition()
        .duration(duration)
        .attr("opacity", 0)
        .remove();
      return;
    }

    const medians = [
      { role: "hired", label: "Hired staff", value: state.medHired, color: COLORS.staff },
      { role: "client", label: "Clients", value: state.medClient, color: COLORS.client },
    ];

    const lineHalf = chartW * 0.14;
    const fadeIn = animated && previousSubstep < 1;
    const groups = medianG.selectAll(".cost-median")
      .data(medians, (d) => d.role)
      .join(
        (enter) => {
          const group = enter.append("g")
            .attr("class", "cost-median")
            .attr("opacity", fadeIn ? 0 : 1);

          group.append("line");
          group.append("text").attr("class", "cost-median-label");
          return group;
        },
        (update) => update,
        (exit) => exit
          .transition()
          .duration(duration)
          .attr("opacity", 0)
          .remove()
      )
      .attr("class", "cost-median")
      .attr("opacity", fadeIn ? 0 : 1);

    groups.select("line")
      .transition()
      .duration(duration)
      .attr("x1", (d) => roleCenter(d.role) - lineHalf)
      .attr("x2", (d) => roleCenter(d.role) + lineHalf)
      .attr("y1", (d) => yScale(d.value))
      .attr("y2", (d) => yScale(d.value))
      .attr("stroke", (d) => d.color);

    groups.select("text")
      .text((d) => d3.format(",d")(d.value) + " m")
      .transition()
      .duration(duration)
      .attr("x", (d) => (
        d.role === "hired"
          ? roleCenter(d.role) - lineHalf - 9
          : roleCenter(d.role) + lineHalf + 9
      ))
      .attr("y", (d) => yScale(d.value) + 4)
      .attr("text-anchor", (d) => (d.role === "hired" ? "end" : "start"))
      .attr("fill", (d) => d.color);

    if (fadeIn) {
      groups.transition()
        .delay(120)
        .duration(duration)
        .attr("opacity", 1);
    }

    if (state.showBracket) renderBracket(state, animated);
  }

  function renderRoleLabels(state, animated, previousSubstep) {
    const duration = animated ? 300 : 0;
    if (!state.splitRoles) {
      roleG.selectAll(".cost-role-label")
        .transition()
        .duration(duration)
        .attr("opacity", 0)
        .remove();
      return;
    }

    const labels = [
      { role: "hired", label: "Hired staff", color: COLORS.staff },
      { role: "client", label: "Clients", color: COLORS.client },
    ];

    const fadeIn = animated && previousSubstep < 1;
    const groups = roleG.selectAll(".cost-role-label")
      .data(labels, (d) => d.role)
      .join(
        (enter) => enter.append("text")
          .attr("class", "cost-role-label")
          .attr("opacity", fadeIn ? 0 : 1),
        (update) => update,
        (exit) => exit
          .transition()
          .duration(duration)
          .attr("opacity", 0)
          .remove()
      )
      .attr("class", "cost-role-label")
      .attr("text-anchor", "middle")
      .text((d) => d.label);

    groups.transition()
      .duration(duration)
      .attr("x", (d) => roleCenter(d.role))
      .attr("y", -22)
      .attr("fill", (d) => d.color)
      .attr("opacity", 1);
  }

  function renderBracket(state, animated) {
    const duration = animated ? 440 : 0;
    const y1 = yScale(Math.max(state.medHired, state.medClient));
    const y2 = yScale(Math.min(state.medHired, state.medClient));
    const compact = chartW < 360;
    const x = chartW + (compact ? 18 : 30);
    const bracket = bracketG.append("g")
      .attr("class", "cost-gap")
      .attr("opacity", animated ? 0 : 1);

    bracket.append("line")
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", y1)
      .attr("y2", y2);

    bracket.append("line")
      .attr("x1", x - 7)
      .attr("x2", x + 7)
      .attr("y1", y1)
      .attr("y2", y1);

    bracket.append("line")
      .attr("x1", x - 7)
      .attr("x2", x + 7)
      .attr("y1", y2)
      .attr("y2", y2);

    bracket.append("text")
      .attr("x", x + (compact ? 8 : 12))
      .attr("y", (y1 + y2) / 2 - (compact ? 2 : 4))
      .text(d3.format(",d")(state.gap) + " m");

    if (!compact) {
      bracket.append("text")
        .attr("x", x + 12)
        .attr("y", (y1 + y2) / 2 + 12)
        .text("median gap");
    }

    bracket.transition()
      .delay(animated ? 260 : 0)
      .duration(duration)
      .attr("opacity", 1);
  }

  function bindTooltip() {
    d3.select(container).selectAll(".cost-tip").remove();
    d3.select(container).style("position", "relative");

    const tip = d3.select(container)
      .append("div")
      .attr("class", "cost-tip")
      .style("opacity", 0);

    dotsG.selectAll("circle")
      .on("mouseover", (_event, d) => {
        tip.html(
          `<strong>${d.death_cause || "Unknown cause"}</strong><br>` +
          `${d3.format(",d")(d.alt)} m / ${d.year}<br>` +
          `${d.peak_name} / ${d.hired ? "Hired staff" : "Client"}` +
          (d.citizenship ? `<br>${d.citizenship}` : "")
        ).style("opacity", 1);
      })
      .on("mousemove", (event) => {
        const rect = container.getBoundingClientRect();
        tip.style("left", event.clientX - rect.left + 14 + "px")
          .style("top", event.clientY - rect.top - 36 + "px");
      })
      .on("mouseout", () => tip.style("opacity", 0));
  }

  function dotX(d, state) {
    if (!state.splitRoles) {
      const center = chartW * 0.49;
      return center + (d._jitter - 0.5) * chartW * 0.78;
    }

    const center = roleCenter(d._role);
    return center + (d._jitter - 0.5) * chartW * 0.26;
  }

  function roleCenter(role) {
    return role === "hired" ? chartW * 0.32 : chartW * 0.68;
  }

  function dotFill(d, state) {
    if (!state.colored) return COLORS.neutral;
    return d._role === "hired" ? COLORS.staff : COLORS.client;
  }

  function stableJitter(d, index) {
    const text = `${d.peak_name || ""}${d.year || ""}${d.death_height_metres || ""}${index}`;
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 1000003;
    }
    return (hash % 1000) / 1000;
  }

  function normalizeSubstep(substep) {
    return Number.isFinite(+substep) ? Math.max(0, Math.min(3, +substep)) : 0;
  }

  function handleResize() {
    if (!register) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const substep = currentSubstep;
      buildChart();
      currentSubstep = -1;
      currentDataset = null;
      applySubstep(substep, false);
    }, 120);
  }

  return { init, show, update, hide };
})();
