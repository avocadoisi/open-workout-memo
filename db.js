import { planMerge } from './merge.js';
import { parseId, randomSalt, removeRow, toDays, toRows, upsertRow } from './day.js';
import { FILE_VERSION } from './migrations.js';

const DB_NAME = 'open-workout-memo';
const DB_VERSION = 2;

// 保存は日ごとのレコード（workoutDay）。画面には従来どおり行（workoutSet）として見せる
const STORES = ['exercise', 'workoutDay', 'metricDef', 'metricLog'];
const EXPORT_KEYS = {
  exercise: 'exercises',
  workoutSet: 'workoutSets',
  metricDef: 'metricDefs',
  metricLog: 'metricLogs',
};

let dbPromise;

const result = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (event.oldVersion < 1) {
        db.createObjectStore('exercise', { keyPath: 'id' });
        db.createObjectStore('metricDef', { keyPath: 'id' });
        db.createObjectStore('metricLog', { keyPath: 'id' });
      }
      if (event.oldVersion < 2) {
        // 索引はどこからも引いていない。書き込みを重くするだけなので落とす
        if (db.objectStoreNames.contains('exercise')) {
          const store = tx.objectStore('exercise');
          if (store.indexNames.contains('archived')) store.deleteIndex('archived');
        }
        if (db.objectStoreNames.contains('metricLog')) {
          const store = tx.objectStore('metricLog');
          for (const name of ['date', 'metricDefId']) {
            if (store.indexNames.contains(name)) store.deleteIndex(name);
          }
        }
        // v1 の1行1セットを、日ごとのレコードへ畳む
        const days = db.createObjectStore('workoutDay', { keyPath: 'date' });
        if (db.objectStoreNames.contains('workoutSet')) {
          const old = tx.objectStore('workoutSet');
          const rows = [];
          old.openCursor().onsuccess = (cursorEvent) => {
            const cursor = cursorEvent.target.result;
            if (cursor) {
              rows.push(cursor.value);
              cursor.continue();
              return;
            }
            // 同じ versionchange トランザクションの中で書くので、失敗すれば v1 のまま残る
            for (const day of toDays(rows, randomSalt)) days.put(day);
            db.deleteObjectStore('workoutSet');
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('トランザクションが中断されました'));
    tx.onabort = () => reject(tx.error ?? new Error('トランザクションが中断されました'));
  });
}

async function allDays(db) {
  return result(db.transaction('workoutDay').objectStore('workoutDay').getAll());
}

// 画面からは行として読める。保存形（日ごとのツリー）は db.js の外に出さない
export async function getAll(storeName) {
  const db = await openDB();
  if (storeName === 'workoutSet') return toRows(await allDays(db));
  return result(db.transaction(storeName).objectStore(storeName).getAll());
}

// 1行を足す・置き換える。返り値は保存後の行（id と order が確定している）
export async function put(storeName, value) {
  const db = await openDB();
  if (storeName !== 'workoutSet') {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    await done(tx);
    return value;
  }
  const tx = db.transaction('workoutDay', 'readwrite');
  const store = tx.objectStore('workoutDay');
  let saved;
  const get = store.get(value.date);
  get.onsuccess = () => {
    const day = get.result ?? { date: value.date, salt: randomSalt(), blocks: [] };
    const { day: next, index } = upsertRow(day, value);
    store.put(next);
    saved = toRows([next])[index];
  };
  await done(tx);
  return saved;
}

// 複数行を1トランザクションで書く。日ごとにまとめて読み書きする
export async function putMany(storeName, values) {
  if (values.length === 0) return;
  const db = await openDB();
  if (storeName !== 'workoutSet') {
    const tx = db.transaction(storeName, 'readwrite');
    for (const value of values) tx.objectStore(storeName).put(value);
    await done(tx);
    return;
  }
  const byDate = new Map();
  for (const value of values) {
    const list = byDate.get(value.date) ?? [];
    list.push(value);
    byDate.set(value.date, list);
  }
  const tx = db.transaction('workoutDay', 'readwrite');
  const store = tx.objectStore('workoutDay');
  for (const [date, list] of byDate) {
    const get = store.get(date);
    get.onsuccess = () => {
      let day = get.result ?? { date, salt: randomSalt(), blocks: [] };
      for (const value of list) day = upsertRow(day, value).day;
      store.put(day);
    };
  }
  await done(tx);
}

// 1日ぶんのセットを、渡した順に置き換える（並べ替え・コピー）
export async function saveSetOrder(date, rows) {
  const db = await openDB();
  const tx = db.transaction('workoutDay', 'readwrite');
  const store = tx.objectStore('workoutDay');
  let saved = [];
  const get = store.get(date);
  get.onsuccess = () => {
    const salt = get.result?.salt ?? randomSalt();
    const [day] = toDays(rows.map((row, index) => ({ ...row, date, order: index })), () => salt);
    const next = day ?? { date, salt, blocks: [] };
    store.put(next);
    saved = toRows([next]);
  };
  await done(tx);
  return saved;
}

export async function remove(storeName, id) {
  const db = await openDB();
  if (storeName !== 'workoutSet') {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    await done(tx);
    return;
  }
  const date = parseId(id)?.date;
  if (!date) return;
  const tx = db.transaction('workoutDay', 'readwrite');
  const store = tx.objectStore('workoutDay');
  const get = store.get(date);
  get.onsuccess = () => {
    if (get.result) store.put(removeRow(get.result, id));
  };
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

// ファイルには行の形（schemaVersion 1）で出す。保存形を外に出さない
// ファイルは保存形（日ごとのツリー）と同じ形で出す。取り込みは古い版も受ける
export async function exportAll() {
  const db = await openDB();
  return {
    schemaVersion: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: await getAll('exercise'),
    workoutDays: await allDays(db),
    metricDefs: await getAll('metricDef'),
    metricLogs: await getAll('metricLog'),
  };
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isOptionalText = (value) => value === undefined || typeof value === 'string';

// 壊れた行を書き込むと画面が読めなくなるので、必須項目と型だけは必ず見る
const ROW_CHECKS = {
  exercise: (row) => isText(row.name) && isOptionalText(row.bodyPart) && (row.archived === undefined || typeof row.archived === 'boolean'),
  workoutSet: (row) => isText(row.date) && isText(row.exerciseId) && isNumber(row.weight) && isNumber(row.reps)
    && isOptionalText(row.memo) && (row.createdAt === undefined || isNumber(row.createdAt))
    && (row.order === undefined || isNumber(row.order))
    && (row.bodyweight === undefined || typeof row.bodyweight === 'boolean')
    && (row.bodyweightKg === undefined || isNumber(row.bodyweightKg)),
  metricDef: (row) => isText(row.name) && (row.unit === 'weight' || row.unit === 'length'),
  metricLog: (row) => isText(row.date) && isText(row.metricDefId) && isNumber(row.value),
};

// 空のトランザクションを作らないよう、検証を先に済ませる
function exportRows(data) {
  const rows = {};
  for (const storeName of ['exercise', 'workoutSet', 'metricDef', 'metricLog']) {
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
    rows[key] = list;
  }
  return rows;
}

function writeDays(tx, dayRows) {
  const store = tx.objectStore('workoutDay');
  store.clear();
  for (const day of toDays(dayRows, randomSalt)) store.put(day);
}

export async function replaceAll(data) {
  const rows = exportRows(data);

  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const storeName of ['exercise', 'metricDef', 'metricLog']) {
    tx.objectStore(storeName).clear();
    for (const row of rows[EXPORT_KEYS[storeName]]) tx.objectStore(storeName).put(row);
  }
  writeDays(tx, rows.workoutSets);
  await done(tx);
}

// 何も残さない。初期の種目と指標は次に開いたとき seedIfEmpty が入れる
export async function clearAll() {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const storeName of STORES) tx.objectStore(storeName).clear();
  await done(tx);
}

// 既存のデータは残したまま、同名の種目・指標は手元の id に寄せ、同じ内容のセットは件数の多い方に揃える
export async function mergeAll(data) {
  const rows = exportRows(data);

  const local = {
    exercises: await getAll('exercise'),
    workoutSets: await getAll('workoutSet'),
    metricDefs: await getAll('metricDef'),
    metricLogs: await getAll('metricLog'),
  };
  const { write, counts } = planMerge(local, rows);

  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const storeName of ['exercise', 'metricDef', 'metricLog']) {
    for (const row of write[EXPORT_KEYS[storeName]]) tx.objectStore(storeName).put(row);
  }
  const store = tx.objectStore('workoutDay');
  const byDate = new Map();
  for (const row of write.workoutSets) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  for (const [date, list] of byDate) {
    const get = store.get(date);
    get.onsuccess = () => {
      let day = get.result ?? { date, salt: randomSalt(), blocks: [] };
      const existing = new Set(toRows([day]).map((row) => row.id));
      // 手元に無い行は末尾へ足す（インポート側の order で真ん中に入れない）
      for (const row of list) day = upsertRow(day, existing.has(row.id) ? row : { ...row, order: undefined }).day;
      store.put(day);
    };
  }
  await done(tx);
  return counts;
}
