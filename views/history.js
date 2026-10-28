import { getAll } from '../db.js';
import { el, iconButton, option, setTable } from '../dom.js';
import { WEEKDAYS, bestSet, formatDate, groupSets, groupTitle, rmText, todayString, volumeOf } from '../training.js';

export const view = { id: 'history', label: '履歴', mount };

const state = {
  year: 0,
  month: 0,
  selected: '',
  exerciseId: '',
  part: '',
  mode: 'calendar',
  // 種目ごと・部位ごとは直近この日数だけ描く（「もっと見る」で増やす）
  days: 30,
  sets: [],
  exercises: [],
};

const CSS = `
.hist-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.hist-nav button { padding: 0.4rem 0.6rem; font-size: 0.875rem; }
.hist-month { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.25rem; font-weight: 700; }
.hist-year { width: auto; padding: 0.2rem 0.3rem; font-size: 0.875rem; font-weight: 700; }
.hist-filter { margin-bottom: 0.75rem; }
.hist-mode { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.hist-mode-label { font-size: 0.875rem; }
.hist-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.hist-wd { padding: 0.25rem 0; text-align: center; font-size: 0.75rem; opacity: 0.7; }
.hist-blank { aspect-ratio: 1; }
.hist-day { display: grid; place-items: center; align-content: center; gap: 2px; aspect-ratio: 1; min-width: 0; padding: 0; color: inherit; background: transparent; border: 1px solid transparent; font-size: 0.875rem; }
.hist-day.has-record { font-weight: 700; }
.hist-day.today { border-color: var(--accent); }
.hist-day.selected { color: var(--accent-fg); background: var(--accent); border-color: var(--accent); }
.hist-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
.hist-day.selected .hist-dot { background: var(--accent-fg); }
.hist-summary { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; margin: 0 0 0.75rem; font-size: 0.875rem; opacity: 0.85; }
.hist-detail .group + .group { margin-top: 1rem; }
.hist-total { margin: 1rem 0 0; }
.hist-detail .group h4 { margin: 0.5rem 0 0.25rem; font-size: 0.9rem; }
.hist-empty { margin: 0; opacity: 0.7; }
.hist-more { margin: 1rem 0 0; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
`;

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const monthPrefix = () => `${state.year}-${pad(state.month + 1)}`;

let navLabel;
let monthLabel;
let yearSelect;
let grid;
let filter;
let filterLabel;
let partLabel;
let partSelect;
let navRow;
let modeSelect;
let detailSection;

async function load() {
  const [sets, exercises] = await Promise.all([getAll('workoutSet'), getAll('exercise')]);
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  state.sets = sets;
  state.exercises = exercises;
}

function matchesFilter(set) {
  return !state.exerciseId || set.exerciseId === state.exerciseId;
}

function monthSets() {
  const prefix = monthPrefix();
  return state.sets.filter((set) => set.date.startsWith(prefix) && matchesFilter(set));
}

function daySets() {
  return state.sets.filter((set) => set.date === state.selected && matchesFilter(set));
}

function buildCalendar() {
  const marked = new Set(monthSets().map((set) => set.date));
  const today = todayString();
  grid.replaceChildren(...WEEKDAYS.map((wd) => el('span', { class: 'hist-wd', text: wd })));

  // 月曜始まりなので日曜(0)を6として扱う
  const offset = (new Date(state.year, state.month, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(el('span', { class: 'hist-blank' }));

  for (let day = 1; day <= daysInMonth(state.year, state.month); day++) {
    const key = dateKey(state.year, state.month, day);
    const classes = ['hist-day'];
    if (marked.has(key)) classes.push('has-record');
    if (key === today) classes.push('today');
    if (key === state.selected) classes.push('selected');
    const cell = el('button', {
      type: 'button',
      'aria-pressed': key === state.selected ? 'true' : 'false',
      class: classes.join(' '),
      onclick: () => {
        state.selected = key;
        render();
      },
    }, el('span', { text: String(day) }));
    if (marked.has(key)) cell.append(el('span', { class: 'hist-dot' }));
    grid.append(cell);
  }
}

function buildDetail() {
  const sets = daySets();
  const section = el('section', { class: 'hist-detail' }, el('h2', { text: `${formatDate(state.selected)} の記録` }));

  if (sets.length === 0) {
    section.append(el('p', { class: 'hist-empty', text: '記録なし' }));
    return section;
  }

  // 記録画面と同じ構造にして見た目を揃える
  for (const group of groupSets(sets, state.exercises)) {
    section.append(el('div', { class: 'group' },
      el('h3', {}, ...groupTitle(group)),
      setTable(group.sets),
    ));
  }
  // 合計はセットの下に置く
  section.append(el('p', { class: 'hist-summary hist-total' },
    el('span', { text: `合計 ${sets.length} セット・ボリューム ${volumeOf(sets)} kg` }),
  ));
  return section;
}

// 日付の新しい順に state.days 日ぶんだけ返す
function recentDays(byDate) {
  return [...byDate].slice(0, state.days);
}

function appendMore(section, byDate) {
  const rest = byDate.size - state.days;
  if (rest <= 0) return;
  section.append(el('button', {
    type: 'button',
    class: 'hist-more',
    text: `もっと見る（残り ${rest} 日）`,
    onclick: () => {
      state.days += 30;
      render();
    },
  }));
}

// 選んだ種目のセットを日付の新しい順にまとめる
function buildExerciseHistory() {
  const name = state.exercises.find((exercise) => exercise.id === state.exerciseId)?.name ?? '種目';
  const sets = state.sets
    .filter((set) => set.exerciseId === state.exerciseId)
    .sort((a, b) => b.date.localeCompare(a.date) || a.weight - b.weight || a.reps - b.reps);

  const section = el('section', { class: 'hist-detail' }, el('h2', { text: `${name} の履歴` }));
  if (sets.length === 0) {
    section.append(el('p', { class: 'hist-empty', text: '記録なし' }));
    return section;
  }

  const byDate = new Map();
  for (const set of sets) {
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  }

  section.append(el('p', { class: 'hist-summary' },
    el('span', { text: `記録 ${byDate.size} 日・合計 ${sets.length} セット` }),
    el('span', { text: `ベスト ${rmText(bestSet(sets))}` }),
  ));

  for (const [date, list] of recentDays(byDate)) {
    section.append(el('div', { class: 'group' },
      el('h3', { text: `${formatDate(date)} ベスト ${rmText(bestSet(list))}・ボリューム ${volumeOf(list)} kg` }),
      setTable(list),
    ));
  }
  appendMore(section, byDate);
  return section;
}

// 選んだ部位のセットを日付の新しい順に、日ごとに種目でまとめる
function buildPartHistory() {
  const parts = new Map(state.exercises.map((exercise) => [exercise.id, exercise.bodyPart]));
  const sets = state.sets
    .filter((set) => !state.part || parts.get(set.exerciseId) === state.part)
    .sort((a, b) => b.date.localeCompare(a.date));

  const section = el('section', { class: 'hist-detail' },
    el('h2', { text: state.part ? `${state.part} の履歴` : 'すべての部位の履歴' }));
  if (sets.length === 0) {
    section.append(el('p', { class: 'hist-empty', text: '記録なし' }));
    return section;
  }

  const byDate = new Map();
  for (const set of sets) {
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  }

  section.append(el('p', { class: 'hist-summary' },
    el('span', { text: `記録 ${byDate.size} 日・合計 ${sets.length} セット` }),
    el('span', { text: `ボリューム ${volumeOf(sets)} kg` }),
  ));

  for (const [date, list] of recentDays(byDate)) {
    section.append(el('div', { class: 'group' },
      el('h3', { text: `${formatDate(date)} 合計 ${list.length} セット・ボリューム ${volumeOf(list)} kg` }),
      ...groupSets(list, state.exercises).map((group) => el('div', {},
        el('h4', {}, ...groupTitle(group)),
        setTable(group.sets),
      )),
    ));
  }
  appendMore(section, byDate);
  return section;
}

function render() {
  monthLabel.textContent = `${state.month + 1}月`;
  // 記録のある年を下限に、今年まで選べるようにする（記録が無い年も見られるように5年分は出す）
  const currentYear = new Date().getFullYear();
  let earliest = currentYear - 4;
  for (const set of state.sets) earliest = Math.min(earliest, Number(set.date.slice(0, 4)));
  const years = [];
  for (let year = earliest; year <= Math.max(currentYear, state.year); year += 1) years.push(year);
  yearSelect.replaceChildren(...years.map((year) => option(String(year), `${year}年`)));
  yearSelect.value = String(state.year);
  if (state.mode === 'exercise' && !state.exerciseId) {
    state.exerciseId = state.exercises.find((exercise) => !exercise.archived)?.id ?? '';
  }
  filter.value = state.exerciseId;
  partSelect.value = state.part;
  modeSelect.value = state.mode;
  navRow.hidden = state.mode !== 'calendar';
  grid.hidden = state.mode !== 'calendar';
  filterLabel.hidden = state.mode === 'part' || (state.mode === 'calendar' && state.exercises.length === 0);
  partLabel.hidden = state.mode !== 'part';
  buildCalendar();
  let next = buildDetail();
  if (state.mode === 'exercise') next = buildExerciseHistory();
  if (state.mode === 'part') next = buildPartHistory();
  detailSection.replaceWith(next);
  detailSection = next;
}

async function changeMonth(delta) {
  const moved = new Date(state.year, state.month + delta, 1);
  state.year = moved.getFullYear();
  state.month = moved.getMonth();
  await load();
  // 月を移したら、その月が今日を含むなら今日、そうでなければ1日を選ぶ
  const today = todayString();
  state.selected = today.startsWith(monthPrefix()) ? today : dateKey(state.year, state.month, 1);
  render();
}

async function changeYear(year) {
  state.year = year;
  const today = todayString();
  state.selected = today.startsWith(monthPrefix()) ? today : dateKey(state.year, state.month, 1);
  render();
}

function goToday() {
  const today = todayString();
  const [year, month] = today.split('-').map(Number);
  state.year = year;
  state.month = month - 1;
  state.selected = today;
  render();
}

async function mount(container) {
  const today = todayString();
  const [year, month] = today.split('-').map(Number);
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  Object.assign(state, {
    year,
    month: month - 1,
    selected: today,
    exerciseId: params.get('exercise') ?? '',
    part: params.get('part') ?? '',
    days: 30,
    mode: params.has('exercise') ? 'exercise' : params.has('part') ? 'part' : 'calendar',
    sets: [],
    exercises: [],
  });

  const style = el('style');
  style.textContent = CSS;
  container.append(style);

  await load();

  navLabel = el('div', { class: 'hist-month' });
  yearSelect = el('select', {
    class: 'hist-year',
    'aria-label': '年',
    onchange: (event) => changeYear(Number(event.target.value)),
  });
  monthLabel = el('span', {});
  navLabel.append(yearSelect, monthLabel);
  grid = el('div', { class: 'hist-cal' });
  modeSelect = el('select', {
    'aria-label': '表示',
    onchange: (event) => {
      state.mode = event.target.value;
      state.days = 30;
      render();
    },
  }, option('calendar', 'カレンダー'), option('exercise', '種目ごと'), option('part', '部位ごと'));
  filter = el('select', {
    onchange: (event) => {
      state.exerciseId = event.target.value;
      state.days = 30;
      render();
    },
  }, option('', 'すべての種目'), ...state.exercises
    .filter((exercise) => !exercise.archived)
    .map((exercise) => option(exercise.id, exercise.name)));

  const parts = [...new Set(state.exercises.map((exercise) => exercise.bodyPart).filter(Boolean))];
  partSelect = el('select', {
    'aria-label': '部位',
    onchange: (event) => {
      state.part = event.target.value;
      state.days = 30;
      render();
    },
  }, option('', 'すべての部位'), ...parts.map((part) => option(part, part)));

  navRow = el('div', { class: 'hist-nav' },
    iconButton('left', '前月', () => changeMonth(-1)),
    navLabel,
    iconButton('right', '翌月', () => changeMonth(1)),
    iconButton('calendar', '今日', goToday),
  );
  filterLabel = el('label', { class: 'hist-filter' }, '種目', filter);
  partLabel = el('label', { class: 'hist-filter' }, '部位', partSelect);

  container.append(
    el('section', {},
      el('div', { class: 'hist-mode' },
        el('span', { class: 'hist-mode-label', text: '表示' }),
        modeSelect,
      ),
      navRow,
      filterLabel,
      partLabel,
      grid,
    ),
  );

  detailSection = el('section');
  container.append(detailSection);
  render();
}
