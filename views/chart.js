import { getAll } from '../db.js';
import { el, option, estimate1RM } from '../ui.js';

export const view = { id: 'chart', label: 'グラフ', mount };

const CHART_HEIGHT = 160;
const RANGES = [
  { value: '30', label: '直近30日', days: 30 },
  { value: '90', label: '直近90日', days: 90 },
  { value: 'all', label: '全期間', days: 0 },
];

const CSS = `
.chart-card { display: grid; gap: 0.5rem; }
.chart-card h2 { margin: 0; }
.chart-box { position: relative; height: ${CHART_HEIGHT}px; }
.chart-box[hidden] { display: none; }
.chart-empty { margin: 0; color: var(--fg-soft); font-size: 0.875rem; }
`;

const pad2 = (value) => String(value).padStart(2, '0');

// canvas は CSS 変数を使えないので、色はパレットから読む
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// days 日前の日付。日付文字列同士の比較で期間を切るため、タイムゾーンに依存させない
function cutoffString(days) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dateLabel(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function toPoints(map) {
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

function chartOptions(unit, kind) {
  const palette = { line: cssVar('--gb-orange'), grid: cssVar('--gb-bg2'), axis: cssVar('--gb-bg3'), text: cssVar('--gb-fg4') };
  const axisFont = { size: 10 };
  return {
    colors: palette,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar('--gb-fg1'),
          titleColor: cssVar('--gb-bg0'),
          bodyColor: cssVar('--gb-bg0'),
          padding: 8,
          displayColors: false,
          callbacks: { label: (item) => `${item.parsed.y.toFixed(1).replace(/\.0$/, '')} ${unit}` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: palette.axis },
          ticks: { color: palette.text, maxTicksLimit: 5, font: axisFont },
        },
        y: {
          beginAtZero: kind === 'bar',
          grid: { color: palette.grid, drawTicks: false },
          border: { display: false },
          ticks: { color: palette.text, maxTicksLimit: 4, font: axisFont },
        },
      },
    },
  };
}

function buildSection(title, selectLabels) {
  const selects = selectLabels.map((label) => {
    const select = el('select', { class: 'chart-select' });
    return { label, select };
  });
  const canvas = el('canvas', {});
  const box = el('div', { class: 'chart-box' }, canvas);
  const message = el('p', { class: 'chart-empty' });
  const section = el('section', { class: 'chart-card' },
    el('h2', { text: title }),
    ...selects.map(({ label, select }) => el('label', {}, label, select)),
    message,
    box,
  );
  return { section, selects: selects.map((item) => item.select), canvas, box, message };
}

async function mount(container) {
  const style = document.createElement('style');
  style.textContent = CSS;
  container.append(style);

  const [exercises, sets, metricDefs, logs] = await Promise.all([
    getAll('exercise'),
    getAll('workoutSet'),
    getAll('metricDef'),
    getAll('metricLog'),
  ]);
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  metricDefs.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const rangeSelect = el('select', { 'aria-label': '期間' },
    ...RANGES.map((range) => option(range.value, range.label)));
  const series = buildSection('種目の推移', ['種目', '表示']);
  const [exerciseSelect, modeSelect] = series.selects;
  modeSelect.replaceChildren(option('rm', '推定1RM'), option('volume', 'ボリューム'));
  const metric = buildSection('指標の推移', ['指標']);
  const [metricSelect] = metric.selects;

  container.append(
    el('section', { class: 'chart-card' }, el('h2', { text: 'グラフ' }), el('label', {}, '期間', rangeSelect)),
    series.section,
    metric.section,
  );

  const exerciseOptions = () => exercises.map((exercise) =>
    option(exercise.id, exercise.archived ? `${exercise.name}（アーカイブ）` : exercise.name));

  // アーカイブ済みの種目も過去の記録を見るために残す
  exerciseSelect.replaceChildren(...exerciseOptions());
  metricSelect.replaceChildren(...metricDefs.map((def) => option(def.id, def.name)));

  if (exercises.length === 0) {
    exerciseSelect.disabled = true;
    series.message.textContent = '種目がありません';
  }
  if (metricDefs.length === 0) {
    metricSelect.disabled = true;
    metricSelect.parentElement.hidden = true;
    metric.message.textContent = '指標がありません';
  }

  // ライブラリが読めない（オフラインなど）ときは描画せずメッセージを出す
  const Chart = window.Chart;
  if (typeof Chart !== 'function') {
    for (const part of [series, metric]) {
      part.message.textContent = 'グラフを描画できませんでした';
      part.box.hidden = true;
    }
    return;
  }

  Chart.defaults.font.family = 'system-ui, -apple-system, "Hiragino Sans", sans-serif';

  function update(part, points, { unit, kind, empty }) {
    if (!container.isConnected) return;
    if (points.length === 0) {
      part.message.textContent = empty;
      part.box.hidden = true;
      part.chart?.destroy();
      part.chart = null;
      return;
    }
    const { colors, options } = chartOptions(unit, kind);
    part.message.textContent = '';
    part.box.hidden = false;
    // 折れ線と棒を切り替えるときは chart を作り直す
    if (part.chart && part.kind !== kind) {
      part.chart.destroy();
      part.chart = null;
    }
    if (!part.chart) {
      part.chart = new Chart(part.canvas, {
        type: kind,
        data: { labels: [], datasets: [{ data: [], borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.25 }] },
        options,
      });
      part.kind = kind;
    }
    const dataset = part.chart.data.datasets[0];
    dataset.data = points.map((point) => point.value);
    if (kind === 'bar') {
      dataset.backgroundColor = colors.line;
      dataset.borderColor = colors.line;
      dataset.borderWidth = 0;
      dataset.borderRadius = 3;
      dataset.maxBarThickness = 20;
    } else {
      dataset.borderColor = colors.line;
      dataset.backgroundColor = withAlpha(colors.line, 0.12);
      dataset.fill = true;
      dataset.pointBackgroundColor = colors.line;
    }
    part.chart.data.labels = points.map((point) => dateLabel(point.date));
    part.chart.update();
  }

  function render() {
    const days = RANGES.find((range) => range.value === rangeSelect.value).days;
    const from = days ? cutoffString(days) : null;
    const inRange = (date) => !from || date >= from;

    if (exercises.length > 0) {
      const mode = modeSelect.value;
      const points = new Map();
      for (const set of sets) {
        if (set.exerciseId !== exerciseSelect.value || !inRange(set.date)) continue;
        const value = mode === 'rm'
          ? Math.max(points.get(set.date) ?? 0, estimate1RM(set.weight, set.reps))
          : (points.get(set.date) ?? 0) + set.weight * set.reps;
        points.set(set.date, value);
      }
      update(series, toPoints(points), {
        unit: 'kg',
        kind: mode === 'rm' ? 'line' : 'bar',
        empty: '記録がありません',
      });
    }

    if (metricDefs.length > 0) {
      const def = metricDefs.find((item) => item.id === metricSelect.value);
      const latest = new Map();
      for (const log of logs) {
        if (log.metricDefId !== metricSelect.value || !inRange(log.date)) continue;
        latest.set(log.date, log.value);
      }
      update(metric, toPoints(latest), {
        unit: def?.unit === 'length' ? 'cm' : 'kg',
        kind: 'line',
        empty: '記録がありません',
      });
    }
  }

  for (const select of [rangeSelect, exerciseSelect, modeSelect, metricSelect]) {
    select.addEventListener('change', render);
  }

  render();
}
