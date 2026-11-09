// 計算だけのテスト。`node --test` で実行する（package.json も依存も要らない）
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bestSet,
  estimate1RM,
  formatDate,
  formatWeight,
  groupSets,
  latestBodyweight,
  loadOf,
  memoWithBodyweight,
  orderKey,
  partSummary,
  rmParts,
  rmValue,
  sortSets,
  stripBodyweightNote,
  todayString,
  unitLabel,
  volumeOf,
  weightText,
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
  assert.equal(estimate1RM(2.55, 1), 2.6); // 表示の toFixed(1) で 2.5 にならないよう丸める
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

test('bestSet は丸めた1RMで比べる', () => {
  const single = set(99.96, 1);
  const many = set(66.65, 20); // 丸め前は 99.975 で上、丸め後はどちらも 100.0
  assert.equal(bestSet([single, many]), single);
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

test('formatWeight は常に小数1桁にし、2桁目を丸める', () => {
  assert.equal(formatWeight(5), '5.0');
  assert.equal(formatWeight(62.5), '62.5');
  assert.equal(formatWeight(123), '123.0');
  assert.equal(formatWeight(2.55), '2.6');
  assert.equal(formatWeight(123.44), '123.4');
});

test('自重は loadOf が体重、無ければ 0 になる', () => {
  assert.equal(loadOf(set(100, 5)), 100);
  assert.equal(loadOf({ ...set(0, 5), bodyweight: true, bodyweightKg: 72.5 }), 72.5);
  assert.equal(loadOf({ ...set(0, 5), bodyweight: true }), 0);
});

test('weightText は自重を「自重」にする', () => {
  assert.equal(weightText(set(62.5, 5)), '62.5');
  assert.equal(weightText({ ...set(0, 5), bodyweight: true }), '自重');
});

test('自重セットの1RMは体重が分かるときだけ参考値で出す', () => {
  assert.equal(rmValue({ ...set(0, 10), bodyweight: true }), '—');
  assert.equal(rmValue({ ...set(0, 10), bodyweight: true, bodyweightKg: 70 }), '87.5 kg（参考値）');
});

test('rmParts は数値と注記を分け、常に小数1桁にする', () => {
  assert.deepEqual(rmParts(set(100, 3)), { value: '107.5', note: '' });
  assert.deepEqual(rmParts(set(5, 5)), { value: '5.6', note: '' });
  assert.deepEqual(rmParts(set(100, 10)), { value: '125.0', note: '' });
  assert.deepEqual(rmParts(set(100, 11)), { value: '127.5', note: '（参考値）' });
  assert.deepEqual(rmParts({ ...set(0, 10), bodyweight: true, bodyweightKg: 70 }), {
    value: '87.5',
    note: '（参考値）',
  });
});

test('rmParts は端数を小数1桁に丸める', () => {
  assert.deepEqual(rmParts(set(2.55, 1)), { value: '2.6', note: '' });
  assert.deepEqual(rmParts(set(123.44, 1)), { value: '123.4', note: '' });
  assert.deepEqual(rmParts(set(10.04, 10)), { value: '12.6', note: '' }); // 12.55 の丸め
});

test('rmParts は体重の分からない自重セットを「—」にする', () => {
  assert.deepEqual(rmParts({ ...set(0, 10), bodyweight: true }), { value: '—', note: '' });
  assert.equal(rmValue({ ...set(0, 10), bodyweight: true }), '—');
});

test('volumeOf は自重セットを体重×回数で数える', () => {
  assert.equal(volumeOf([{ ...set(0, 10), bodyweight: true, bodyweightKg: 72 }]), 720);
  assert.equal(volumeOf([{ ...set(0, 10), bodyweight: true }]), 0);
});

const log = (date, value, metricDefId = 'weight') => ({ id: `${metricDefId}-${date}-${value}`, date, metricDefId, value });

test('latestBodyweight は記録日以前の直近30日で一番新しい体重を返す', () => {
  const logs = [
    log('2026-09-01', 70),
    log('2026-09-30', 71.5),
    log('2026-10-10', 72.5),
    log('2026-10-30', 73),
  ];
  assert.equal(latestBodyweight(logs, ['weight'], '2026-10-30'), 73);
  // 記録日を含む30日前までは使い、31日前は使わない
  assert.equal(latestBodyweight([log('2026-09-29', 70), log('2026-09-30', 71)], ['weight'], '2026-10-30'), 71);
  assert.equal(latestBodyweight([log('2026-09-29', 70)], ['weight'], '2026-10-30'), undefined);
  assert.equal(latestBodyweight([], ['weight'], '2026-10-30'), undefined);
});

test('latestBodyweight は記録日より後の体重と、体重以外の指標を使わない', () => {
  const logs = [
    log('2026-10-31', 99),
    log('2026-10-20', 70),
    log('2026-10-25', 80, 'waist'),
  ];
  assert.equal(latestBodyweight(logs, ['weight'], '2026-10-30'), 70);
  assert.equal(latestBodyweight(logs, ['waist'], '2026-10-30'), 80);
  assert.equal(latestBodyweight(logs, ['weight', 'waist'], '2026-10-30'), 80);
});

test('latestBodyweight は days を変えると期間も変わる', () => {
  const logs = [log('2026-10-01', 68), log('2026-10-26', 71)];
  assert.equal(latestBodyweight(logs, ['weight'], '2026-10-30', 7), 71);
  assert.equal(latestBodyweight(logs, ['weight'], '2026-10-30', 3), undefined);
});

test('memoWithBodyweight は体重の注記を先頭に付け、既存の注記を重複させない', () => {
  assert.equal(memoWithBodyweight('', 72.5, 30), '体重 72.5kg');
  assert.equal(memoWithBodyweight('調子よい', 72.5, 30), '体重 72.5kg 調子よい');
  assert.equal(memoWithBodyweight('体重 70kg 調子よい', 72.5, 30), '体重 72.5kg 調子よい');
  assert.equal(memoWithBodyweight('メモ', undefined, 30), 'メモ');
});

test('memoWithBodyweight は長さで切っても体重の注記を残す', () => {
  const memo = memoWithBodyweight('あ'.repeat(30), 72.5, 30);
  assert.equal(memo, `体重 72.5kg ${'あ'.repeat(20)}`);
  assert.equal(memo.length, 30);
});

test('stripBodyweightNote は注記だけを取り除く', () => {
  assert.equal(stripBodyweightNote('体重 72.5kg 調子よい'), '調子よい');
  assert.equal(stripBodyweightNote('体重72.5kg'), '');
  assert.equal(stripBodyweightNote(''), '');
});

test('order は createdAt より優先され、無い行は createdAt で並ぶ', () => {
  const ordered = sortSets([set(60, 10, 'a', 30), { ...set(100, 5, 'a', 10), order: 0 }, set(80, 8, 'a', 20)]);
  assert.deepEqual(ordered.map((item) => item.weight), [100, 80, 60]);
  assert.equal(orderKey({ order: 0, createdAt: 99 }), 0);
});

test('groupSets は order の順でグループを作る', () => {
  const groups = groupSets(
    [{ ...set(100, 5, 'a', 1), order: 2 }, { ...set(60, 10, 'b', 2), order: 0 }, { ...set(80, 8, 'a', 3), order: 1 }],
    [{ id: 'a', name: 'ベンチプレス', bodyPart: '胸' }, { id: 'b', name: 'スクワット', bodyPart: '脚' }],
  );
  assert.deepEqual(groups.map((group) => group.name), ['スクワット', 'ベンチプレス']);
  assert.deepEqual(groups.map((group) => group.sets.length), [1, 2]);
});
