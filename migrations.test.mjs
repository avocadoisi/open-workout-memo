// データファイルの連鎖マイグレーションのテスト。`node --test` で実行する
import assert from 'node:assert/strict';
import test from 'node:test';
import { FILE_VERSION, migrateFile, migrations } from './migrations.js';
import { parseImport } from './merge.js';

const set = (index, exerciseId, weight, reps, over = {}) => ({
  id: `2026-08-04~abc123~${index}`,
  date: '2026-08-04',
  exerciseId,
  weight,
  reps,
  order: index,
  ...over,
});

const v1 = (workoutSets) => ({
  schemaVersion: 1,
  exportedAt: '2026-08-04T00:00:00.000Z',
  exercises: [],
  workoutSets,
  metricDefs: [],
  metricLogs: [],
});

test('v1 の行は日ごとに畳まれ、連続する同じセットは run にまとまる', () => {
  const file = migrateFile(v1([set(0, 'a', 80, 5), set(1, 'a', 80, 5), set(2, 'b', 100, 3)]));

  assert.equal(file.schemaVersion, FILE_VERSION);
  assert.equal(file.workoutSets, undefined);
  assert.deepEqual(file.workoutDays, [
    { date: '2026-08-04', salt: 'abc123', blocks: [{ e: 'a', s: [[80, 5, 2]] }, { e: 'b', s: [[100, 3]] }] },
  ]);
});

test('migrateFile は a, b, a を3ブロックのまま残す', () => {
  const file = migrateFile(v1([set(0, 'a', 80, 5), set(1, 'b', 100, 3), set(2, 'a', 85, 2)]));

  assert.deepEqual(file.workoutDays[0].blocks.map((block) => block.e), ['a', 'b', 'a']);
});

test('id が無い行にも日ごとの salt が付き、id があれば引き継ぐ', () => {
  const external = migrateFile(v1([
    { date: '2026-08-04', exerciseId: 'bench', weight: 80, reps: 5 },
    { date: '2026-08-05', exerciseId: 'bench', weight: 80, reps: 5 },
  ]));
  const salt = external.workoutDays[0].salt;
  assert.equal(salt.length, 6);
  assert.equal(external.workoutDays[1].salt.length, 6);

  const backup = migrateFile(v1([set(0, 'a', 80, 5)]));
  assert.equal(backup.workoutDays[0].salt, 'abc123');
});

test('v2 のファイルはそのまま通る', () => {
  const data = {
    schemaVersion: 2,
    exportedAt: '2026-08-04T00:00:00.000Z',
    exercises: [],
    workoutDays: [{ date: '2026-08-04', salt: 'abc123', blocks: [{ e: 'a', s: [[80, 5], [80, 5, 2, { m: 'きつい' }]] }] }],
    metricDefs: [],
    metricLogs: [],
  };
  assert.deepEqual(migrateFile(data), data);
});

test('migrateFile は未来の版・版の無いファイル・壊れた日を拒否する', () => {
  assert.throws(() => migrateFile({ schemaVersion: FILE_VERSION + 1 }), /この版では読めません/);
  assert.throws(() => migrateFile({ exercises: [] }), /schemaVersion がありません/);
  assert.throws(
    () => migrateFile({ schemaVersion: 2, exercises: [], workoutDays: [{ date: '2026-08-04', blocks: [] }], metricDefs: [], metricLogs: [] }),
    /workoutDays\[0\] の内容が正しくありません/,
  );
  assert.throws(
    () => migrateFile({ schemaVersion: 2, exercises: [], workoutDays: [{ date: '2026-08-04', salt: 'x', blocks: [{ e: 'a', s: [[80]] }] }], metricDefs: [], metricLogs: [] }),
    /workoutDays\[0\] の内容が正しくありません/,
  );
});

test('migrations は版の順に並び、取りこぼしが無い', () => {
  assert.deepEqual(migrations.map((step) => step.to), [2]);
  assert.equal(migrations[migrations.length - 1].to, FILE_VERSION);
});

test('parseImport は v2 のファイルを開いて行に戻す', () => {
  const text = JSON.stringify({
    schemaVersion: 2,
    exercises: [],
    workoutDays: [{ date: '2026-08-04', salt: 'abc123', blocks: [{ e: 'a', s: [[80, 5, 2], [85, 2]] }] }],
    metricDefs: [],
    metricLogs: [],
  });
  const { workoutSets } = parseImport(text);

  assert.deepEqual(workoutSets.map((row) => [row.id, row.exerciseId, row.weight, row.reps, row.order]), [
    ['2026-08-04~abc123~0', 'a', 80, 5, 0],
    ['2026-08-04~abc123~1', 'a', 80, 5, 1],
    ['2026-08-04~abc123~2', 'a', 85, 2, 2],
  ]);
});
