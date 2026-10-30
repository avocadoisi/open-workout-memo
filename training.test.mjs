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

const set = (weight, reps, exerciseId = 'a') => ({ id: `${exerciseId}-${weight}-${reps}`, exerciseId, weight, reps });

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

test('estimate1RM は Brzycki 式を小数1桁で返す', () => {
  assert.equal(estimate1RM(100, 5), 85.7); // 100*36/42 = 85.71
  assert.equal(estimate1RM(60, 10), 46.0); // 60*36/47 = 45.96
  assert.equal(estimate1RM(100, 1), 94.7); // 100*36/38 = 94.74
});

test('estimate1RM は回数が増えるほど下がる', () => {
  const values = [1, 5, 10, 20].map((reps) => estimate1RM(100, reps));
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
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

test('groupSets は種目名でまとめ、セットを重量→回数で並べる', () => {
  const groups = groupSets(
    [set(100, 5, 'b'), set(60, 10, 'a'), set(60, 5, 'a'), set(100, 3, 'b')],
    [{ id: 'a', name: 'ベンチプレス', bodyPart: '胸' }, { id: 'b', name: 'スクワット', bodyPart: '脚' }],
  );
  assert.deepEqual(groups.map((group) => group.name), ['スクワット', 'ベンチプレス']);
  assert.deepEqual(groups[0].sets.map((item) => [item.weight, item.reps]), [[100, 3], [100, 5]]);
  assert.deepEqual(groups[1].sets.map((item) => [item.weight, item.reps]), [[60, 5], [60, 10]]);
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
