import { getAll } from '../db.js';
import { el, option } from '../dom.js';
import { icon } from '../icons.js';
import { estimate1RM } from '../training.js';

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
.chart-box { position: relative; height: ${CHART_HEIGHT}px; cursor: zoom-in; }
.chart-box[hidden] { display: none; }
.chart-empty { margin: 0; color: var(--fg-soft); font-size: 0.875rem; }
.chart-zoom { position: fixed; inset: 0; z-index: 30; display: grid; grid-template-rows: auto 1fr auto; gap: 0.5rem; padding: 0.75rem; background: var(--bg); }
.zoom-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.zoom-head p { margin: 0; font-weight: 700; }
.zoom-frame { position: relative; overflow: hidden; touch-action: none; cursor: grab; }
.zoom-box { position: absolute; inset: 0; transform-origin: 0 0; }
.zoom-hint { margin: 0; color: var(--fg-soft); font-size: 0.75rem; text-align: center; }
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
  return { section, title, selects: selects.map((item) => item.select), canvas, box, message };
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

  // タップで全画面に拡大。拡大縮小は CSS transform で行う
  // shortcut: 6倍まで拡大すると canvas がぼける（必要になったら拡大後に描き直す）
  function openZoom(part) {
    const source = part.chart;
    if (!source) return;
    const closeButton = el('button', { type: 'button', class: 'icon-btn', 'aria-label': '閉じる', title: '閉じる' }, icon('close'));
    const canvas = el('canvas', {});
    const zoomBox = el('div', { class: 'zoom-box' }, canvas);
    const frame = el('div', { class: 'zoom-frame' }, zoomBox);
    const overlay = el('div', { class: 'chart-zoom', role: 'dialog', 'aria-label': `${part.title}を拡大` },
      el('div', { class: 'zoom-head' }, el('p', { text: part.title }), closeButton),
      frame,
      el('p', { class: 'zoom-hint', text: 'ピンチ / ホイールで拡大・縮小、ドラッグで移動、ダブルタップで戻す' }),
    );

    const { options } = chartOptions(part.meta.unit, part.meta.kind);
    options.animation = false;
    const zoomChart = new Chart(canvas, {
      type: source.config.type,
      data: {
        labels: [...source.data.labels],
        datasets: [{ ...source.data.datasets[0], data: [...source.data.datasets[0].data] }],
      },
      options,
    });

    let scale = 1;
    let x = 0;
    let y = 0;
    const clamp = (value) => Math.min(6, Math.max(1, value));
    const apply = () => { zoomBox.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
    // つまんだ位置（またはカーソル位置）を固定したまま拡大率を変える
    const zoomAt = (nextScale, px, py) => {
      const ratio = nextScale / scale;
      scale = nextScale;
      x = px - (px - x) * ratio;
      y = py - (py - y) * ratio;
      apply();
    };
    const localPoint = (event) => {
      const rect = frame.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const pointers = new Map();
    let start = null;
    frame.addEventListener('pointerdown', (event) => {
      // すでに離れているポインタだと例外になるので、掴めなくても続行する
      try { frame.setPointerCapture(event.pointerId); } catch { /* 無視 */ }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      start = { x: event.clientX, y: event.clientY, scale };
    });
    frame.addEventListener('pointermove', (event) => {
      if (!pointers.has(event.pointerId)) return;
      const before = [...pointers.values()];
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const after = [...pointers.values()];
      if (after.length >= 2) {
        const distance = (list) => Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) || 1;
        const center = localPoint({ clientX: (after[0].x + after[1].x) / 2, clientY: (after[0].y + after[1].y) / 2 });
        zoomAt(clamp(scale * (distance(after) / distance(before))), center.x, center.y);
        return;
      }
      x += event.clientX - before[0].x;
      y += event.clientY - before[0].y;
      apply();
    });
    const release = (event) => {
      pointers.delete(event.pointerId);
      start = null;
    };
    frame.addEventListener('pointerup', release);
    frame.addEventListener('pointercancel', release);
    frame.addEventListener('wheel', (event) => {
      event.preventDefault();
      const point = localPoint(event);
      zoomAt(clamp(scale * (event.deltaY < 0 ? 1.15 : 0.87)), point.x, point.y);
    }, { passive: false });
    frame.addEventListener('dblclick', () => {
      scale = 1;
      x = 0;
      y = 0;
      apply();
    });

    const close = () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      zoomChart.destroy();
      overlay.remove();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    closeButton.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.append(overlay);
    apply();
  }

  function update(part, points, { unit, kind, empty }) {
    if (!container.isConnected) return;
    if (points.length === 0) {
      part.message.textContent = empty;
      part.box.hidden = true;
      part.chart?.destroy();
      part.chart = null;
      return;
    }
    part.unit = unit;
    part.meta = { unit, kind };
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
      // 点が多いと線が潰れるので、60点を超えたら点はホバー/タップ時だけ出す
      dataset.pointRadius = points.length > 60 ? 0 : 3;
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
  for (const part of [series, metric]) {
    part.canvas.addEventListener('click', () => openZoom(part));
  }

  render();
}
