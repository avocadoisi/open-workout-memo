import { put } from '../db.js';

// 表示順に並べたセットへ order を 0..n-1 で振り直す。値が変わった行だけ保存する
export async function persistSetOrder(sets) {
  for (let index = 0; index < sets.length; index += 1) {
    const set = sets[index];
    if (set.order === index) continue;
    const next = { ...set, order: index };
    await put('workoutSet', next);
    set.order = index;
  }
}

// グループを表示順に並べた1本のセット列にする
export function flattenGroups(groups) {
  return groups.flatMap((group) => group.sets);
}

// 配列内で隣と入れ替える。端なら false
export function moveItem(list, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return false;
  const [item] = list.splice(index, 1);
  list.splice(to, 0, item);
  return true;
}
