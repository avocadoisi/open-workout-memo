import { saveSetOrder } from '../db.js';

// 表示順に並べたセットを、その順で保存する。順が変わったときだけ、日ごとに1回書く
export async function persistSetOrder(sets) {
  if (sets.length === 0) return sets;
  if (sets.every((set, index) => set.order === index)) return sets;
  const rows = [...sets];
  const byDate = new Map();
  sets.forEach((set, index) => {
    const list = byDate.get(set.date) ?? [];
    list.push(index);
    byDate.set(set.date, list);
  });
  for (const [date, indexes] of byDate) {
    const saved = await saveSetOrder(date, indexes.map((index) => sets[index]));
    indexes.forEach((index, position) => {
      rows[index] = saved[position] ?? sets[index];
      sets[index].order = position;
    });
  }
  return rows;
}

// コピーした行をコピー元の直後に差し込む。sets は古い順に並んでいる前提
// コピー元が無ければ末尾。item が sets に含まれていても、戻り値では1行だけになる
export function insertAfter(sets, sourceId, item) {
  const rest = sets.filter((set) => set.id !== item.id);
  const index = rest.findIndex((set) => set.id === sourceId);
  if (index === -1) return [...rest, item];
  rest.splice(index + 1, 0, item);
  return rest;
}

// グループを表示順に並べた1本のセット列にする
export function flattenGroups(groups) {
  return groups.flatMap((group) => group.sets);
}

// 画面の表示順のグループを、保存する order（古い順）の1本のセット列に直す
// 新しい順の画面では、グループとセットの両方を反転して元の向きに戻す
export function orderForSave(groups, newestFirst) {
  if (!newestFirst) return flattenGroups(groups);
  return [...groups].reverse().flatMap((group) => [...group.sets].reverse());
}

// 配列内で隣と入れ替える。端なら false
export function moveItem(list, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return false;
  const [item] = list.splice(index, 1);
  list.splice(to, 0, item);
  return true;
}
