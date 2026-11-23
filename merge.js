// インポートのマージ規則。値を受け取って値だけを返す（保存は db.js が行う）

import { stripBodyweightNote } from './training.js';

// 表記ゆれ（前後の空白・全角半角・大文字小文字）を同じ名前として扱う
export const normalizeName = (name) => name.normalize('NFKC').trim().toLowerCase();

// ファイルやクリップボードの JSON をインポート用の形にする。形が違えば理由を投げる
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON として読めません');
  }
  if (data?.schemaVersion !== 1) throw new Error('schemaVersion が 1 ではありません');
  for (const key of ['exercises', 'workoutSets', 'metricDefs', 'metricLogs']) {
    if (!Array.isArray(data[key])) throw new Error(`${key} が配列ではありません`);
  }
  return data;
}

export const exerciseKey = (row) => normalizeName(row.name);
export const metricDefKey = (row) => [normalizeName(row.name), row.unit].join('\u0000');
export const metricLogKey = (row) => [row.date, row.metricDefId].join('\u0000');

// セットの同一性。メモは体重の自動注記を外してから比べる（端末ごとに体重が違っても同じセット）
export function setKey(row) {
  return [
    row.date,
    row.exerciseId,
    row.weight,
    row.reps,
    row.bodyweight ? 'bodyweight' : '',
    stripBodyweightNote(row.memo),
  ].join('\u0000');
}

function countBy(rows, keyOf) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// 同じ id は後の行で上書きし、id が違っても同じ内容の行は件数の多い方に揃える
// 同日 80kg×5 の3セットは3セットのまま、インポートが4セットなら1セットだけ足す
export function mergeRows(localRows, importRows, keyOf) {
  // id が同じ行はこの時点でインポート側に置き換える（増えない）
  const merged = new Map(localRows.map((row) => [row.id, row]));
  for (const row of importRows) if (merged.has(row.id)) merged.set(row.id, row);

  const lacking = countBy(importRows, keyOf);
  const kept = countBy(merged.values(), keyOf);
  for (const [key, count] of lacking) lacking.set(key, count - (kept.get(key) ?? 0));

  const localIds = new Set(localRows.map((row) => row.id));
  const picked = new Set(importRows.filter((row) => localIds.has(row.id)).map((row) => row.id));
  for (const row of importRows) {
    if (picked.has(row.id)) continue;
    const left = lacking.get(keyOf(row)) ?? 0;
    if (left <= 0) continue;
    lacking.set(keyOf(row), left - 1);
    picked.add(row.id);
  }

  const write = importRows.filter((row) => picked.has(row.id));
  const updated = write.filter((row) => localIds.has(row.id)).length;
  return { write, added: write.length - updated, updated, skipped: importRows.length - write.length };
}

// 名前（指標は名前＋単位）が同じなら同じものとみなし、インポート側の id を手元の id に読み替える
export function alignRows(localRows, importRows, keyOf) {
  const byKey = new Map(localRows.map((row) => [keyOf(row), row]));
  const idMap = new Map();
  const add = [];
  for (const row of importRows) {
    const same = byKey.get(keyOf(row));
    if (same) {
      idMap.set(row.id, same.id);
      continue;
    }
    byKey.set(keyOf(row), row);
    idMap.set(row.id, row.id);
    add.push(row);
  }
  return { idMap, add };
}

// 参照側の id を読み替える。手元にもインポートにも無い id はそのまま残す
export function remapIds(rows, field, idMap) {
  return rows.map((row) => {
    const id = idMap.get(row[field]);
    return id === undefined || id === row[field] ? row : { ...row, [field]: id };
  });
}

// 手元のデータにインポートを重ねる。書き込む行と、書き込みの内訳を返す
export function planMerge(local, imported) {
  const exercises = alignRows(local.exercises, imported.exercises, exerciseKey);
  const metricDefs = alignRows(local.metricDefs, imported.metricDefs, metricDefKey);
  const workoutSets = mergeRows(
    local.workoutSets,
    remapIds(imported.workoutSets, 'exerciseId', exercises.idMap),
    setKey,
  );
  const metricLogs = mergeRows(
    local.metricLogs,
    remapIds(imported.metricLogs, 'metricDefId', metricDefs.idMap),
    metricLogKey,
  );
  return {
    write: {
      exercises: exercises.add,
      metricDefs: metricDefs.add,
      workoutSets: workoutSets.write,
      metricLogs: metricLogs.write,
    },
    counts: {
      exercises: { added: exercises.add.length },
      metricDefs: { added: metricDefs.add.length },
      workoutSets: { added: workoutSets.added, updated: workoutSets.updated, skipped: workoutSets.skipped },
      metricLogs: { added: metricLogs.added, updated: metricLogs.updated, skipped: metricLogs.skipped },
    },
  };
}
