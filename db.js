const DB_NAME = 'open-workout-memo';
const DB_VERSION = 1;

const STORES = ['exercise', 'workoutSet', 'metricDef', 'metricLog'];
const EXPORT_KEYS = {
  exercise: 'exercises',
  workoutSet: 'workoutSets',
  metricDef: 'metricDefs',
  metricLog: 'metricLogs',
};

let dbPromise;

export function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const exercise = db.createObjectStore('exercise', { keyPath: 'id' });
      exercise.createIndex('archived', 'archived');

      const workoutSet = db.createObjectStore('workoutSet', { keyPath: 'id' });
      workoutSet.createIndex('date', 'date');
      workoutSet.createIndex('exerciseId', 'exerciseId');

      db.createObjectStore('metricDef', { keyPath: 'id' });

      const metricLog = db.createObjectStore('metricLog', { keyPath: 'id' });
      metricLog.createIndex('date', 'date');
      metricLog.createIndex('metricDefId', 'metricDefId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  const request = db.transaction(storeName).objectStore(storeName).getAll();
  await done(request.transaction);
  return request.result;
}

export async function put(storeName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await done(tx);
}

export async function remove(storeName, id) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id);
  await done(tx);
}

const BIG3 = [
  { name: 'スクワット', bodyPart: '脚' },
  { name: 'ベンチプレス', bodyPart: '胸' },
  { name: 'デッドリフト', bodyPart: '背中' },
];

export async function seedIfEmpty() {
  const db = await openDB();
  const check = db.transaction(['exercise', 'metricDef']);
  const exerciseCount = check.objectStore('exercise').count();
  const metricDefCount = check.objectStore('metricDef').count();
  await done(check);
  if (exerciseCount.result > 0 || metricDefCount.result > 0) return; // 空のときだけ初期データを入れる

  const tx = db.transaction(['exercise', 'metricDef'], 'readwrite');
  for (const item of BIG3) {
    tx.objectStore('exercise').put({ id: crypto.randomUUID(), ...item, archived: false });
  }
  tx.objectStore('metricDef').put({ id: crypto.randomUUID(), name: '体重', unit: 'weight' });
  await done(tx);
}

export async function exportAll() {
  const data = { schemaVersion: 1, exportedAt: new Date().toISOString() };
  for (const storeName of STORES) {
    data[EXPORT_KEYS[storeName]] = await getAll(storeName);
  }
  return data;
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isOptionalText = (value) => value === undefined || typeof value === 'string';

// 壊れた行を書き込むと画面が読めなくなるので、必須項目と型だけは必ず見る
const ROW_CHECKS = {
  exercise: (row) => isText(row.name) && isOptionalText(row.bodyPart) && (row.archived === undefined || typeof row.archived === 'boolean'),
  workoutSet: (row) => isText(row.date) && isText(row.exerciseId) && isNumber(row.weight) && isNumber(row.reps) && isOptionalText(row.memo),
  metricDef: (row) => isText(row.name) && (row.unit === 'weight' || row.unit === 'length'),
  metricLog: (row) => isText(row.date) && isText(row.metricDefId) && isNumber(row.value),
};

// 空のトランザクションを作らないよう、検証を先に済ませる
function exportRows(data) {
  const rows = {};
  for (const storeName of STORES) {
    const key = EXPORT_KEYS[storeName];
    const list = data[key];
    if (!Array.isArray(list)) throw new Error(`${key} が配列ではありません`);
    list.forEach((row, index) => {
      if (!row || typeof row !== 'object' || !isText(row.id)) {
        throw new Error(`${key}[${index}] に id がありません`);
      }
      if (!ROW_CHECKS[storeName](row)) {
        throw new Error(`${key}[${index}] の内容が正しくありません`);
      }
    });
    rows[storeName] = list;
  }
  return rows;
}

export async function replaceAll(data) {
  const rows = exportRows(data);

  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const storeName of STORES) {
    tx.objectStore(storeName).clear();
    for (const row of rows[storeName]) tx.objectStore(storeName).put(row);
  }
  await done(tx);
}

// 既存のデータは残したまま、同じ id のものだけ上書きする
export async function mergeAll(data) {
  const rows = exportRows(data);

  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const storeName of STORES) {
    for (const row of rows[storeName]) tx.objectStore(storeName).put(row);
  }
  await done(tx);
}
