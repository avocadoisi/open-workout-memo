// 並び替えの操作だけのテスト。`node --test` で実行する（package.json も依存も要らない）
import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenGroups, moveItem, orderForSave } from './views/order.js';

const ids = (list) => list.map((item) => item.id);

test('moveItem は隣と入れ替える', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(moveItem(list, 1, -1), true);
  assert.deepEqual(ids(list), ['b', 'a', 'c']);
  assert.equal(moveItem(list, 2, -1), true);
  assert.deepEqual(ids(list), ['b', 'c', 'a']);
});

test('moveItem は端なら false を返し、並びを変えない', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.equal(moveItem(list, 0, -1), false);
  assert.equal(moveItem(list, 1, 1), false);
  assert.deepEqual(ids(list), ['a', 'b']);
});

test('flattenGroups はグループを表示順の1本のセット列にする', () => {
  const groups = [{ sets: [{ id: 'a' }, { id: 'b' }] }, { sets: [{ id: 'c' }] }];
  assert.deepEqual(ids(flattenGroups(groups)), ['a', 'b', 'c']);
});

test('orderForSave は古い順の画面なら表示順のまま保存する', () => {
  const groups = [{ sets: [{ id: 'a' }, { id: 'b' }] }, { sets: [{ id: 'c' }] }];
  assert.deepEqual(ids(orderForSave(groups, false)), ['a', 'b', 'c']);
});

test('orderForSave は新しい順の画面ならグループとセットを反転して保存する', () => {
  const groups = [{ sets: [{ id: 'c' }] }, { sets: [{ id: 'b' }, { id: 'a' }] }];
  assert.deepEqual(ids(orderForSave(groups, true)), ['a', 'b', 'c']);
});
