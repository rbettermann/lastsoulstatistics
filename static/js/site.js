/* Last Soul Ultra statistics site - client-side chart/table wiring.
 *
 * Chart.js configs are generated theme-neutral by `sitegen/charts.py`
 * (each dataset carries a `seriesRoles` token, not a color) - THEME below
 * mirrors the same hex steps as site.css's custom properties (duplicated
 * here deliberately: canvas 2D `fillStyle` can't consume a CSS `var()`,
 * so colors are resolved to literal hex once, at chart-creation time,
 * from the viewer's current color-scheme preference).
 */

const THEME = {
  light: {
    text: "#0b0b0b",
    textSecondary: "#52514e",
    grid: "#e1e0d9",
    "series-1": "#2a78d6",
    "series-2": "#eb6834",
    "series-3": "#1baf7a",
    "series-4": "#eda100",
    "series-5": "#e87ba4",
    "status-good": "#0ca30c",
    "status-warning": "#fab219",
    "muted": "#c3c2b7",
  },
  dark: {
    text: "#ffffff",
    textSecondary: "#c3c2b7",
    grid: "#2c2c2a",
    "series-1": "#3987e5",
    "series-2": "#d95926",
    "series-3": "#199e70",
    "series-4": "#c98500",
    "series-5": "#d55181",
    "status-good": "#0ca30c",
    "status-warning": "#fab219",
    "muted": "#383835",
  },
};

function currentThemeName() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveColor(role, theme) {
  return theme[role] || theme["series-1"];
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyThemeToConfig(config, theme) {
  const cfg = JSON.parse(JSON.stringify(config));

  (cfg.data.datasets || []).forEach((ds) => {
    const roles = ds.seriesRoles;
    if (Array.isArray(roles)) {
      const colors = roles.map((r) => resolveColor(r, theme));
      ds.backgroundColor = colors;
      ds.borderColor = colors;
    } else if (typeof roles === "string") {
      const color = resolveColor(roles, theme);
      ds.borderColor = color;
      ds.backgroundColor = cfg.type === "line" ? hexToRgba(color, 0.15) : color;
      if (cfg.type === "line") {
        ds.pointBackgroundColor = color;
      }
    }
    delete ds.seriesRoles;
  });

  cfg.options = cfg.options || {};
  cfg.options.plugins = cfg.options.plugins || {};
  cfg.options.plugins.legend = cfg.options.plugins.legend || {};
  cfg.options.plugins.legend.labels = Object.assign(
    { color: theme.textSecondary },
    cfg.options.plugins.legend.labels || {}
  );

  cfg.options.scales = cfg.options.scales || {};
  ["x", "y"].forEach((axis) => {
    if (!cfg.options.scales[axis]) return;
    const scale = cfg.options.scales[axis];
    scale.ticks = Object.assign({ color: theme.textSecondary }, scale.ticks || {});
    scale.grid = Object.assign({ color: theme.grid }, scale.grid || {});
    if (scale.title) {
      scale.title.color = theme.textSecondary;
    }
  });

  return cfg;
}

function renderChart(canvasId, config) {
  if (!config) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const theme = THEME[currentThemeName()];
  const cfg = applyThemeToConfig(config, theme);
  // eslint-disable-next-line no-undef
  new Chart(canvas.getContext("2d"), cfg);
}

function renderAllCharts(chartConfigs) {
  Object.keys(chartConfigs || {}).forEach((id) => renderChart(id, chartConfigs[id]));
}

function initDataTables() {
  document.querySelectorAll("table.data-table").forEach((table) => {
    const raw = table.getAttribute("data-dt-options");
    let overrides = {};
    if (raw) {
      try {
        overrides = JSON.parse(raw);
      } catch (e) {
        overrides = {};
      }
    }
    const options = Object.assign(
      { paging: false, info: false, searching: true, order: [[0, "asc"]] },
      overrides
    );
    // eslint-disable-next-line no-undef
    $(table).DataTable(options);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  if (window.SITE_CHARTS) {
    renderAllCharts(window.SITE_CHARTS);
  }
  if (window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable) {
    initDataTables();
  }
});
