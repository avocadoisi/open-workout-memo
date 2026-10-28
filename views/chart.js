import { getAll } from '../db.js';
import { el, option, estimate1RM } from '../ui.js';

export const view = {
  id: 'chart',
  label: 'グラフ',
  mount,
};

const COLORS = { line: '#2b6cb0', grid: '#e2e8f0', axis: '#cbd5e0', text: '#4a5568' };
const PAD = { top: 14, right: 12, bottom: 26, left: 44 };
const CHART_HEIGHT = 160;
const TICKS = 4;
const RANGES = [
  { value: '30', label: '直近30日', days: 30 },
  { value: '90', label: '直近90日', days: 90 },
  { value: 'all', label: '全期間', days: 0 },
];

const CSS = `
.chart-card { display: grid; gap: 0.5rem; }
.chart-card h2 { margin: 0; }
.chart-canvas { display: block; width: 100%; height: ${CHART_HEIGHT}px; }
.chart-empty { margin: 0; color: #718096; font-size: 0.875rem; }
`;

const pad2 = (value) => String(value).padStart(2, '0');

// days 日前の日付。日付文字列同士の比較で期間を切るため、タイムゾーンに依存させない
function cutoffString(days) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function dateLabel(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function toPoints(map) {
  return [...map.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 横軸のラベルは 5 個まで。最初と最後の日付は必ず入れる
function labelIndices(count) {
  const max = 5;
  if (count <= max) return [...Array(count).keys()];
  const indices = [];
  for (let i = 0; i < max; i += 1) indices.push(Math.round((i * (count - 1)) / (max - 1)));
  return [...new Set(indices)];
}

// 目盛りを 1/2/2.5/5 の切りのよい刻みに丸める（61.3 のような半端な値を避ける）
function niceTicks(min, max) {
  const raw = (max - min) / (TICKS - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= raw) * magnitude;
  const lo = Math.floor(min / step) * step;
  const count = Math.min(6, Math.max(TICKS - 1, Math.ceil((max - lo) / step)));
  return {
    min: lo,
    max: lo + count * step,
    values: Array.from({ length: count + 1 }, (_, index) => lo + index * step),
  };
}

function drawSeries(canvas, points, { unit, kind }) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 1 || height < 1) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const values = points.map((point) => point.value);
  // ボリュームの棒は 0 起点で見せたいので、負側には広げない
  const base = kind === 'bar' ? 0 : Math.min(...values);
  let min = base;
  let max = Math.max(...values);
  const spread = (max - min) * 0.1;
  if (spread === 0) {
    max += 1;
    if (kind !== 'bar') min -= 1;
  } else {
    max += spread;
    if (kind !== 'bar') min -= spread;
  }

  const ticks = niceTicks(min, max);
  min = ticks.min;
  max = ticks.max;

  const left = PAD.left;
  const right = width - PAD.right;
  const top = PAD.top;
  const bottom = height - PAD.bottom;
  const plotW = right - left;
  const plotH = bottom - top;
  const yOf = (value) => bottom - ((value - min) / (max - min)) * plotH;
  const xOf = (index) => (points.length === 1
    ? left + plotW / 2
    : left + (index / (points.length - 1)) * plotW);

  ctx.font = '10px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const value of ticks.values) {
    const y = yOf(value);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(formatValue(Math.round(value * 10) / 10), left - 6, y);
  }

  ctx.strokeStyle = COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(unit, left, 0);

  ctx.textAlign = 'center';
  for (const index of labelIndices(points.length)) {
    ctx.fillText(dateLabel(points[index].date), xOf(index), bottom + 6);
  }

  if (kind === 'bar') {
    const barW = Math.max(2, Math.min(16, (plotW / points.length) * 0.6));
    ctx.fillStyle = COLORS.line;
    points.forEach((point, index) => {
      const x = Math.min(Math.max(xOf(index) - barW / 2, left), right - barW);
      const y = yOf(point.value);
      ctx.fillRect(x, y, barW, bottom - y);
    });
    return;
  }

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(xOf(index), yOf(point.value));
    else ctx.lineTo(xOf(index), yOf(point.value));
  });
  ctx.stroke();

  ctx.fillStyle = COLORS.line;
  for (const [index, point] of points.entries()) {
    ctx.beginPath();
    ctx.arc(xOf(index), yOf(point.value), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildSection(title, selectLabel) {
  const select = el('select', { class: 'chart-select' });
  const canvas = el('canvas', { class: 'chart-canvas' });
  const message = el('p', { class: 'chart-empty' });
  const section = el('section', { class: 'chart-card' },
    el('h2', { text: title }),
    el('label', {}, selectLabel, select),
    message,
    canvas,
  );
  return { section, select, canvas, message };
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
  const rm = buildSection('推定1RM の推移', '種目');
  const volume = buildSection('ボリュームの推移', '種目');
  const metric = buildSection('指標の推移', '指標');

  container.append(
    el('section', { class: 'chart-card' }, el('h2', { text: 'グラフ' }), el('label', {}, '期間', rangeSelect)),
    rm.section,
    volume.section,
    metric.section,
  );

  const exerciseOptions = () => exercises.map((exercise) =>
    option(exercise.id, exercise.archived ? `${exercise.name}（アーカイブ）` : exercise.name));

  // アーカイブ済みの種目も過去の記録を見るために残す
  rm.select.replaceChildren(...exerciseOptions());
  volume.select.replaceChildren(...exerciseOptions());
  metric.select.replaceChildren(...metricDefs.map((def) => option(def.id, def.name)));

  if (exercises.length === 0) {
    rm.select.disabled = true;
    volume.select.disabled = true;
    rm.message.textContent = '種目がありません';
    volume.message.textContent = '種目がありません';
  }
  if (metricDefs.length === 0) {
    metric.select.disabled = true;
    metric.select.parentElement.hidden = true;
    metric.message.textContent = '指標がありません';
  }

  function drawOrMessage(part, points, opts) {
    if (!part.canvas.isConnected) return;
    if (points.length < 2) {
      part.message.textContent = points.length === 0 ? opts.empty : 'データが足りません';
      part.canvas.style.display = 'none';
      return;
    }
    part.message.textContent = '';
    part.canvas.style.display = 'block';
    drawSeries(part.canvas, points, opts);
  }

  function render() {
    if (!container.isConnected) {
      observer.disconnect();
      return;
    }
    const days = RANGES.find((range) => range.value === rangeSelect.value).days;
    const from = days ? cutoffString(days) : null;
    const inRange = (date) => !from || date >= from;

    if (exercises.length > 0) {
      const best = new Map();
      for (const set of sets) {
        if (set.exerciseId !== rm.select.value || !inRange(set.date)) continue;
        const value = estimate1RM(set.weight, set.reps);
        best.set(set.date, Math.max(best.get(set.date) ?? 0, value));
      }
      drawOrMessage(rm, toPoints(best), { unit: 'kg', kind: 'line', empty: '記録がありません' });

      const total = new Map();
      for (const set of sets) {
        if (set.exerciseId !== volume.select.value || !inRange(set.date)) continue;
        total.set(set.date, (total.get(set.date) ?? 0) + set.weight * set.reps);
      }
      drawOrMessage(volume, toPoints(total), { unit: 'kg', kind: 'bar', empty: '記録がありません' });
    }

    if (metricDefs.length > 0) {
      const def = metricDefs.find((item) => item.id === metric.select.value);
      const latest = new Map();
      for (const log of logs) {
        if (log.metricDefId !== metric.select.value || !inRange(log.date)) continue;
        latest.set(log.date, log.value);
      }
      drawOrMessage(metric, toPoints(latest), {
        unit: def?.unit === 'length' ? 'cm' : 'kg',
        kind: 'line',
        empty: '記録がありません',
      });
    }
  }

  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  });
  observer.observe(container);

  for (const select of [rangeSelect, rm.select, volume.select, metric.select]) {
    select.addEventListener('change', render);
  }

  render();
}
