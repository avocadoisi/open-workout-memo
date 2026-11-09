// トレーニングの計算と表示用の書式。見出しの組み立てだけ DOM を触る

import { el } from './dom.js';

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// 'YYYY-MM-DD' → 2026年10月30日(金)
export function formatDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = WEEKDAYS[(new Date(year, month - 1, day).getDay() + 6) % 7];
  return `${year}年${month}月${day}日(${weekday})`;
}

// 単位は重さ kg・長さ cm の2つだけ。保存もこの単位のまま（換算はしない）
export function unitLabel(unit) {
  return unit === 'length' ? 'cm' : 'kg';
}

// O'Conner 式（重量と回数から1RMを推定し、小数1桁に丸める）
// 1回なら挙げた重量がそのまま1RMなので推定しない（表示と同じ小数1桁には丸める）
// 入力の小数桁をそのまま整数にしてから計算する。2.55*10 が 25.4999… になるため
export function estimate1RM(weight, reps) {
  const scale = 10 ** (String(weight).split('.')[1] ?? '').length;
  if (reps === 1) return Math.round((Math.round(weight * scale) * 10) / scale) / 10;
  return Math.round((Math.round(weight * scale) * (40 + reps)) / (4 * scale)) / 10;
}

// 表示用の重量。常に小数1桁にし、整数部3桁分の幅は CSS で揃える（ゼロ埋めはしない）
export function formatWeight(value) {
  const decimals = (String(value).split('.')[1] ?? '').length;
  const scale = 10 ** decimals;
  const rounded = Math.round((Math.round(Number(value) * scale) * 10) / scale) / 10;
  return rounded.toFixed(1);
}

// 実際に挙げた負荷。自重は計測済みの体重を使い、無ければ 0（1RM・ボリュームは参考値）
export function loadOf(set) {
  if (!set.bodyweight) return set.weight;
  return Number.isFinite(set.bodyweightKg) ? set.bodyweightKg : 0;
}

// 重量の表示。自重は数値の代わりに「自重」
export function weightText(set) {
  return set.bodyweight ? '自重' : formatWeight(set.weight);
}

// 単位込みの値。表の列に並べる用（10回超・自重は O'Conner 式の誤差が大きいので参考値と添える）
// 体重が分からない自重セットは 1RM を出さない
export function rmValue(set) {
  if (set.bodyweight && !Number.isFinite(set.bodyweightKg)) return '—';
  const note = set.bodyweight || set.reps > 10 ? '（参考値）' : '';
  return `${estimate1RM(loadOf(set), set.reps).toFixed(1)} kg${note}`;
}

export function rmText(set) {
  return `1RM ${rmValue(set)}`;
}

// 総ボリューム（重量 × 回数の合計）。自重は体重が分かる場合だけ数える
export function volumeOf(sets) {
  return Math.round(sets.reduce((sum, set) => sum + loadOf(set) * set.reps, 0));
}

// 手動の並び（order）を優先し、無ければ保存時刻。古い行は 0 として元の配列順を安定ソートで保つ
export function orderKey(set) {
  return set.order ?? set.createdAt ?? 0;
}

export function sortSets(sets) {
  return [...sets].sort((a, b) => orderKey(a) - orderKey(b));
}

// 部位はこの順で並べる。自由入力の部位は後ろ
const PART_ORDER = ['腕', '肩', '背中', '胸', '脚'];

// 入力した順に積み上げる。手動の並び（order）、無ければ作成時刻（createdAt）の昇順
// 同じ種目でも連続していなければ別グループにする（ベンチ→スクワット→ベンチ は3グループ）
export function groupSets(sets, exercises) {
  const found = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const ordered = sortSets(sets);
  const groups = [];
  for (const set of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.sets[0].exerciseId === set.exerciseId) {
      last.sets.push(set);
      continue;
    }
    groups.push({
      name: found.get(set.exerciseId)?.name ?? '不明な種目',
      bodyPart: found.get(set.exerciseId)?.bodyPart ?? '',
      sets: [set],
    });
  }
  return groups;
}

// ベストかどうかは言葉ではなく強調（strong）で示す
export function groupTitle(group) {
  const part = group.bodyPart ? `（${group.bodyPart}）` : '';
  return [
    el('span', { text: `${group.name}${part} ` }),
    el('strong', { text: rmText(bestSet(group.sets)) }),
    el('span', { text: `・ボリューム ${volumeOf(group.sets)} kg` }),
  ];
}

export function partSummary(groups) {
  const parts = [...new Set(groups.map((group) => group.bodyPart).filter(Boolean))];
  return parts
    .sort((a, b) => (PART_ORDER.indexOf(a) + 1 || 99) - (PART_ORDER.indexOf(b) + 1 || 99))
    .join('・');
}

export function bestSet(sets) {
  return sets.reduce((best, set) =>
    estimate1RM(loadOf(set), set.reps) > estimate1RM(loadOf(best), best.reps) ? set : best,
  );
}
