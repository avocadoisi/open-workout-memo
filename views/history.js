import { getAll } from '../db.js';
import { el, iconButton, option, setTable } from '../dom.js';
import { bestSet, calendarWeekdays, exerciseKeptInPart, exercisesForPart, firstDayOffset, formatDate, groupSets, groupTitle, orderKey, rmText, setSummary, sortByTrainingDays, sortParts, todayString, volumeOf } from '../training.js';

export const view = { id: 'history', label: '履歴', mount };

const state = {
  year: 0,
  month: 0,
  selected: '',
  exerciseId: '',
  part: '',
  // 種目ごとモードの種目セレクトを絞る部位（部位ごとモードの state.part とは別に持つ）
  exPart: '',
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

// 週の始まりは設定画面と同じキー。設定画面が prefs.js の新旧混在に耐えるよう、
// キーと読み書きは view ごとに完結させる（ORDER_KEY と同じ方針）
const WEEK_START_KEY = 'owa-week-start';

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
let exPartLabel;
let exPartSelect;
let navRow;
let modeSelect;
let detailSection;

async function load() {
  const [sets, exercises] = await Promise.all([getAll('workoutSet'), getAll('exercise')]);
  state.sets = sets;
  // 種目セレクトは最後にやった日付が新しい順（部位で絞っても同じ順）
  state.exercises = sortByTrainingDays(exercises, sets);
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
  const start = localStorage.getItem(WEEK_START_KEY) === 'sun' ? 'sun' : 'mon';
  grid.replaceChildren(...calendarWeekdays(start).map((wd) => el('span', { class: 'hist-wd', text: wd })));

  const offset = firstDayOffset(state.year, state.month, start);
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

  // 種目で絞っても split が再結合されないよう、日全体でグループを作ってから絞る
  const dayAll = state.sets.filter((set) => set.date === state.selected);
  const groups = groupSets(dayAll, state.exercises)
    .filter((group) => !state.exerciseId || group.sets[0].exerciseId === state.exerciseId);

  // 記録画面と同じ構造にして見た目を揃える
  for (const group of groups) {
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

// 選んだ種目のセットを日付の新しい順に、split の区切りを保ってまとめる
function buildExerciseHistory() {
  const name = state.exercises.find((exercise) => exercise.id === state.exerciseId)?.name ?? '種目';
  const all = [...state.sets]
    .sort((a, b) => b.date.localeCompare(a.date) || orderKey(a) - orderKey(b));

  const byDate = new Map();
  for (const set of all) {
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  }

  // 種目で絞る前に日全体で run を作り、split を再結合しない
  const groupsByDate = new Map();
  for (const [date, list] of byDate) {
    const groups = groupSets(list, state.exercises)
      .filter((group) => group.sets[0].exerciseId === state.exerciseId);
    if (groups.length > 0) groupsByDate.set(date, groups);
  }

  const section = el('section', { class: 'hist-detail' }, el('h2', { text: `${name} の履歴` }));
  if (groupsByDate.size === 0) {
    section.append(el('p', { class: 'hist-empty', text: '記録なし' }));
    return section;
  }

  const sets = [...groupsByDate.values()].flatMap((groups) => groups.flatMap((group) => group.sets));
  const best = bestSet(sets);
  section.append(el('p', { class: 'hist-summary' },
    el('span', { text: `記録 ${groupsByDate.size} 日・合計 ${sets.length} セット` }),
    el('span', { text: `ベスト ${rmText(best)}` }),
  ));

  section.append(el('div', { class: 'hist-best' },
    el('h3', { class: 'hist-best-label', text: '1RM換算のベスト' }),
    el('p', { class: 'hist-best-row' },
      el('strong', { class: 'hist-best-set', text: setSummary(best) }),
      el('span', { class: 'hist-best-rm', text: rmText(best) }),
      el('span', { class: 'hist-best-date', text: formatDate(best.date) }),
    ),
  ));

  for (const [date, groups] of recentDays(groupsByDate)) {
    const list = groups.flatMap((group) => group.sets);
    section.append(el('div', { class: 'group' },
      el('h3', { text: `${formatDate(date)} ベスト ${rmText(bestSet(list))}・ボリューム ${volumeOf(list)} kg` }),
      ...groups.map((group) => setTable(group.sets)),
    ));
  }
  appendMore(section, groupsByDate);
  return section;
}

// 選んだ部位のセットを日付の新しい順に、日ごとに種目でまとめる
function buildPartHistory() {
  const all = [...state.sets].sort((a, b) => b.date.localeCompare(a.date));
  const byDate = new Map();
  for (const set of all) {
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  }

  // 部位で絞る前に日ごとのグループ（split の境界）を作る
  const groupsByDate = new Map();
  for (const [date, list] of byDate) {
    const groups = groupSets(list, state.exercises)
      .filter((group) => !state.part || group.bodyPart === state.part);
    if (groups.length > 0) groupsByDate.set(date, groups);
  }

  const section = el('section', { class: 'hist-detail' },
    el('h2', { text: state.part ? `${state.part} の履歴` : 'すべての部位の履歴' }));
  if (groupsByDate.size === 0) {
    section.append(el('p', { class: 'hist-empty', text: '記録なし' }));
    return section;
  }

  const sets = [...groupsByDate.values()].flatMap((groups) => groups.flatMap((group) => group.sets));
  section.append(el('p', { class: 'hist-summary' },
    el('span', { text: `記録 ${groupsByDate.size} 日・合計 ${sets.length} セット` }),
    el('span', { text: `ボリューム ${volumeOf(sets)} kg` }),
  ));

  for (const [date, groups] of recentDays(groupsByDate)) {
    const list = groups.flatMap((group) => group.sets);
    section.append(el('div', { class: 'group' },
      el('h3', { text: `${formatDate(date)} 合計 ${list.length} セット・ボリューム ${volumeOf(list)} kg` }),
      ...groups.map((group) => el('div', {},
        el('h4', {}, ...groupTitle(group)),
        setTable(group.sets),
      )),
    ));
  }
  appendMore(section, groupsByDate);
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
  // 種目セレクトの選択肢は部位の絞り込みに追従させる
  filter.replaceChildren(option('', 'すべての種目'),
    ...exercisesForPart(state.exercises, state.exPart).map((exercise) => option(exercise.id, exercise.name)));
  filter.value = state.exerciseId;
  exPartSelect.value = state.exPart;
  exPartLabel.hidden = state.mode !== 'exercise';
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

  // URL で種目ごとモードに入ったとき、種目指定が無ければ先頭の種目を選んでおく
  if (state.mode === 'exercise' && !state.exerciseId) {
    state.exerciseId = state.exercises.find((exercise) => !exercise.archived)?.id ?? '';
  }

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
      // 種目ごとに入ったばかりで種目が未選択なら、先頭の種目を選んでおく
      if (state.mode === 'exercise' && !state.exerciseId) {
        state.exerciseId = state.exercises.find((exercise) => !exercise.archived)?.id ?? '';
      }
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

  const parts = sortParts([...new Set(state.exercises.map((exercise) => exercise.bodyPart).filter(Boolean))]);
  partSelect = el('select', {
    'aria-label': '部位',
    onchange: (event) => {
      state.part = event.target.value;
      state.days = 30;
      render();
    },
  }, option('', 'すべての部位'), ...parts.map((part) => option(part, part)));

  // 種目ごとモード用の部位セレクト。変えたら種目の選択肢を絞り、選択中の種目がその部位に無ければ「すべての種目」に戻す
  exPartSelect = el('select', {
    'aria-label': '部位（種目の絞り込み）',
    onchange: (event) => {
      state.exPart = event.target.value;
      state.exerciseId = exerciseKeptInPart(state.exerciseId, state.exercises, state.exPart);
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
  exPartLabel = el('label', { class: 'hist-filter' }, '部位', exPartSelect);
  partLabel = el('label', { class: 'hist-filter' }, '部位', partSelect);

  container.append(
    el('section', {},
      el('div', { class: 'hist-mode' },
        el('span', { class: 'hist-mode-label', text: '表示' }),
        modeSelect,
      ),
      navRow,
      filterLabel,
      exPartLabel,
      partLabel,
      grid,
    ),
  );

  detailSection = el('section');
  container.append(detailSection);
  render();
}
