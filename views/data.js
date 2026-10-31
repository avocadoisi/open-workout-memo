import { getAll, put, exportAll, mergeAll, replaceAll } from '../db.js';
import { byId, el, iconButton, option, setStatus } from '../dom.js';
import { todayString, unitLabel } from '../training.js';
import { icon } from '../icons.js';

export const view = { id: 'data', label: 'データ', mount };

let exercises = [];
let metricDefs = [];
// 読み込み待ちのインポート内容
let pending = null;

function finishImport() {
  pending = null;
  byId('import-actions').hidden = true;
  byId('import-summary').textContent = '';
  reloadAll();
}

function buildExerciseSection() {
  return el('section', {},
    el('h2', { text: '種目' }),
    el('form', { id: 'exercise-form' },
      el('label', {}, '名前', el('input', { type: 'text', id: 'exercise-name', maxlength: '50', required: '' })),
      el('label', {}, '部位', el('input', { type: 'text', id: 'exercise-part', maxlength: '50', required: '' })),
      el('button', { type: 'submit', text: '追加' }),
    ),
    el('ul', { id: 'exercise-list' }),
  );
}

function buildMetricSection() {
  return el('section', {},
    el('h2', { text: '指標' }),
    el('form', { id: 'metric-def-form' },
      el('label', {}, '指標名', el('input', { type: 'text', id: 'metric-name', maxlength: '50', required: '' })),
      el('label', {}, '単位', el('select', { id: 'metric-unit' },
        el('option', { value: 'weight', text: '重さ (kg)' }),
        el('option', { value: 'length', text: '長さ (cm)' }),
      )),
      el('button', { type: 'submit', text: '指標を追加' }),
    ),
    el('form', { id: 'metric-log-form' },
      el('label', {}, '指標', el('select', { id: 'metric-select' })),
      el('label', {}, '日付', el('input', { type: 'date', id: 'metric-date' })),
      el('label', {}, '値', el('input', { type: 'number', id: 'metric-value', step: '0.1', inputmode: 'decimal' })),
      el('button', { type: 'submit', text: '記録' }),
    ),
    el('ul', { id: 'metric-log-list' }),
  );
}

function buildDataSection() {
  return el('section', {},
    el('h2', { text: 'データ' }),
    el('button', {
      type: 'button',
      id: 'export-btn',
      class: 'icon-btn',
      'aria-label': 'エクスポート',
      title: 'エクスポート',
    }, icon('download')),
    el('label', {}, 'インポート',
      el('input', { type: 'file', id: 'import-file', accept: 'application/json,.json' })),
    el('div', { id: 'import-actions', hidden: '' },
      el('p', { id: 'import-summary' }),
      el('div', { class: 'form-actions' },
        el('button', { type: 'button', id: 'import-merge', text: 'マージ' }),
        el('button', { type: 'button', id: 'import-replace', class: 'danger', text: '全置換' }),
        el('button', { type: 'button', id: 'import-cancel', class: 'plain', text: 'やめる' }),
      ),
    ),
  );
}

// 表記ゆれ（前後の空白・全角半角・大文字小文字）を同じ名前として扱う
const normalizeName = (name) => name.normalize('NFKC').trim().toLowerCase();

function hasSameName(list, name) {
  const target = normalizeName(name);
  return list.some((item) => normalizeName(item.name) === target);
}

async function reloadExercises() {
  exercises = await getAll('exercise');
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  // 種目は消さずアーカイブする（過去の記録はそのまま残す）
  byId('exercise-list').replaceChildren(...exercises.map((exercise) => {
    const label = el('span', { text: `${exercise.name}（${exercise.bodyPart}）` });
    const item = el('li', {}, label);
    if (exercise.archived) {
      item.classList.add('archived');
      label.textContent += ' アーカイブ済み';
      item.append(iconButton('restore', '復活', async () => {
        await put('exercise', { ...exercise, archived: false });
        await reloadExercises();
        setStatus('種目を復活しました');
      }));
      return item;
    }

    item.append(iconButton('archive', 'アーカイブ', async () => {
      await put('exercise', { ...exercise, archived: true });
      await reloadExercises();
      setStatus('種目をアーカイブしました');
    }));
    return item;
  }));
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
    list.replaceChildren(el('li', { text: '記録なし' }));
    return;
  }

  list.replaceChildren(...logs.map((log) => {
    const def = defs.get(log.metricDefId);
    return el('li', {
      text: def ? `${def.name}: ${log.value} ${unitLabel(def.unit)}` : '不明な指標',
    });
  }));
}

async function reloadAll() {
  await reloadExercises();
  await reloadMetricDefs();
  await renderMetricLogs();
}

function wireEvents() {
  byId('exercise-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = byId('exercise-name').value.trim();
    const bodyPart = byId('exercise-part').value.trim();
    if (!name || !bodyPart) {
      setStatus('名前と部位を入力してください', true);
      return;
    }
    if (hasSameName(exercises, name)) {
      setStatus(`「${name}」はもう登録されています`, true);
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
    if (hasSameName(metricDefs, name)) {
      setStatus(`「${name}」はもう登録されています`, true);
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
    if (value <= 0) {
      setStatus('0 より大きい値を入力してください', true);
      return;
    }
    // 同じ日の同じ指標は二重に作らず上書きする
    const sameDay = (await getAll('metricLog')).find((log) => log.date === date && log.metricDefId === metricDefId);
    await put('metricLog', { id: sameDay?.id ?? crypto.randomUUID(), date, metricDefId, value });
    byId('metric-value').value = '';
    await renderMetricLogs();
    setStatus(sameDay ? '同じ日の記録を上書きしました' : '指標を記録しました');
  });

  byId('metric-date').addEventListener('change', renderMetricLogs);

  byId('export-btn').addEventListener('click', async () => {
    const data = await exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = el('a', { href: url, download: `open-workout-memo-${todayString()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('エクスポートしました');
  });

  byId('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = ''; // 同じファイルを選び直せるようにする
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      if (data?.schemaVersion !== 1) {
        setStatus('schemaVersion が 1 ではないためインポートできません', true);
        return;
      }
      pending = data;
      byId('import-summary').textContent = `${file.name}: 種目 ${data.exercises.length}・セット ${data.workoutSets.length}・指標 ${data.metricDefs.length}・記録 ${data.metricLogs.length}`;
      byId('import-actions').hidden = false;
      setStatus('マージか全置換かを選んでください');
    } catch (error) {
      setStatus(`インポートに失敗しました: ${error.message}`, true);
    }
  });

  byId('import-merge').addEventListener('click', async () => {
    if (!pending) return;
    try {
      await mergeAll(pending);
    } catch (error) {
      setStatus(`インポートに失敗しました: ${error.message}`, true);
      return;
    }
    finishImport();
    setStatus('マージしました');
  });

  byId('import-replace').addEventListener('click', async () => {
    if (!pending) return;
    if (!window.confirm(`いまのデータをすべて消して、${pending.workoutSets.length} セットで置き換えます。元に戻せません。よろしいですか？`)) return;
    try {
      await replaceAll(pending);
    } catch (error) {
      setStatus(`インポートに失敗しました: ${error.message}`, true);
      return;
    }
    finishImport();
    setStatus('全置換しました');
  });

  byId('import-cancel').addEventListener('click', () => {
    finishImport();
    setStatus('インポートをやめました');
  });
}

async function mount(container) {
  container.append(buildExerciseSection(), buildMetricSection(), buildDataSection());
  byId('metric-date').value = todayString();
  await reloadAll();
  wireEvents();
}
