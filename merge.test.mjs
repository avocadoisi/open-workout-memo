// マージ規則のテスト。`node --test` で実行する
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alignRows,
  exerciseKey,
  mergeRows,
  metricDefKey,
  planMerge,
  remapIds,
  setKey,
} from './merge.js';

const set = (id, over = {}) => ({ id, date: '2026-08-04', exerciseId: 'ex-squat', weight: 80, reps: 5, memo: '', ...over });

// 書き込みを手元に重ねて、最終的な行を id 順で見る
function apply(localRows, write) {
  const rows = new Map(localRows.map((row) => [row.id, row]));
  for (const row of write) rows.set(row.id, row);
  return [...rows.values()];
}

test('mergeRows は同じ id の行を増やさない', () => {
  const local = [set('a'), set('b'), set('c')];
  const result = mergeRows(local, [set('a'), set('b'), set('c')], setKey);

  assert.equal(result.added, 0);
  assert.equal(result.updated, 3);
  assert.equal(result.skipped, 0);
  assert.equal(apply(local, result.write).length, 3);
});

test('mergeRows は id が違っても同じ内容の行を増やさない', () => {
  const local = [set('a'), set('b'), set('c')];
  const result = mergeRows(local, [set('x'), set('y'), set('z')], setKey);

  assert.equal(result.write.length, 0);
  assert.equal(result.skipped, 3);
  assert.equal(apply(local, result.write).length, 3);
});

test('mergeRows は件数が多い方に揃える（足りない分だけ足す）', () => {
  const local = [set('a'), set('b'), set('c')];
  const importSets = [set('x'), set('y'), set('z'), set('w')];
  const result = mergeRows(local, importSets, setKey);

  assert.equal(result.added, 1);
  assert.equal(result.skipped, 3);
  assert.equal(apply(local, result.write).length, 4);
});

test('mergeRows は手元の方が多ければ何も足さない', () => {
  const local = [set('a'), set('b'), set('c')];
  const result = mergeRows(local, [set('x'), set('y')], setKey);

  assert.equal(result.write.length, 0);
  assert.equal(apply(local, result.write).length, 3);
});

test('mergeRows は同じ id で中身が違えばインポート側で上書きする', () => {
  const local = [set('a')];
  const result = mergeRows(local, [set('a', { weight: 85 })], setKey);

  assert.equal(result.updated, 1);
  assert.deepEqual(apply(local, result.write), [set('a', { weight: 85 })]);
});

test('setKey は体重の自動注記が違っても同じセットとみなす', () => {
  const left = set('a', { memo: '体重 72.5kg 腰が軽い', bodyweight: true, weight: 0 });
  const right = set('b', { memo: '体重 70.0kg 腰が軽い', bodyweight: true, weight: 0 });

  assert.equal(setKey(left), setKey(right));
  assert.equal(mergeRows([left], [right], setKey).write.length, 0);
});

test('setKey はメモ・回数・自重かどうかが違えば別のセットとみなす', () => {
  assert.notEqual(setKey(set('a', { reps: 5 })), setKey(set('b', { reps: 6 })));
  assert.notEqual(setKey(set('a', { memo: 'きつい' })), setKey(set('b')));
  assert.notEqual(setKey(set('a', { weight: 0, bodyweight: true })), setKey(set('b', { weight: 0 })));
});

test('alignRows は名前が同じ種目の id を読み替え、新しい名前だけ足す', () => {
  const local = [{ id: 'ex-squat', name: 'スクワット' }];
  const { idMap, add } = alignRows(local, [
    { id: 'import-squat', name: ' ｽｸﾜｯﾄ ' },
    { id: 'import-bench', name: 'ベンチプレス' },
  ], exerciseKey);

  assert.deepEqual(add, [{ id: 'import-bench', name: 'ベンチプレス' }]);
  assert.equal(idMap.get('import-squat'), 'ex-squat');
  assert.equal(idMap.get('import-bench'), 'import-bench');
});

test('alignRows は指標を名前＋単位で寄せる', () => {
  const local = [{ id: 'm-weight', name: '体重', unit: 'weight' }];
  const { add, idMap } = alignRows(local, [
    { id: 'import-weight', name: '体重', unit: 'weight' },
    { id: 'import-waist', name: '体重', unit: 'length' },
  ], metricDefKey);

  assert.equal(idMap.get('import-weight'), 'm-weight');
  assert.deepEqual(add, [{ id: 'import-waist', name: '体重', unit: 'length' }]);
});

test('remapIds は知らない id をそのまま残す', () => {
  const rows = [{ id: 's1', exerciseId: 'unknown' }];
  assert.deepEqual(remapIds(rows, 'exerciseId', new Map()), rows);
});

test('planMerge は別端末のデータでも種目を分けず、同じ記録を増やさない', () => {
  const local = {
    exercises: [{ id: 'ex-squat', name: 'スクワット', bodyPart: '脚', archived: false }],
    workoutSets: [set('a1'), set('a2'), set('a3')],
    metricDefs: [{ id: 'm-weight', name: '体重', unit: 'weight' }],
    metricLogs: [{ id: 'l1', date: '2026-08-04', metricDefId: 'm-weight', value: 72.5 }],
  };
  const imported = {
    exercises: [{ id: 'ex-squat-2', name: 'スクワット', bodyPart: '脚', archived: false }],
    workoutSets: [set('b1'), set('b2'), set('b3')].map((row) => ({ ...row, exerciseId: 'ex-squat-2' })),
    metricDefs: [{ id: 'm-weight-2', name: '体重', unit: 'weight' }],
    metricLogs: [{ id: 'l2', date: '2026-08-04', metricDefId: 'm-weight-2', value: 72.5 }],
  };

  const { write, counts } = planMerge(local, imported);

  assert.deepEqual(write.exercises, []);
  assert.deepEqual(write.metricDefs, []);
  assert.equal(write.workoutSets.length, 0);
  assert.equal(write.metricLogs.length, 0);
  assert.equal(counts.workoutSets.skipped, 3);
  assert.equal(counts.metricLogs.skipped, 1);
  assert.equal(apply(local.workoutSets, write.workoutSets).length, 3);
});

test('planMerge は読み替えた種目の id で記録を足す', () => {
  const local = {
    exercises: [{ id: 'ex-squat', name: 'スクワット', bodyPart: '脚', archived: false }],
    workoutSets: [],
    metricDefs: [],
    metricLogs: [],
  };
  const imported = {
    exercises: [{ id: 'ex-squat-2', name: 'スクワット', bodyPart: '脚', archived: false }],
    workoutSets: [set('b1', { exerciseId: 'ex-squat-2' })],
    metricDefs: [],
    metricLogs: [],
  };

  const { write, counts } = planMerge(local, imported);

  assert.deepEqual(write.workoutSets, [set('b1', { exerciseId: 'ex-squat' })]);
  assert.equal(counts.workoutSets.added, 1);
  assert.equal(counts.exercises.added, 0);
});
