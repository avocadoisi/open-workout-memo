// トレーニングの計算と表示用の書式。DOM には触らない

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

export function unitLabel(unit) {
  return unit === 'length' ? 'cm' : 'kg';
}

// Brzycki 式
export function estimate1RM(weight, reps) {
  return Math.round(((weight * 36) / (37 + reps)) * 10) / 10;
}

// 単位込みの値。表の列に並べる用（10回超は Brzycki 式の誤差が大きいので参考値と添える）
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

export function groupSets(sets, exercises) {
  const found = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groups = new Map();
  for (const set of sets) {
    if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
    groups.get(set.exerciseId).push(set);
  }
  return [...groups.entries()]
    .map(([id, list]) => ({
      name: found.get(id)?.name ?? '不明な種目',
      bodyPart: found.get(id)?.bodyPart ?? '',
      // id はランダムなので表示順は重量と回数で決める
      sets: list.sort((a, b) => a.weight - b.weight || a.reps - b.reps),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function groupTitle(group) {
  const part = group.bodyPart ? `（${group.bodyPart}）` : '';
  return `${group.name}${part} ベスト ${rmText(bestSet(group.sets))}・ボリューム ${volumeOf(group.sets)} kg`;
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
