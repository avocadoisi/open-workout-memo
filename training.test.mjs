// 計算だけのテスト。`node --test` で実行する（package.json も依存も要らない）
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bestSet,
  estimate1RM,
  formatDate,
  groupSets,
  partSummary,
  todayString,
  unitLabel,
  volumeOf,
} from './training.js';

const set = (weight, reps, exerciseId = 'a', createdAt) => ({
  id: `${exerciseId}-${weight}-${reps}-${createdAt}`,
  exerciseId,
  weight,
  reps,
  createdAt,
});

test('formatDate は曜日つきで日本語にする', () => {
  assert.equal(formatDate('2026-10-30'), '2026年10月30日(金)');
  assert.equal(formatDate('2026-01-01'), '2026年1月1日(木)');
});

test('todayString は YYYY-MM-DD', () => {
  assert.match(todayString(), /^\d{4}-\d{2}-\d{2}$/);
});

test('unitLabel は kg と cm', () => {
  assert.equal(unitLabel('weight'), 'kg');
  assert.equal(unitLabel('length'), 'cm');
});

test('estimate1RM は O\'Conner 式を小数1桁で返す', () => {
  assert.equal(estimate1RM(100, 3), 107.5); // 100*(1+3/40) = 107.5
  assert.equal(estimate1RM(110, 10), 137.5); // 110*(1+10/40) = 137.5
  assert.equal(estimate1RM(50, 8), 60); // 50*(1+8/40) = 60
  assert.equal(estimate1RM(100, 1), 100); // 1回は重量そのもの
  assert.equal(estimate1RM(90, 1), 90); // 1回は推定しない（90 を 92.3 にしない）
  assert.equal(estimate1RM(2.8, 5), 3.2); // 3.15 の丸め（0.1kg 単位でも崩れない）
  assert.equal(estimate1RM(10.04, 10), 12.6); // 12.55 の丸め（0.01kg 単位でも崩れない）
});

test('estimate1RM は同じ重量なら回数が増えるほど上がる', () => {
  const values = [1, 5, 10, 20].map((reps) => estimate1RM(100, reps));
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
});

test('volumeOf は重量×回数の合計を四捨五入する', () => {
  assert.equal(volumeOf([set(100, 5), set(50.5, 3)]), 652); // 500 + 151.5
  assert.equal(volumeOf([]), 0);
});

test('bestSet は推定1RMが一番高いセットを返す', () => {
  const light = set(80, 5);
  const heavy = set(100, 3);
  assert.equal(bestSet([light, heavy]), heavy);
});

test('groupSets は createdAt の順に並べ、セットを重量で並べ替えない', () => {
  const groups = groupSets(
    [set(100, 5, 'b', 4), set(60, 10, 'a', 3), set(60, 5, 'a', 2), set(80, 8, 'b', 1)],
    [{ id: 'a', name: 'ベンチプレス', bodyPart: '胸' }, { id: 'b', name: 'スクワット', bodyPart: '脚' }],
  );
  assert.deepEqual(groups.map((group) => group.name), ['スクワット', 'ベンチプレス', 'スクワット']);
  assert.deepEqual(groups[1].sets.map((item) => [item.weight, item.reps]), [[60, 5], [60, 10]]);
});

test('groupSets は同じ種目が再登場したら別グループにする', () => {
  const groups = groupSets(
    [set(100, 5, 'a', 1), set(60, 10, 'a', 2), set(80, 5, 'b', 3), set(70, 10, 'a', 4)],
    [{ id: 'a', name: 'ベンチプレス', bodyPart: '胸' }, { id: 'b', name: 'スクワット', bodyPart: '脚' }],
  );
  assert.deepEqual(groups.map((group) => group.name), ['ベンチプレス', 'スクワット', 'ベンチプレス']);
  assert.deepEqual(groups.map((group) => group.sets.length), [2, 1, 1]);
});

test('groupSets は createdAt の無い古い行を 0 として元の配列順のまま先頭に置く', () => {
  const [group] = groupSets(
    [set(60, 10, 'a'), set(100, 5, 'a'), set(60, 5, 'a', 10)],
    [{ id: 'a', name: 'ベンチプレス', bodyPart: '胸' }],
  );
  assert.deepEqual(group.sets.map((item) => [item.weight, item.reps]), [[60, 10], [100, 5], [60, 5]]);
});

test('groupSets は種目マスタに無い id を「不明な種目」にする', () => {
  const [group] = groupSets([set(50, 10, 'gone')], []);
  assert.equal(group.name, '不明な種目');
  assert.equal(group.bodyPart, '');
});

test('partSummary は 腕→肩→背中→胸→脚 の順になり、未知の部位は後ろ', () => {
  assert.equal(partSummary([{ bodyPart: '脚' }, { bodyPart: '腕' }, { bodyPart: 'その他' }]), '腕・脚・その他');
  assert.equal(partSummary([{ bodyPart: '' }, { bodyPart: '胸' }]), '胸');
  assert.equal(partSummary([]), '');
});
