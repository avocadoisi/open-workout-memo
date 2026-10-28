import { getAll } from '../db.js';
import { el, groupSets, groupTitle, iconButton, option, rmValue, todayString, volumeOf } from '../ui.js';

export const view = { id: 'history', label: '履歴', mount };

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

const state = {
  year: 0,
  month: 0,
  selected: '',
  exerciseId: '',
  sets: [],
  exercises: [],
};

const CSS = `
.hist-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.hist-nav button { padding: 0.4rem 0.6rem; font-size: 0.875rem; }
.hist-month { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.25rem; font-weight: 700; }
.hist-year { width: auto; padding: 0.2rem 0.3rem; font-size: 0.875rem; font-weight: 700; }
.hist-filter { margin-bottom: 0.75rem; }
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
.hist-empty { margin: 0; opacity: 0.7; }
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

function formatDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = WEEKDAYS[(new Date(year, month - 1, day).getDay() + 6) % 7];
  return `${year}年${month}月${day}日(${weekday})`;
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

  section.append(el('p', { class: 'hist-summary' },
    el('span', { text: `合計 ${sets.length} セット・ボリューム ${volumeOf(sets)} kg` }),
  ));

  // 記録画面と同じ構造にして見た目を揃える
  for (const group of groupSets(sets, state.exercises)) {
    section.append(el('div', { class: 'group' },
      el('h3', { text: groupTitle(group) }),
      el('div', { class: 'set-head' },
        el('span', { text: '重量' }),
        el('span', {}),
        el('span', { text: '回数' }),
        el('span', { text: '1RM' }),
      ),
      ...group.sets.map((set) => el('div', { class: 'set-row' },
        el('div', { class: 'set-main' },
          el('span', { class: 'set-num', text: String(set.weight) }),
          el('span', { class: 'set-times', text: '×' }),
          el('span', { class: 'set-num', text: String(set.reps) }),
          el('span', { class: 'set-rm', text: rmValue(set) }),
        ),
        ...(set.memo ? [el('small', { text: set.memo })] : []),
      )),
    ));
  }
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
  filter.value = state.exerciseId;
  buildCalendar();
  const next = buildDetail();
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
  Object.assign(state, {
    year,
    month: month - 1,
    selected: today,
    exerciseId: '',
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
  filter = el('select', {
    onchange: (event) => {
      state.exerciseId = event.target.value;
      render();
    },
  }, option('', 'すべての種目'), ...state.exercises
    .filter((exercise) => !exercise.archived)
    .map((exercise) => option(exercise.id, exercise.name)));

  container.append(
    el('section', {},
      el('div', { class: 'hist-nav' },
        iconButton('left', '前月', () => changeMonth(-1)),
        navLabel,
        iconButton('right', '翌月', () => changeMonth(1)),
        iconButton('calendar', '今日', goToday),
      ),
      el('label', { class: 'hist-filter' }, '種目', filter),
      grid,
    ),
  );

  detailSection = el('section');
  container.append(detailSection);
  render();
}
