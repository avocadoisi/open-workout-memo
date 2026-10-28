import { getAll, put, remove, seedIfEmpty, exportAll, replaceAll } from './db.js';

const byId = (id) => document.getElementById(id);

let exercises = [];
let metricDefs = [];
let statusTimer;

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function unitLabel(unit) {
  return unit === 'length' ? 'cm' : 'kg';
}

function setStatus(message, isError = false) {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = '';
    status.classList.remove('error');
  }, 5000);
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function buildGroup(name, sets) {
  const group = document.createElement('div');
  group.className = 'group';
  const heading = document.createElement('h3');
  heading.textContent = name;
  group.append(heading);

  // id はランダムなので、表示順は重量と回数で決める
  sets.sort((a, b) => a.weight - b.weight || a.reps - b.reps);

  for (const set of sets) {
    const row = document.createElement('div');
    row.className = 'set-row';
    const main = document.createElement('span');
    main.textContent = `${set.weight} kg × ${set.reps} 回`;
    row.append(main);

    if (set.memo) {
      const memo = document.createElement('small');
      memo.textContent = set.memo;
      row.append(memo);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = '削除';
    deleteButton.addEventListener('click', async () => {
      await remove('workoutSet', set.id);
      await renderSets();
    });
    row.append(deleteButton);
    group.append(row);
  }
  return group;
}

async function renderSets() {
  const date = byId('list-date').value;
  const sets = (await getAll('workoutSet')).filter((set) => set.date === date);
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  const groups = new Map();
  for (const set of sets) {
    if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
    groups.get(set.exerciseId).push(set);
  }

  byId('set-count').textContent = `合計 ${sets.length} セット`;
  const ids = [...groups.keys()].sort((a, b) =>
    (names.get(a) ?? '不明な種目').localeCompare(names.get(b) ?? '不明な種目', 'ja'),
  );
  byId('set-list').replaceChildren(
    ...ids.map((id) => buildGroup(names.get(id) ?? '不明な種目', groups.get(id))),
  );
}

async function reloadExercises() {
  exercises = await getAll('exercise');
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const active = exercises.filter((exercise) => !exercise.archived);
  const select = byId('set-exercise');
  const previous = select.value;
  select.replaceChildren(...active.map((exercise) => option(exercise.id, exercise.name)));
  if (active.some((exercise) => exercise.id === previous)) select.value = previous;

  byId('exercise-list').replaceChildren(
    ...exercises.map((exercise) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${exercise.name}（${exercise.bodyPart}）`;
      item.append(label);
      if (exercise.archived) {
        item.classList.add('archived');
        label.textContent += ' アーカイブ済み';
        return item;
      }

      const archiveButton = document.createElement('button');
      archiveButton.type = 'button';
      archiveButton.textContent = 'アーカイブ';
      archiveButton.addEventListener('click', async () => {
        await put('exercise', { ...exercise, archived: true });
        await reloadExercises();
        await renderSets();
        setStatus('種目をアーカイブしました');
      });
      item.append(archiveButton);
      return item;
    }),
  );
}

async function reloadMetricDefs() {
  metricDefs = await getAll('metricDef');
  metricDefs.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const select = byId('metric-select');
  const previous = select.value;
  select.replaceChildren(...metricDefs.map((def) => option(def.id, def.name)));
  if (metricDefs.some((def) => def.id === previous)) select.value = previous;
}

async function renderMetricLogs() {
  const date = byId('metric-date').value;
  const logs = (await getAll('metricLog')).filter((log) => log.date === date);
  const defs = new Map(metricDefs.map((def) => [def.id, def]));
  const list = byId('metric-log-list');

  if (logs.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = '記録なし';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(
    ...logs.map((log) => {
      const def = defs.get(log.metricDefId);
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = def
        ? `${def.name}: ${log.value} ${unitLabel(def.unit)}`
        : '不明な指標';
      item.append(label);
      return item;
    }),
  );
}

async function reloadAll() {
  await reloadExercises();
  await reloadMetricDefs();
  await renderSets();
  await renderMetricLogs();
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

  byId('exercise-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = byId('exercise-name').value.trim();
    const bodyPart = byId('exercise-part').value.trim();
    if (!name || !bodyPart) {
      setStatus('名前と部位を入力してください', true);
      return;
    }
    await put('exercise', { id: crypto.randomUUID(), name, bodyPart, archived: false });
    byId('exercise-name').value = '';
    byId('exercise-part').value = '';
    await reloadExercises();
    setStatus('種目を追加しました');
  });

  byId('metric-def-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = byId('metric-name').value.trim();
    const unit = byId('metric-unit').value;
    if (!name) {
      setStatus('指標名を入力してください', true);
      return;
    }
    await put('metricDef', { id: crypto.randomUUID(), name, unit });
    byId('metric-name').value = '';
    await reloadMetricDefs();
    await renderMetricLogs();
    setStatus('指標を追加しました');
  });

  byId('metric-log-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const metricDefId = byId('metric-select').value;
    const date = byId('metric-date').value;
    const value = byId('metric-value').valueAsNumber;
    if (!metricDefId || !date || !Number.isFinite(value)) {
      setStatus('指標・日付・値を入力してください', true);
      return;
    }
    await put('metricLog', { id: crypto.randomUUID(), date, metricDefId, value });
    byId('metric-value').value = '';
    await renderMetricLogs();
    setStatus('指標を記録しました');
  });

  byId('metric-date').addEventListener('change', renderMetricLogs);

  byId('export-btn').addEventListener('click', async () => {
    const data = await exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `open-workout-memo-${todayString()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('エクスポートしました');
  });

  byId('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.schemaVersion !== 1) {
        setStatus('schemaVersion が 1 ではないためインポートできません', true);
        return;
      }
      if (!window.confirm('現在のデータをすべて置き換えます。よろしいですか？')) return;
      await replaceAll(data);
      await reloadAll();
      setStatus('インポートしました');
    } catch (error) {
      setStatus(`インポートに失敗しました: ${error.message}`, true);
    } finally {
      event.target.value = '';
    }
  });
}

async function init() {
  try {
    await seedIfEmpty();
    const today = todayString();
    byId('set-date').value = today;
    byId('list-date').value = today;
    byId('metric-date').value = today;
    await reloadAll();
    wireEvents();
  } catch (error) {
    setStatus(`起動に失敗しました: ${error.message}`, true);
  }
}

init();
