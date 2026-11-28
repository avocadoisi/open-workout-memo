// 保存形（v2）と、画面が使う行の変換。値を受け取って値だけを返す
//
// 保存形は1日1レコード:
//   { date, salt, blocks: [{ e: 種目id, s: [run, ...] }] }
// run は [重量, 回数]。連続する同じセットは [重量, 回数, セット数] に畳み、
// メモ・自重は末尾にオブジェクトで足す（[80, 5, 3, { m: 'メモ', b: true, k: 70 }]）。
// ブロックと run の順序が記録順なので、a, b, a は3ブロックで残る

import { orderKey } from './training.js';

export const SALT_LENGTH = 6;

export const randomSalt = () => crypto.randomUUID().replaceAll('-', '').slice(0, SALT_LENGTH);

export const formatId = (date, salt, index) => `${date}~${salt}~${index}`;

export function parseId(id) {
  if (typeof id !== 'string') return null;
  const [date, salt, index] = id.split('~');
  if (!date || !salt || !/^\d+$/.test(index)) return null;
  return { date, salt, index: Number(index) };
}

const saltOf = (row) => parseId(row.id)?.salt;

// 同じ種目・重量・回数・メモ・自重なら、同じ run に畳める
function isSameSet(a, b) {
  return a.exerciseId === b.exerciseId
    && a.weight === b.weight
    && a.reps === b.reps
    && (a.memo ?? '') === (b.memo ?? '')
    && Boolean(a.bodyweight) === Boolean(b.bodyweight)
    && a.bodyweightKg === b.bodyweightKg;
}

function extraOf(row) {
  const extra = {};
  if (row.memo) extra.m = row.memo;
  if (row.bodyweight) extra.b = true;
  if (Number.isFinite(row.bodyweightKg)) extra.k = row.bodyweightKg;
  return Object.keys(extra).length ? extra : undefined;
}

function encodeRuns(sets) {
  const runs = [];
  for (const set of sets) {
    const last = runs[runs.length - 1];
    if (last && isSameSet(last.set, set)) {
      last.count += 1;
      continue;
    }
    runs.push({ set, count: 1 });
  }
  return runs.map(({ set, count }) => {
    const extra = extraOf(set);
    if (count === 1) return extra ? [set.weight, set.reps, extra] : [set.weight, set.reps];
    return extra ? [set.weight, set.reps, count, extra] : [set.weight, set.reps, count];
  });
}

function blocksOf(rows) {
  const blocks = [];
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    if (last && last.exerciseId === row.exerciseId) {
      last.rows.push(row);
      continue;
    }
    blocks.push({ exerciseId: row.exerciseId, rows: [row] });
  }
  return blocks.map(({ exerciseId, rows }) => ({ e: exerciseId, s: encodeRuns(rows) }));
}

// 行を日ごとにまとめる。salt は id から引き継ぎ、無ければ nextSalt() で作る
export function toDays(rows, nextSalt = () => '') {
  const byDate = new Map();
  for (const row of [...rows].sort((a, b) => orderKey(a) - orderKey(b))) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  return [...byDate].map(([date, list]) => ({
    date,
    salt: list.map(saltOf).find(Boolean) ?? nextSalt(),
    blocks: blocksOf(list),
  }));
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// run は [重量, 回数] / [重量, 回数, セット数] / 末尾にメモ・自重のオブジェクト
function isRun(run) {
  if (!Array.isArray(run) || run.length < 2 || run.length > 4) return false;
  const [weight, reps, third, fourth] = run;
  if (!isNumber(weight) || !isNumber(reps)) return false;
  if (third !== undefined && !(Number.isInteger(third) && third > 0) && !isObject(third)) return false;
  if (fourth !== undefined && !isObject(fourth)) return false;
  // 3つ目がオブジェクトなら、それはメモ・自重であってセット数ではない
  return !(isObject(third) && fourth !== undefined);
}

// 保存形（workoutDay）として読めるか。範囲は見ない
export function isStoredDay(day) {
  return isObject(day)
    && typeof day.date === 'string' && day.date.trim() !== ''
    && typeof day.salt === 'string' && day.salt !== ''
    && Array.isArray(day.blocks)
    && day.blocks.every((block) => isObject(block)
      && typeof block.e === 'string' && block.e.trim() !== ''
      && Array.isArray(block.s) && block.s.length > 0
      && block.s.every(isRun));
}

function decodeRun([weight, reps, third, fourth]) {
  const extra = [third, fourth].find((value) => value && typeof value === 'object') ?? {};
  const count = typeof third === 'number' ? third : 1;
  return { weight, reps, count, extra };
}

// 日を、並び順に 0..n-1 を振った行へ開く
export function toRows(days) {
  const rows = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    let index = 0;
    for (const block of day.blocks) {
      for (const run of block.s) {
        const { weight, reps, count, extra } = decodeRun(run);
        for (let n = 0; n < count; n += 1) {
          const row = {
            id: formatId(day.date, day.salt, index),
            date: day.date,
            exerciseId: block.e,
            weight,
            reps,
            order: index,
          };
          if (extra.m) row.memo = extra.m;
          if (extra.b) row.bodyweight = true;
          if (Number.isFinite(extra.k)) row.bodyweightKg = extra.k;
          rows.push(row);
          index += 1;
        }
      }
    }
  }
  return rows;
}

const clamp = (value, max) => Math.min(Math.max(Math.trunc(value), 0), max);

// 1行を足す・置き換える。order があればその位置へ、無ければ末尾へ
// 置き換えでも order を優先するので、並べ替えはすべての行を新しい order で書けばよい
export function upsertRow(day, row) {
  const rows = toRows([day]);
  const found = rows.findIndex((item) => item.id === row.id);
  const base = found >= 0 ? rows.splice(found, 1)[0] : undefined;
  const at = Number.isFinite(row.order) ? clamp(row.order, rows.length) : rows.length;
  // order を書いておかないと、toDays の並べ替えで 0 扱いになり先頭へ寄ってしまう
  rows.splice(at, 0, base ? { ...base, ...row, order: at } : { ...row, order: at });
  const next = toDays(rows, () => day.salt)[0] ?? { date: day.date, salt: day.salt, blocks: [] };
  return { day: next, index: at };
}

export function removeRow(day, id) {
  const rows = toRows([day]).filter((row) => row.id !== id);
  return toDays(rows, () => day.salt)[0] ?? { date: day.date, salt: day.salt, blocks: [] };
}
