export const byId = (id) => document.getElementById(id);

// textContent / setAttribute だけで組み立てる（innerHTML は使わない）
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

let statusTimer;

export function setStatus(message, isError = false) {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = '';
    status.classList.remove('error');
  }, 5000);
}

export function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function unitLabel(unit) {
  return unit === 'length' ? 'cm' : 'kg';
}

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

export function bestSet(sets) {
  return sets.reduce((best, set) =>
    estimate1RM(set.weight, set.reps) > estimate1RM(best.weight, best.reps) ? set : best,
  );
}

export function option(value, label) {
  return el('option', { value, text: label });
}
