window.vizDemographics = (function () {
  let container = null;
  let allData   = null;
  let chart     = null;
  let currentGroup  = "all";
  let currentDecade = "all";

  const DATA_URL     = "data/demographics.json";
  const COLOR_MALE   = "#378ADD";
  const COLOR_FEMALE = "#D4537E";

  const NAT_LABELS = {
    all:"All nationalities", Nepal:"Nepal", USA:"United States",
    Japan:"Japan", UK:"United Kingdom", France:"France",
    Spain:"Spain", "S Korea":"South Korea", Italy:"Italy",
    Germany:"Germany", Switzerland:"Switzerland",
    China:"China", Austria:"Austria",
  };

  const DECADE_LABELS = {
    all:"All decades", "1950s":"1950s", "1960s":"1960s",
    "1970s":"1970s", "1980s":"1980s", "1990s":"1990s",
    "2000s":"2000s", "2010s":"2010s",
  };

  function init(cont) {
    container = cont;
    fetch(DATA_URL)
      .then(r => r.json())
      .then(json => { allData = json; })
      .catch(err => console.error("demographics.js:", err));
  }

  function show() {
    if (!container) return;
    currentGroup  = "all";
    currentDecade = "all";
    render();
  }

  function hide() {
    if (chart) { chart.destroy(); chart = null; }
    if (container) container.innerHTML = "";
  }

  function render() {
    if (!container) return;
    container.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:1.5rem 2rem;height:100%;box-sizing:border-box;overflow-y:auto;font-family:Inter,system-ui,sans-serif;";

    wrap.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:1rem;flex-wrap:wrap;">
        <select id="demo-nat-select" style="font-size:13px;padding:5px 10px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;border-radius:4px;cursor:pointer;font-family:inherit;"></select>
       <div id="demo-decade-btns" style="display:flex;gap:5px;flex-wrap:wrap;">
          <button data-decade="all"   class="dec-btn dec-active" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #378ADD;background:#378ADD;color:#fff;cursor:pointer;font-family:inherit;">All</button>
          <button data-decade="1950s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">1950s</button>
          <button data-decade="1960s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">1960s</button>
          <button data-decade="1970s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">1970s</button>
          <button data-decade="1980s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">1980s</button>
          <button data-decade="1990s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">1990s</button>
          <button data-decade="2000s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">2000s</button>
          <button data-decade="2010s" class="dec-btn" style="font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid #d8d2c7;background:#f4f1ea;color:#1d1c1a;cursor:pointer;font-family:inherit;">2010s</button>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:1rem;">
        <div style="flex:1;background:#ece9e3;border-radius:6px;padding:10px 12px;">
          <p style="font-size:11px;color:#6f6a61;margin:0 0 3px;">Total climbers</p>
          <p id="demo-stat-total" style="font-size:22px;font-weight:600;font-family:Inter,system-ui,sans-serif;margin:0;color:#1d1c1a;letter-spacing:-0.5px;">–</p>
        </div>
        <div style="flex:1;background:#ece9e3;border-radius:6px;padding:10px 12px;">
          <p style="font-size:11px;color:#6f6a61;margin:0 0 3px;">% female</p>
          <p id="demo-stat-male" style="font-size:22px;font-weight:600;font-family:Inter,system-ui,sans-serif;margin:0;color:#1d1c1a;letter-spacing:-0.5px;">–</p>
        </div>
        <div style="flex:1;background:#ece9e3;border-radius:6px;padding:10px 12px;">
          <p style="font-size:11px;color:#6f6a61;margin:0 0 3px;">Median age</p>
          <p id="demo-stat-median" style="font-size:22px;font-weight:600;font-family:Inter,system-ui,sans-serif;margin:0;color:#1d1c1a;letter-spacing:-0.5px;">–</p>
        </div>
      </div>

      <div style="display:flex;gap:14px;font-size:12px;color:#6f6a61;margin-bottom:0.5rem;">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#378ADD;margin-right:4px;vertical-align:middle;"></span>Male</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#D4537E;margin-right:4px;vertical-align:middle;"></span>Female</span>
      </div>
      <div style="position:relative;width:100%;height:300px;">
        <canvas id="demo-chart"></canvas>
      </div>
      <p style="font-size:11px;color:#6f6a61;margin-top:0.75rem;">Source: Himalayan Database, 1905–2019. Includes 73,022 of 76,519 members with recorded age.</p>
    `;

    container.appendChild(wrap);

    // Nationality dropdown
    const select = document.getElementById("demo-nat-select");
    if (select && allData) {
      allData.groups.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = NAT_LABELS[g] || g;
        select.appendChild(opt);
      });
      select.addEventListener("change", e => {
        currentGroup = e.target.value;
        updateChart();
      });
    }

    // Decade buttons
    document.querySelectorAll(".dec-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        currentDecade = btn.dataset.decade;
        document.querySelectorAll(".dec-btn").forEach(b => {
          b.style.background = "#f4f1ea";
          b.style.borderColor = "#d8d2c7";
          b.style.color = "#1d1c1a";
        });
        btn.style.background = "#378ADD";
        btn.style.borderColor = "#378ADD";
        btn.style.color = "#fff";
        updateChart();
      });
    });

    if (allData) buildChart();
  }

  function buildChart() {
    const canvas = document.getElementById("demo-chart");
    if (!canvas || !allData) return;
    if (chart) { chart.destroy(); chart = null; }

    const d = allData.data[currentGroup][currentDecade];
    updateStats(allData.stats[currentGroup][currentDecade]);

    // Compute max Y across all decades for stable axis
    let maxY = 0;
    allData.decades.forEach(dec => {
      const dd = allData.data[currentGroup][dec];
      dd.male.forEach((v,i) => { maxY = Math.max(maxY, v + dd.female[i]); });
    });

    chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: allData.bins,
        datasets: [
          { label:"Male",   data:d.male,   backgroundColor:COLOR_MALE,   borderRadius:2 },
          { label:"Female", data:d.female, backgroundColor:COLOR_FEMALE, borderRadius:2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: "easeInOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => "Age group: " + items[0].label,
              label: item => "  " + item.dataset.label + ": " + item.raw.toLocaleString(),
              afterBody: items => {
                if (!items.length) return [];
                const idx = items[0].dataIndex;
                const mV = chart.data.datasets[0].data[idx] || 0;
                const fV = chart.data.datasets[1].data[idx] || 0;
                const total = mV + fV;
                if (!total) return [];
                const pct = Math.round((fV / total) * 100);
                return ["  Total: " + total.toLocaleString(), "  Female share: " + pct + "%"];
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font:{size:11}, color:"#6f6a61", autoSkip:false, maxRotation:0 },
            title: { display:true, text:"Age group", font:{size:12}, color:"#6f6a61" },
          },
          y: {
            stacked: true,
            max: Math.ceil(maxY * 1.1),
            grid: { color:"rgba(216,210,199,0.5)" },
            ticks: { font:{size:11}, color:"#6f6a61", callback: v => v>=1000?(v/1000).toFixed(0)+"k":v },
            title: { display:true, text:"Number of climbers", font:{size:12}, color:"#6f6a61" },
          },
        },
      },
    });
  }

  function updateChart() {
    if (!chart || !allData) return;
    const d = allData.data[currentGroup][currentDecade];
    chart.data.datasets[0].data = d.male;
    chart.data.datasets[1].data = d.female;
    chart.update();
    updateStats(allData.stats[currentGroup][currentDecade]);
  }

  function updateStats(stats) {
    const t  = document.getElementById("demo-stat-total");
    const m  = document.getElementById("demo-stat-male");
    const md = document.getElementById("demo-stat-median");
    if (t)  t.textContent  = stats.total.toLocaleString();
    if (m)  m.textContent  = (100 - stats.male_pct).toFixed(1) + "%";
    if (md) md.textContent = stats.median;
  }

  return { init, show, hide, update: () => {} };
})();