/* Arbitrary two-athlete comparison page (`<event_id>/compare-athletes.html`).
 *
 * Unlike every other page, this one's charts aren't fixed at build time -
 * `window.COMPARE_DATA` (built by `sitegen/pages/compare_athletes_page.py`)
 * carries every starter's table fields and raw per-loop series, and this
 * file builds Chart.js configs for whichever two athletes are currently
 * picked. It deliberately reuses `THEME`/`currentThemeName`/
 * `applyThemeToConfig` from `site.js` (loaded first, plain scripts so its
 * top-level functions are already global) rather than duplicating the
 * light/dark color-resolution logic.
 */

(function () {
  const data = window.COMPARE_DATA;
  if (!data || !Array.isArray(data.athletes) || data.athletes.length < 2) {
    const grid = document.querySelector(".charts-grid");
    if (grid) grid.innerHTML = "<p>Not enough starters in this event to compare.</p>";
    return;
  }

  const athletesByBib = new Map(data.athletes.map((a) => [a.bib, a]));
  const chartInstances = {};

  // ------------------------------------------------------------------
  // Pickers
  // ------------------------------------------------------------------

  function optionLabel(athlete) {
    const prefix = athlete.rank != null ? `${athlete.rank}. ` : "";
    return `${prefix}${athlete.name} — ${athlete.distance}`;
  }

  function populatePicker(select) {
    data.athletes.forEach((athlete) => {
      const opt = document.createElement("option");
      opt.value = String(athlete.bib);
      opt.textContent = optionLabel(athlete);
      select.appendChild(opt);
    });
  }

  const pickerA = document.getElementById("picker-a");
  const pickerB = document.getElementById("picker-b");
  populatePicker(pickerA);
  populatePicker(pickerB);

  function validBib(value) {
    const bib = parseInt(value, 10);
    return athletesByBib.has(bib) ? bib : null;
  }

  function initialSelection() {
    const params = new URLSearchParams(window.location.search);
    let a = validBib(params.get("a"));
    let b = validBib(params.get("b"));
    if (a != null && a === b) b = null;
    if (a == null) a = data.default_a != null ? data.default_a : data.athletes[0].bib;
    if (b == null || b === a) {
      b = data.default_b != null && data.default_b !== a ? data.default_b : null;
      if (b == null) {
        const fallback = data.athletes.find((ath) => ath.bib !== a);
        b = fallback ? fallback.bib : a;
      }
    }
    return [a, b];
  }

  // ------------------------------------------------------------------
  // Head-to-head table
  // ------------------------------------------------------------------

  const ROWS = [
    { label: "Status", value: (a) => a.status },
    { label: "Loops completed", value: (a) => a.loops_completed, raw: (a) => a.loops_completed, better: "higher" },
    { label: "Distance", value: (a) => a.distance, raw: (a) => a.distance_km, better: "higher" },
    { label: "Elapsed time", value: (a) => a.elapsed_time, raw: (a) => a.elapsed_time_seconds, better: "lower" },
    { label: "Avg pace", value: (a) => a.pace, raw: (a) => a.pace_seconds_per_km, better: "lower", when: "has_gps_pace" },
    { label: "Fastest loop", value: (a) => a.fastest_loop, raw: (a) => a.fastest_loop_seconds, better: "lower" },
    { label: "Average loop", value: (a) => a.average_loop, raw: (a) => a.average_loop_seconds, better: "lower" },
    { label: "Slowest loop", value: (a) => a.slowest_loop, raw: (a) => a.slowest_loop_seconds, better: "lower" },
    { label: "Rest banked", value: (a) => a.rest_banked, raw: (a) => a.rest_banked_seconds, better: "higher", when: "has_rest_time" },
  ];

  function nameCell(athlete) {
    const link = document.createElement("a");
    link.href = athlete.athlete_url;
    link.textContent = athlete.name;
    const wrap = document.createElement("div");
    wrap.appendChild(link);
    const meta = document.createElement("div");
    meta.className = "h2h-meta";
    meta.textContent = athlete.country;
    wrap.appendChild(meta);
    return wrap;
  }

  function renderTable(athleteA, athleteB) {
    const headA = document.getElementById("h2h-head-a");
    const headB = document.getElementById("h2h-head-b");
    headA.replaceChildren(nameCell(athleteA));
    headB.replaceChildren(nameCell(athleteB));

    const body = document.getElementById("h2h-body");
    body.innerHTML = "";
    ROWS.forEach((row) => {
      if (row.when && !data.capabilities[row.when]) return;
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = row.label;
      const tdA = document.createElement("td");
      const tdB = document.createElement("td");
      tdA.textContent = row.value(athleteA);
      tdB.textContent = row.value(athleteB);

      if (row.better) {
        const rawA = row.raw(athleteA);
        const rawB = row.raw(athleteB);
        if (typeof rawA === "number" && typeof rawB === "number" && rawA !== rawB) {
          const aWins = row.better === "higher" ? rawA > rawB : rawA < rawB;
          (aWins ? tdA : tdB).classList.add("h2h-better");
        }
      }

      tr.append(th, tdA, tdB);
      body.appendChild(tr);
    });
  }

  // ------------------------------------------------------------------
  // Loop-by-loop overlay charts
  // ------------------------------------------------------------------

  function seriesFor(athlete, field) {
    const byLoop = {};
    (athlete.laps || []).forEach((lap) => {
      if (lap[field]) byLoop[lap.loop_number] = lap[field];
    });
    return byLoop;
  }

  function buildOverlayChart(athleteA, athleteB, { field, yLabel, toMinutes, beginAtZero }) {
    const seriesA = seriesFor(athleteA, field);
    const seriesB = seriesFor(athleteB, field);
    const loopNumbers = Object.keys(seriesA).concat(Object.keys(seriesB)).map(Number);
    if (!loopNumbers.length) return null;
    const maxLoop = Math.max(...loopNumbers);
    const labels = Array.from({ length: maxLoop }, (_, i) => i + 1);

    const toValue = (v) => (toMinutes ? Math.round((v / 60) * 100) / 100 : Math.round(v * 10) / 10);
    const dataset = (label, series, role) => ({
      label,
      data: labels.map((n) => (n in series ? toValue(series[n]) : null)),
      seriesRoles: role,
      pointRadius: 1,
      spanGaps: true,
    });

    return {
      type: "line",
      data: {
        labels,
        datasets: [dataset(athleteA.name, seriesA, "series-1"), dataset(athleteB.name, seriesB, "series-2")],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom" } },
        scales: {
          x: { title: { display: true, text: "Loop number" } },
          y: { beginAtZero: !!beginAtZero, title: { display: true, text: yLabel } },
        },
      },
    };
  }

  const OVERLAYS = [
    { canvasId: "chart-loop-time", field: "loop_time_seconds", yLabel: "Loop time (min)", toMinutes: true, beginAtZero: true },
    { canvasId: "chart-pace", field: "pace_seconds_per_km", yLabel: "Pace (min/km)", toMinutes: true },
    { canvasId: "chart-heart-rate", field: "avg_heart_rate_bpm", yLabel: "Avg heart rate (bpm)" },
    { canvasId: "chart-cadence", field: "avg_cadence_spm", yLabel: "Cadence (steps/min)" },
    { canvasId: "chart-rest", field: "rest_seconds", yLabel: "Rest banked (min)", toMinutes: true, beginAtZero: true },
  ];

  function renderOrClearChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return; // this event's capabilities don't have a card for it
    const card = canvas.closest(".chart-card");
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
    if (!config) {
      if (card) card.style.display = "none";
      return;
    }
    if (card) card.style.display = "";
    const theme = THEME[currentThemeName()];
    const cfg = applyThemeToConfig(config, theme);
    // eslint-disable-next-line no-undef
    chartInstances[canvasId] = new Chart(canvas.getContext("2d"), cfg);
  }

  function renderCharts(athleteA, athleteB) {
    OVERLAYS.forEach((overlay) => {
      const config = buildOverlayChart(athleteA, athleteB, overlay);
      renderOrClearChart(overlay.canvasId, config);
    });
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------

  function updateUrl(a, b) {
    const params = new URLSearchParams(window.location.search);
    params.set("a", a);
    params.set("b", b);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }

  function render(a, b) {
    pickerA.value = String(a);
    pickerB.value = String(b);
    const athleteA = athletesByBib.get(a);
    const athleteB = athletesByBib.get(b);
    renderTable(athleteA, athleteB);
    renderCharts(athleteA, athleteB);
    updateUrl(a, b);
  }

  let [currentA, currentB] = initialSelection();

  pickerA.addEventListener("change", () => {
    let a = validBib(pickerA.value);
    if (a === currentB) {
      // swap instead of allowing a duplicate
      currentB = currentA;
    }
    currentA = a;
    render(currentA, currentB);
  });

  pickerB.addEventListener("change", () => {
    let b = validBib(pickerB.value);
    if (b === currentA) {
      currentA = currentB;
    }
    currentB = b;
    render(currentA, currentB);
  });

  document.getElementById("picker-swap").addEventListener("click", () => {
    [currentA, currentB] = [currentB, currentA];
    render(currentA, currentB);
  });

  render(currentA, currentB);
})();
