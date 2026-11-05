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

// 単位込みの値。表の列に並べる用（10回超は O'Conner 式の誤差が大きいので参考値と添える）
export function rmValue(set) {
  return `${estimate1RM(set.weight, set.reps).toFixed(1)} kg${set.reps > 10 ? '（参考値）' : ''}`;
}

export function rmText(set) {
  return `1RM ${rmValue(set)}`;
}

// 総ボリューム（重量 × 回数の合計）
export function volumeOf(sets) {
  return Math.round(sets.reduce((sum, set) => sum + set.weight * set.reps, 0));
}

// 部位はこの順で並べる。自由入力の部位は後ろ
const PART_ORDER = ['腕', '肩', '背中', '胸', '脚'];

// 入力した順に積み上げる。作成時刻（createdAt）の昇順で、古い行は 0 として元の配列順を安定ソートで保つ
// 同じ種目でも連続していなければ別グループにする（ベンチ→スクワット→ベンチ は3グループ）
export function groupSets(sets, exercises) {
  const found = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const ordered = [...sets].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
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
    estimate1RM(set.weight, set.reps) > estimate1RM(best.weight, best.reps) ? set : best,
  );
}
