import { getAll, put, remove } from '../db.js';
import { byId, el, option, setStatus, todayString, rmText, rmValue, bestSet, volumeOf } from '../ui.js';

export const view = { id: 'record', label: '記録', mount };

const MEMO_MAX = 30;

let exercises = [];
// 編集中のセット id。null なら新規入力
let editingId = null;

function buildForm() {
  return el('section', {},
    el('h2', { text: 'セットを記録' }),
    el('form', { id: 'set-form' },
      el('label', {}, '日付', el('input', { type: 'date', id: 'set-date', required: '' })),
      el('label', {}, '種目', el('select', { id: 'set-exercise', required: '' })),
      el('label', {}, '重量 (kg)',
        el('input', { type: 'number', id: 'set-weight', min: '0', step: '0.5', inputmode: 'decimal', required: '' })),
      el('label', {}, '回数',
        el('input', { type: 'number', id: 'set-reps', min: '1', step: '1', inputmode: 'numeric', required: '' })),
      el('label', {}, 'メモ', el('input', { type: 'text', id: 'set-memo', maxlength: String(MEMO_MAX) })),
      el('div', { class: 'form-actions' },
        el('button', { type: 'submit', id: 'set-submit', text: '保存' }),
        el('button', { type: 'button', id: 'set-cancel', text: 'キャンセル', hidden: '' }),
      ),
    ),
  );
}

function buildList() {
  return el('section', {},
    el('h2', { text: '記録' }),
    el('label', {}, '日付', el('input', { type: 'date', id: 'list-date' })),
    el('p', { id: 'set-count' }),
    el('button', { type: 'button', id: 'image-btn', text: '画像を保存' }),
    el('div', { id: 'set-list' }),
  );
}

function groupSets(sets, exercises) {
  const found = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groups = new Map();
  for (const set of sets) {
    if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
    groups.get(set.exerciseId).push(set);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({
      name: found.get(id)?.name ?? '不明な種目',
      bodyPart: found.get(id)?.bodyPart ?? '',
      sets: list,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

function groupTitle(group) {
  const part = group.bodyPart ? `（${group.bodyPart}）` : '';
  return `${group.name}${part} ベスト ${rmText(bestSet(group.sets))}・ボリューム ${volumeOf(group.sets)} kg`;
}

// 部位はこの順で並べる。自由入力の部位は後ろ
const PART_ORDER = ['腕', '肩', '背中', '胸', '脚'];

function partSummary(groups) {
  const parts = [...new Set(groups.map((group) => group.bodyPart).filter(Boolean))];
  return parts
    .sort((a, b) => (PART_ORDER.indexOf(a) + 1 || 99) - (PART_ORDER.indexOf(b) + 1 || 99))
    .join('・');
}

function buildGroup(group) {
  const groupEl = el('div', { class: 'group' });
  groupEl.append(el('h3', { text: groupTitle(group) }));

  const sets = group.sets;

  // id はランダムなので、表示順は重量と回数で決める
  sets.sort((a, b) => a.weight - b.weight || a.reps - b.reps);

  groupEl.append(el('div', { class: 'set-head' },
    el('span', { text: '重量' }),
    el('span', {}),
    el('span', { text: '回数' }),
    el('span', { text: '1RM' }),
  ));

  for (const set of sets) {
    const main = el('span', { class: 'set-main' },
      el('span', { class: 'set-num', text: String(set.weight) }),
      el('span', { class: 'set-times', text: '×' }),
      el('span', { class: 'set-num', text: String(set.reps) }),
      el('span', { class: 'set-rm', text: rmValue(set) }),
    );
    const row = el('div', { class: 'set-row' }, main);

    if (set.memo) row.append(el('small', { text: set.memo }));

    row.append(el('div', { class: 'set-actions' },
      el('button', { type: 'button', text: '編集', onclick: () => startEditing(set) }),
      el('button', {
        type: 'button',
        text: '削除',
        onclick: async () => {
          await remove('workoutSet', set.id);
          await renderSets();
        },
      }),
    ));
    groupEl.append(row);
  }
  return groupEl;
}

async function renderSets() {
  const date = byId('list-date').value;
  const sets = (await getAll('workoutSet')).filter((set) => set.date === date);

  byId('set-count').textContent = sets.length
    ? `合計 ${sets.length} セット・ボリューム ${volumeOf(sets)} kg`
    : '合計 0 セット';
  byId('set-list').replaceChildren(
    ...groupSets(sets, exercises).map((group) => buildGroup(group)),
  );
}

function buildExportCard(date, groups) {
  const card = el('div', { class: 'export-card' }, el('h2', { text: `トレーニング記録 ${date}` }));

  const parts = partSummary(groups);
  if (parts) card.append(el('p', { class: 'export-parts', text: `部位 ${parts}` }));

  let total = 0;
  for (const group of groups) {
    const list = el('ul', {}, ...group.sets.map((set) =>
      el('li', { text: `${set.weight} kg × ${set.reps} 回　${rmText(set)}${set.memo ? `　${set.memo}` : ''}` }),
    ));
    card.append(el('h3', { text: groupTitle(group) }), list);
    total += group.sets.length;
  }

  card.append(el('p', { text: `合計 ${total} セット・ボリューム ${volumeOf(groups.flatMap((group) => group.sets))} kg` }));
  return card;
}

async function reloadExercises() {
  exercises = await getAll('exercise');
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  byId('set-exercise').replaceChildren(
    ...exercises
      .filter((exercise) => !exercise.archived)
      .map((exercise) => option(exercise.id, exercise.name)),
  );
}

function startEditing(set) {
  editingId = set.id;
  byId('set-date').value = set.date;
  byId('set-exercise').value = set.exerciseId;
  byId('set-weight').value = String(set.weight);
  byId('set-reps').value = String(set.reps);
  byId('set-memo').value = set.memo ?? '';
  byId('set-submit').textContent = '更新';
  byId('set-cancel').hidden = false;
  byId('set-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  byId('set-weight').focus();
}

function stopEditing() {
  editingId = null;
  byId('set-submit').textContent = '保存';
  byId('set-cancel').hidden = true;
  for (const id of ['set-weight', 'set-reps', 'set-memo']) byId(id).value = '';
}

function wireEvents() {
  byId('set-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const date = byId('set-date').value;
    const exerciseId = byId('set-exercise').value;
    const weight = byId('set-weight').valueAsNumber;
    const reps = byId('set-reps').valueAsNumber;
    const memo = byId('set-memo').value.trim().slice(0, MEMO_MAX);

    if (!date || !exerciseId) {
      setStatus('日付と種目を入力してください', true);
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setStatus('重量は0より大きい数値で入力してください', true);
      return;
    }
    if (!Number.isFinite(reps) || reps <= 0) {
      setStatus('回数は0より大きい数値で入力してください', true);
      return;
    }

    await put('workoutSet', {
      id: editingId ?? crypto.randomUUID(),
      date,
      exerciseId,
      weight,
      reps,
      memo,
    });
    const updated = editingId !== null;
    stopEditing();
    byId('list-date').value = date;
    await renderSets();
    setStatus(updated ? '更新しました' : '記録しました');
  });

  byId('set-cancel').addEventListener('click', () => {
    stopEditing();
    setStatus('編集をやめました');
  });

  byId('list-date').addEventListener('change', renderSets);

  byId('image-btn').addEventListener('click', async () => {
    const date = byId('list-date').value;
    if (!date) {
      setStatus('日付を選んでください', true);
      return;
    }
    const sets = (await getAll('workoutSet')).filter((set) => set.date === date);
    if (sets.length === 0) {
      setStatus('この日の記録がないため画像化できません', true);
      return;
    }
    if (typeof window.html2canvas !== 'function') {
      setStatus('画像化ライブラリを読み込めませんでした', true);
      return;
    }

    const card = buildExportCard(date, groupSets(sets, exercises));
    document.body.append(card);
    try {
      const canvas = await window.html2canvas(card, { backgroundColor: '#fbf1c7', scale: 2 });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: `open-workout-memo-${date}.png` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus('画像を保存しました');
    } catch (error) {
      setStatus(`画像の作成に失敗しました: ${error.message}`, true);
    } finally {
      card.remove();
    }
  });
}

async function mount(container) {
  container.append(buildForm(), buildList());
  const today = todayString();
  byId('set-date').value = today;
  byId('list-date').value = today;
  await reloadExercises();
  wireEvents();
  await renderSets();
}
