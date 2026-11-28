import test from 'node:test';
import assert from 'node:assert/strict';
import { formatId, parseId, toDays, toRows, upsertRow, removeRow } from './day.js';

const salt = () => 's1';
const row = (over) => ({ id: formatId('2026-11-28', 's1', 0), date: '2026-11-28', exerciseId: 'a', weight: 80, reps: 5, ...over });

test('id は日付・salt・連番に分かれる', () => {
  assert.deepEqual(parseId(formatId('2026-11-28', 'ab12cd', 7)), { date: '2026-11-28', salt: 'ab12cd', index: 7 });
  assert.equal(parseId('not-an-id'), null);
  assert.equal(parseId(undefined), null);
});

test('行 → 日 → 行 で内容が変わらない', () => {
  const rows = [
    row({ id: undefined, order: 0 }),
    row({ id: undefined, order: 1, weight: 90, memo: 'きつい' }),
    row({ id: undefined, order: 2, exerciseId: 'b', bodyweight: true, bodyweightKg: 70 }),
  ];
  const back = toRows(toDays(rows, salt));
  assert.deepEqual(back.map(({ id, ...rest }) => rest), [
    { date: '2026-11-28', exerciseId: 'a', weight: 80, reps: 5, order: 0 },
    { date: '2026-11-28', exerciseId: 'a', weight: 90, reps: 5, memo: 'きつい', order: 1 },
    { date: '2026-11-28', exerciseId: 'b', weight: 80, reps: 5, bodyweight: true, bodyweightKg: 70, order: 2 },
  ]);
});

test('a, b, a はブロックを分けて順序を保つ', () => {
  const days = toDays([
    row({ exerciseId: 'a', order: 0 }),
    row({ exerciseId: 'b', order: 1 }),
    row({ exerciseId: 'a', order: 2 }),
  ], salt);
  assert.deepEqual(days[0].blocks.map((block) => block.e), ['a', 'b', 'a']);
  assert.deepEqual(toRows(days).map((set) => set.exerciseId), ['a', 'b', 'a']);
});

test('連続する同じセットは1つの run に畳み、メモが違えば分ける', () => {
  const days = toDays([
    row({ order: 0 }),
    row({ order: 1 }),
    row({ order: 2 }),
    row({ order: 3, weight: 85, reps: 3 }),
    row({ order: 4, weight: 80, reps: 5, memo: 'きつい' }),
  ], salt);
  assert.deepEqual(days[0].blocks[0].s, [[80, 5, 3], [85, 3], [80, 5, { m: 'きつい' }]]);
});

test('order の位置へ差し込み、同じ id はその位置で置き換える', () => {
  const day = toDays([row({ order: 0, id: undefined }), row({ order: 1, id: undefined, weight: 90 })], salt)[0];
  const inserted = upsertRow(day, row({ id: 'new', order: 1, weight: 85 }));
  assert.deepEqual(toRows([inserted.day]).map((set) => set.weight), [80, 85, 90]);
  const replaced = upsertRow(inserted.day, { ...toRows([inserted.day])[1], reps: 4 });
  assert.deepEqual(toRows([replaced.day]).map((set) => [set.weight, set.reps]), [[80, 5], [85, 4], [90, 5]]);
});

test('order が無い行は末尾へ足す', () => {
  const day = toDays([row({ order: 0, id: undefined })], salt)[0];
  const { day: next } = upsertRow(day, row({ id: 'new', weight: 100 }));
  assert.deepEqual(toRows([next]).map((set) => set.weight), [80, 100]);
});

test('末尾に足した行は前のブロックを割らず、a, b, a は3ブロックで残る', () => {
  const base = [row({ exerciseId: 'a', order: 0, id: undefined }), row({ exerciseId: 'b', order: 1, id: undefined })];
  const day = toDays(base, salt)[0];
  const { day: next } = upsertRow(day, row({ id: 'new', exerciseId: 'a', order: undefined, weight: 90 }));
  assert.deepEqual(next.blocks.map((block) => block.e), ['a', 'b', 'a']);
  assert.deepEqual(toRows([next]).map((set) => [set.exerciseId, set.weight]), [['a', 80], ['b', 80], ['a', 90]]);
});

test('id を指定して1行だけ消す', () => {
  const day = toDays([row({ order: 0, id: undefined }), row({ order: 1, id: undefined, weight: 90 })], salt)[0];
  const id = toRows([day])[1].id;
  assert.deepEqual(toRows([removeRow(day, id)]).map((set) => set.weight), [80]);
});
