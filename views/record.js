import { getAll, put, remove } from '../db.js';
import { byId, el, option, setStatus, todayString, rmText, bestSet } from '../ui.js';

export const view = { id: 'record', label: '記録', mount };

let exercises = [];

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
      el('label', {}, 'メモ', el('input', { type: 'text', id: 'set-memo', maxlength: '200' })),
      el('button', { type: 'submit', text: '保存' }),
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

function groupSets(sets, names) {
  const groups = new Map();
  for (const set of sets) {
    if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
    groups.get(set.exerciseId).push(set);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({ name: names.get(id) ?? '不明な種目', sets: list }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

function buildGroup(name, sets) {
  const group = el('div', { class: 'group' });
  group.append(el('h3', { text: `${name} ベスト ${rmText(bestSet(sets))}` }));

  // id はランダムなので、表示順は重量と回数で決める
  sets.sort((a, b) => a.weight - b.weight || a.reps - b.reps);

  for (const set of sets) {
    const main = el('span', { class: 'set-main' },
      el('span', { text: `${set.weight} kg × ${set.reps} 回` }),
      el('span', { class: 'set-rm', text: rmText(set) }),
    );
    const row = el('div', { class: 'set-row' }, main);

    if (set.memo) row.append(el('small', { text: set.memo }));

    row.append(el('button', {
      type: 'button',
      text: '削除',
      onclick: async () => {
        await remove('workoutSet', set.id);
        await renderSets();
      },
    }));
    group.append(row);
  }
  return group;
}

async function renderSets() {
  const date = byId('list-date').value;
  const sets = (await getAll('workoutSet')).filter((set) => set.date === date);
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  byId('set-count').textContent = `合計 ${sets.length} セット`;
  byId('set-list').replaceChildren(
    ...groupSets(sets, names).map((group) => buildGroup(group.name, group.sets)),
  );
}

function buildExportCard(date, groups) {
  const card = el('div', { class: 'export-card' }, el('h2', { text: `トレーニング記録 ${date}` }));

  let total = 0;
  for (const group of groups) {
    const list = el('ul', {}, ...group.sets.map((set) =>
      el('li', { text: `${set.weight} kg × ${set.reps} 回　${rmText(set)}${set.memo ? `　${set.memo}` : ''}` }),
    ));
    card.append(el('h3', { text: `${group.name} ベスト ${rmText(bestSet(group.sets))}` }), list);
    total += group.sets.length;
  }

  card.append(el('p', { text: `合計 ${total} セット` }));
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

function wireEvents() {
  byId('set-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const date = byId('set-date').value;
    const exerciseId = byId('set-exercise').value;
    const weight = byId('set-weight').valueAsNumber;
    const reps = byId('set-reps').valueAsNumber;
    const memo = byId('set-memo').value.trim();

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

    await put('workoutSet', { id: crypto.randomUUID(), date, exerciseId, weight, reps, memo });
    byId('set-weight').value = '';
    byId('set-reps').value = '';
    byId('set-memo').value = '';
    byId('list-date').value = date;
    await renderSets();
    setStatus('記録しました');
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

    const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
    const card = buildExportCard(date, groupSets(sets, names));
    document.body.append(card);
    try {
      const canvas = await window.html2canvas(card, { backgroundColor: '#ffffff', scale: 2 });
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
