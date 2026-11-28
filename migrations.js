// データファイル（エクスポート / インポートの JSON）の版と、版を上げる連鎖。
// 値を受け取って値だけを返す（保存は db.js が行う）

import { isStoredDay, randomSalt, toDays } from './day.js';

// 書き出すファイルの版。DB の版（DB_VERSION）とは独立に上げる
export const FILE_VERSION = 2;

// 前の版のデータを次の版へ上げる手順。版を足すときは、配列の末尾に1つ足すだけでよい
export const migrations = [
  {
    to: 2,
    // v1 は1行1セット。v2 は1日1レコードに畳み、同じセットの連続を run にまとめる
    run: (data, nextSalt) => ({
      schemaVersion: 2,
      exercises: data.exercises,
      workoutDays: toDays(data.workoutSets, nextSalt),
      metricDefs: data.metricDefs,
      metricLogs: data.metricLogs,
    }),
  },
];

// どの版のファイルでも、最新の形にしてから返す。古い版は上の連鎖で上げる
export function migrateFile(data, { nextSalt = randomSalt } = {}) {
  const from = data?.schemaVersion;
  if (!Number.isInteger(from) || from < 1) throw new Error('schemaVersion がありません');
  if (from > FILE_VERSION) throw new Error(`schemaVersion ${from} のファイルはこの版では読めません`);

  // 上げる前の形が壊れていると連鎖の途中で変なエラーになるので、版ごとに入口で見る
  PRE_CHECKS[from]?.(data);

  let file = data;
  for (const step of migrations) {
    if (step.to > from && step.to <= FILE_VERSION) file = step.run(file, nextSalt);
  }
  checkFile(file);
  return file;
}

const PRE_CHECKS = {
  1: (data) => {
    for (const key of ['exercises', 'workoutSets', 'metricDefs', 'metricLogs']) {
      if (!Array.isArray(data[key])) throw new Error(`${key} が配列ではありません`);
    }
  },
};

// 壊れたファイルを取り込むと画面が読めなくなるので、配列と日の中身は必ず見る
function checkFile(file) {
  for (const key of ['exercises', 'workoutDays', 'metricDefs', 'metricLogs']) {
    if (!Array.isArray(file[key])) throw new Error(`${key} が配列ではありません`);
  }
  file.workoutDays.forEach((day, index) => {
    if (!isStoredDay(day)) throw new Error(`workoutDays[${index}] の内容が正しくありません`);
  });
}
