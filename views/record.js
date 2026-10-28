import { getAll, put, remove } from '../db.js';
import { byId, el, iconButton, option, setStatus, setTable } from '../dom.js';
import { groupSets, groupTitle, partSummary, todayString, volumeOf } from '../training.js';
import { icon } from '../icons.js';

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
      el('label', {}, '部位', el('select', { id: 'set-part' })),
      el('label', {}, '種目',
        el('div', { class: 'with-action' },
          el('select', { id: 'set-exercise', required: '' }),
          el('button', {
            type: 'button',
            id: 'exercise-history',
            class: 'icon-btn',
            'aria-label': 'この種目の履歴',
            title: 'この種目の履歴',
          }, icon('chart')),
        )),
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
    el('p', { id: 'set-count' }),
    el('button', {
      type: 'button',
      id: 'image-btn',
      class: 'icon-btn',
      'aria-label': '画像を保存',
      title: '画像を保存',
    }, icon('camera')),
    el('div', { id: 'set-list' }),
  );
}

function buildGroup(group) {
  return el('div', { class: 'group' },
    el('h3', { text: groupTitle(group) }),
    setTable(group.sets, {
      extra: (set) => [el('div', { class: 'set-actions' },
        iconButton('pencil', '編集', () => startEditing(set)),
        iconButton('trash', '削除', async () => {
          await remove('workoutSet', set.id);
          await renderSets();
        }),
      )],
    }),
  );
}

async function renderSets() {
  const date = byId('set-date').value;
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
    card.append(
      el('h3', { text: groupTitle(group) }),
      el('div', { class: 'export-table' }, setTable(group.sets, { head: '重量(kg)' })),
    );
    total += group.sets.length;
  }

  card.append(el('p', { text: `合計 ${total} セット・ボリューム ${volumeOf(groups.flatMap((group) => group.sets))} kg` }));
  return card;
}

function fillPartOptions() {
  const parts = [...new Set(exercises.filter((e) => !e.archived).map((e) => e.bodyPart).filter(Boolean))];
  const select = byId('set-part');
  const previous = select.value;
  select.replaceChildren(option('', 'すべて'), ...parts.map((part) => option(part, part)));
  if (parts.includes(previous)) select.value = previous;
}

function fillExerciseOptions(exerciseId) {
  const part = byId('set-part').value;
  const previous = exerciseId ?? byId('set-exercise').value;
  const list = exercises.filter((e) => !e.archived && (!part || e.bodyPart === part));
  byId('set-exercise').replaceChildren(...list.map((exercise) => option(exercise.id, exercise.name)));
  if (list.some((exercise) => exercise.id === previous)) byId('set-exercise').value = previous;
}

async function reloadExercises() {
  exercises = await getAll('exercise');
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  fillPartOptions();
  fillExerciseOptions();
}

async function startEditing(set) {
  editingId = set.id;
  byId('set-date').value = set.date;
  await renderSets();
  byId('set-part').value = exercises.find((e) => e.id === set.exerciseId)?.bodyPart ?? '';
  fillExerciseOptions(set.exerciseId);
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
    await renderSets();
    setStatus(updated ? '更新しました' : '記録しました');
  });

  byId('set-cancel').addEventListener('click', () => {
    stopEditing();
    setStatus('編集をやめました');
  });

  byId('set-date').addEventListener('change', renderSets);
  byId('set-part').addEventListener('change', () => fillExerciseOptions());

  byId('exercise-history').addEventListener('click', () => {
    const exerciseId = byId('set-exercise').value;
    if (exerciseId) location.hash = `#/history?exercise=${exerciseId}`;
  });

  byId('image-btn').addEventListener('click', async () => {
    const date = byId('set-date').value;
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
      const canvas = await window.html2canvas(card, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), scale: 2 });
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
  await reloadExercises();
  wireEvents();
  await renderSets();
}
