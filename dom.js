// DOM の組み立て道具。HTML 文字列は使わない（innerHTML 禁止）
import { icon } from './icons.js';
import { rmValue } from './training.js';

export const byId = (id) => document.getElementById(id);

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

export function option(value, label) {
  return el('option', { value, text: label });
}

// 文字ではなくアイコンだけのボタン。読み上げ用に label は残す
export function iconButton(name, label, onClick) {
  return el('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': label,
    title: label,
    onclick: onClick,
  }, icon(name));
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

// セット表は記録・保存画像・履歴で同じ形にする（列ズレを防ぐ）
export function setHead(weightLabel = '重量') {
  return el('div', { class: 'set-head' },
    el('span', { text: weightLabel }),
    el('span', {}),
    el('span', { text: '回数' }),
    el('span', { text: '1RM' }),
  );
}

export function setRow(set, extra = []) {
  return el('div', { class: 'set-row', 'data-id': set.id },
    el('div', { class: 'set-main' },
      el('span', { class: 'set-num', text: String(set.weight) }),
      el('span', { class: 'set-times', text: '×' }),
      el('span', { class: 'set-num', text: String(set.reps) }),
      el('span', { class: 'set-rm', text: rmValue(set) }),
    ),
    ...(set.memo ? [el('small', { text: set.memo })] : []),
    ...extra,
  );
}

// 行を畳んでから消す（DB を書き換えて再描画する前に呼ぶ。待たずに描き直すと即座に差し替わる）
// 180ms は styles.css の .set-row.leaving と揃える
export function collapseRow(row) {
  if (!row) return Promise.resolve();
  row.style.maxHeight = `${row.scrollHeight}px`;
  row.getBoundingClientRect(); // 高さを確定させてから畳む（transition を効かせる）
  row.classList.add('leaving');
  row.style.maxHeight = '0px';
  return new Promise((resolve) => setTimeout(resolve, 180));
}

export function setTable(sets, { head, extra } = {}) {
  return el('div', {},
    setHead(head),
    ...sets.map((set) => setRow(set, extra ? extra(set) : [])),
  );
}
