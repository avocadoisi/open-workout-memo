import { getAll, put, remove } from '../db.js';
import { byId, el, iconButton, option, setStatus, setTable } from '../dom.js';
import {
  groupSets,
  groupTitle,
  latestBodyweight,
  memoWithBodyweight,
  partSummary,
  stripBodyweightNote,
  todayString,
  volumeOf,
  weightText,
} from '../training.js';
import { icon } from '../icons.js';
import { moveItem, orderForSave, persistSetOrder } from './order.js';
// 並び順の設定キーは views/settings.js と共有する（prefs.js を介さない）
function newestFirst() {
  return localStorage.getItem('owa-set-order') === 'desc';
}

export const view = { id: 'record', label: '記録', mount };

const MEMO_MAX = 30;

let exercises = [];
// 編集中のセット id。null なら新規入力
let editingId = null;
// 編集中のセットの createdAt。古い行は未保存なので undefined のまま引き継ぐ
let editingCreatedAt;
// 編集中のセットの order。手動で並べ替えた行は編集しても位置を変えない
let editingOrder;
// 画面に出している表示順のグループ。↑↓はこの配列を動かす
let displayGroups = [];
// 保存と描き直しの間に続けて押されても、古い順序で上書きしない
let movingGroups = false;
// 編集開始や保存の待機中にコピーが入ったら、古い処理の続きを捨てるための番号
let formRevision = 0;

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
        el('input', { type: 'number', id: 'set-weight', min: '0', step: 'any', inputmode: 'decimal', required: '' })),
      el('label', { class: 'set-bodyweight' },
        el('input', { type: 'checkbox', id: 'set-bodyweight' }),
        '自重'),
      el('label', {}, '回数',
        el('input', { type: 'number', id: 'set-reps', min: '1', step: 'any', inputmode: 'numeric', required: '' })),
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
    el('button', {
      type: 'button',
      id: 'image-btn',
      class: 'icon-btn',
      'aria-label': '画像を保存',
      title: '画像を保存',
    }, icon('camera')),
    el('div', { id: 'set-list' }),
    el('p', { id: 'set-count' }),
  );
}

function moveButton(name, label, disabled, onClick) {
  const button = iconButton(name, label, onClick);
  button.disabled = disabled;
  return button;
}

function buildGroup(group, index) {
  const exerciseId = group.sets[0].exerciseId;
  const select = el('select', {
    class: 'group-exercise-select',
    'aria-label': 'このグループの種目を変更',
    onchange: (event) => {
      changeGroupExercise(group.sets, event.target);
    },
  }, ...exerciseChoices(exerciseId).map(({ id, name }) => option(id, name)));
  select.value = exerciseId;

  return el('div', { class: 'group' },
    el('h3', {}, ...groupTitle(group),
      el('div', { class: 'group-tools' },
        select,
        el('div', { class: 'group-actions' },
          groupMoveButton('up', '上へ移動', index, -1),
          groupMoveButton('down', '下へ移動', index, 1),
        ))),
    setTable(group.sets, {
      extra: (set, index) => [el('div', { class: 'set-actions' },
        iconButton('pencil', '編集', () => startEditing(set)),
        iconButton('copy', 'コピー', () => copySet(set)),
        moveButton('up', '上へ移動', index === 0, () => moveSet(group, index, -1)),
        moveButton('down', '下へ移動', index === group.sets.length - 1, () => moveSet(group, index, 1)),
        iconButton('trash', '削除', async () => {
          await remove('workoutSet', set.id);
          await renderSets();
        }),
      )],
    }),
  );
}

// グループの中だけで隣と入れ替える。グループをまたぐ移動はしない
async function moveSet(group, index, delta) {
  if (!moveItem(group.sets, index, delta)) return;
  await persistSetOrder(orderForSave(displayGroups, newestFirst()));
  await renderSets();
}

async function renderSets() {
  const list = byId('set-list');
  if (!list) return;
  const date = byId('set-date').value;
  const sets = (await getAll('workoutSet')).filter((set) => set.date === date);
  // 読み込み待ちの間に画面を離れていたら、消えた画面は触らない
  if (!list.isConnected) return;
  // 並び替えで order が変わっても、編集中のセットは最新の値を引き継ぐ
  if (editingId !== null) {
    const editing = sets.find((set) => set.id === editingId);
    if (editing) editingOrder = editing.order;
  }

  byId('set-count').textContent = sets.length
    ? `合計 ${sets.length} セット・ボリューム ${volumeOf(sets)} kg`
    : '合計 0 セット';
  const groups = groupSets(sets, exercises);
  if (newestFirst()) {
    groups.reverse();
    for (const group of groups) group.sets.reverse();
  }
  displayGroups = groups;
  list.replaceChildren(...groups.map((group, index) => buildGroup(group, index)));
}

function buildExportCard(date, groups) {
  const card = el('div', { class: 'export-card' }, el('h2', { text: `トレーニング記録 ${date}` }));

  const parts = partSummary(groups);
  if (parts) card.append(el('p', { class: 'export-parts', text: `部位 ${parts}` }));

  let total = 0;
  for (const group of groups) {
    card.append(
      el('h3', {}, ...groupTitle(group)),
      el('div', { class: 'export-table' }, setTable(group.sets, { head: '重量' })),
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
  const current = exercises.find((e) => e.id === previous);
  // アーカイブ済みでも、編集中の種目は選択肢から消さない（部位を変えたときは除く）
  if (current && (!part || current.bodyPart === part) && !list.some((e) => e.id === previous)) {
    list.unshift(current);
  }
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
  const revision = ++formRevision;
  editingId = set.id;
  editingCreatedAt = set.createdAt;
  editingOrder = set.order;
  byId('set-date').value = set.date;
  await renderSets();
  // 待っている間にコピーや別の編集が始まったら、こちらの続きは捨てる
  if (revision !== formRevision) return;
  byId('set-part').value = exercises.find((e) => e.id === set.exerciseId)?.bodyPart ?? '';
  fillExerciseOptions(set.exerciseId);
  byId('set-bodyweight').checked = Boolean(set.bodyweight);
  applyBodyweight();
  if (!set.bodyweight) byId('set-weight').value = String(set.weight);
  byId('set-reps').value = String(set.reps);
  // 体重の注記は保存時に付け直すので、ユーザーのメモだけを見せる
  byId('set-memo').value = stripBodyweightNote(set.memo);
  byId('set-submit').textContent = '更新';
  byId('set-cancel').hidden = false;
  byId('set-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  (set.bodyweight ? byId('set-reps') : byId('set-weight')).focus();
}

// 自重のときは重量を入力させない（required も外す）
function applyBodyweight() {
  const bodyweight = byId('set-bodyweight').checked;
  const weight = byId('set-weight');
  weight.disabled = bodyweight;
  if (bodyweight) {
    weight.removeAttribute('required');
    weight.value = '';
  } else {
    weight.setAttribute('required', '');
  }
}

// 同じ日付・種目・重量・回数のセットを、その場でもう1行追加する
async function copySet(set) {
  const form = byId('set-form');
  const row = {
    id: crypto.randomUUID(),
    date: set.date,
    exerciseId: set.exerciseId,
    weight: set.weight,
    reps: set.reps,
    memo: '',
    createdAt: Date.now(),
  };
  // 自重は体重の記録も引き継ぐ（無い行には足さない）
  if (set.bodyweight) {
    row.bodyweight = true;
    if (Number.isFinite(set.bodyweightKg)) row.bodyweightKg = set.bodyweightKg;
  }
  try {
    await put('workoutSet', row);
  } catch (error) {
    setStatus(`コピーに失敗しました: ${error.message}`, true);
    return;
  }
  // 保存待ちの間に画面を離れていたら、消えた画面は触らない
  if (!form.isConnected) return;
  await renderSets();
  byId('set-list').querySelector(`[data-id="${CSS.escape(row.id)}"]`)?.classList.add('is-saved');
  setStatus(`${weightText(set)}${set.bodyweight ? '' : ' kg'} × ${set.reps} 回をコピーしました`);
}

function stopEditing() {
  editingId = null;
  editingCreatedAt = undefined;
  editingOrder = undefined;
  byId('set-submit').textContent = '保存';
  byId('set-cancel').hidden = true;
}

function clearFields(ids) {
  for (const id of ids) byId(id).value = '';
}

function wireEvents() {
  byId('set-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const date = byId('set-date').value;
    const exerciseId = byId('set-exercise').value;
    const bodyweight = byId('set-bodyweight').checked;
    const weight = bodyweight ? 0 : byId('set-weight').valueAsNumber;
    const reps = byId('set-reps').valueAsNumber;
    const typedMemo = byId('set-memo').value;
    // 後の await 中に編集が始まったかを、この番号で見分ける
    const revision = formRevision;
    const id = editingId ?? crypto.randomUUID();
    const updated = editingId !== null;
    const createdAt = editingCreatedAt;
    const order = editingOrder;

    if (!date || !exerciseId) {
      setStatus('日付と種目を入力してください', true);
      return;
    }
    if (!bodyweight && (!Number.isFinite(weight) || weight <= 0)) {
      setStatus('重量は0より大きい数値で入力してください', true);
      return;
    }
    if (!Number.isFinite(reps) || reps <= 0) {
      setStatus('回数は0より大きい数値で入力してください', true);
      return;
    }

    // 自重は記録日までの直近30日の体重を、メモの注記と1RM換算に使う
    let bodyweightKg;
    if (bodyweight) {
      const [defs, logs] = await Promise.all([getAll('metricDef'), getAll('metricLog')]);
      const weightDefIds = defs.filter((def) => def.name === '体重' && def.unit === 'weight').map((def) => def.id);
      bodyweightKg = latestBodyweight(logs, weightDefIds, date);
    }
    const memo = memoWithBodyweight(typedMemo, bodyweightKg, MEMO_MAX);

    const row = { id, date, exerciseId, weight, reps, memo };
    if (bodyweight) {
      row.bodyweight = true;
      if (bodyweightKg !== undefined) row.bodyweightKg = bodyweightKg;
    }
    // 並び順は保存時刻。編集では元の時刻と手動の並びを引き継ぎ、無い古い行には足さない
    if (!updated) row.createdAt = Date.now();
    else {
      if (createdAt !== undefined) row.createdAt = createdAt;
      if (order !== undefined) row.order = order;
    }
    await put('workoutSet', row);
    // 保存待ちの間にコピーされた入力を消さない
    if (revision === formRevision) {
      stopEditing();
      // 同じ重量・同じ自重で続けて記録する導線を優先し、回数とメモだけ消す
      clearFields(['set-reps', 'set-memo']);
    }
    await renderSets();
    // 保存した行だけ、下から出す動きで示す
    byId('set-list').querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('is-saved');
    setStatus(updated ? '更新しました' : '記録しました');
    // 重量は残っているので、そのまま回数を入れられるようにする
    byId('set-reps').focus();
  });

  byId('set-cancel').addEventListener('click', () => {
    stopEditing();
    byId('set-bodyweight').checked = false;
    applyBodyweight();
    clearFields(['set-weight', 'set-reps', 'set-memo']);
    setStatus('編集をやめました');
  });

  byId('set-bodyweight').addEventListener('change', applyBodyweight);

  byId('set-date').addEventListener('change', renderSets);
  byId('set-exercise').addEventListener('change', () => {
    // 種目が変わると前の種目の重量は意味を持たないので消す
    clearFields(['set-weight']);
  });
  byId('set-part').addEventListener('change', () => {
    // 部位の変更で種目が切り替わったときも重量を消す
    const previous = byId('set-exercise').value;
    fillExerciseOptions();
    if (byId('set-exercise').value !== previous) clearFields(['set-weight']);
  });

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
  // 画面を作り直したら編集状態も捨てる。前の画面の編集開始処理も無効にする
  stopEditing();
  formRevision++;
  const today = todayString();
  byId('set-date').value = today;
  byId('set-bodyweight').checked = false;
  applyBodyweight();
  await reloadExercises();
  wireEvents();
  await renderSets();
}
