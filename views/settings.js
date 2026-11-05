import { byId, el, setStatus } from '../dom.js';
import { THEMES, TITLE_MAX, applyTheme, applyTitle, currentTheme, currentTitle } from '../prefs.js';

// 並び順はこの画面と記録画面だけが使う。Service Worker の部分更新で
// prefs.js の新旧が混ざっても起動できるよう、依存を増やさずここで完結させる
const ORDER_KEY = 'owa-set-order';
const SET_ORDERS = [
  { id: 'asc', label: '古い順' },
  { id: 'desc', label: '新しい順' },
];

function currentSetOrder() {
  return localStorage.getItem(ORDER_KEY) === 'desc' ? 'desc' : 'asc';
}

function applySetOrder(order) {
  localStorage.setItem(ORDER_KEY, order === 'desc' ? 'desc' : 'asc');
}

// タイルには並べず、ヘッダーの歯車からだけ開く
export const view = { id: 'settings', label: '設定', tile: false, mount };

const CSS = `
.pref { display: grid; gap: 0.75rem; }
.pref + .pref { margin-top: 1rem; }
.pref-choices { display: flex; gap: 0.5rem; }
.pref-choice { padding: 0.6rem; line-height: 0; color: var(--fg); background: transparent; border-color: transparent; }
.pref-choice[aria-pressed='true'] { border-color: var(--accent); background: var(--bg-soft); }
.pref-order { padding: 0.5rem 0.75rem; line-height: 1.4; }
.pref-dot { display: block; width: 1.25rem; height: 1.25rem; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 20%); }
.pref-form { display: grid; gap: 0.5rem; }
.pref-hint { margin: 0; color: var(--fg-soft); font-size: 0.8rem; }
`;

function themeChoice(theme) {
  const dot = el('span', { class: 'pref-dot' });
  dot.style.background = theme.swatch;
  const button = el('button', {
    type: 'button',
    class: 'pref-choice',
    'aria-label': theme.label,
    title: theme.label,
    'aria-pressed': String(theme.id === currentTheme()),
  }, dot);
  button.addEventListener('click', () => {
    applyTheme(theme.id);
    for (const other of button.parentElement.children) other.setAttribute('aria-pressed', String(other === button));
  });
  return button;
}

function orderChoice(order) {
  const button = el('button', {
    type: 'button',
    class: 'pref-choice pref-order',
    text: order.label,
    'aria-pressed': String(order.id === currentSetOrder()),
  });
  button.addEventListener('click', () => {
    applySetOrder(order.id);
    for (const other of button.parentElement.children) other.setAttribute('aria-pressed', String(other === button));
  });
  return button;
}

function mount(container) {
  const style = el('style');
  style.textContent = CSS;

  const input = el('input', {
    id: 'title-input',
    type: 'text',
    maxlength: String(TITLE_MAX),
    autocomplete: 'off',
    value: currentTitle(),
  });
  const form = el('form', { class: 'pref-form' },
    el('label', {}, 'ヘッダーに出す名前', input),
    el('p', { class: 'pref-hint', text: `${TITLE_MAX}文字まで。空で保存すると「挙上log」に戻ります。` }),
    el('button', { type: 'submit' }, '保存'),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    input.value = applyTitle(input.value);
    setStatus('タイトルを保存しました');
  });

  container.append(
    style,
    el('section', { class: 'pref' },
      el('div', { class: 'pref-choices', role: 'group', 'aria-label': '配色' }, ...THEMES.map(themeChoice)),
    ),
    el('section', { class: 'pref' },
      el('h2', { text: 'タイトル' }),
      form,
    ),
    el('section', { class: 'pref' },
      el('h2', { text: '記録の並び' }),
      el('div', { class: 'pref-choices', role: 'group', 'aria-label': '記録の並び' }, ...SET_ORDERS.map(orderChoice)),
      el('p', { class: 'pref-hint', text: '記録画面のセット一覧に適用します。既定は古い順（入力順）です。' }),
    ),
    el('p', { class: 'pref-hint', text: '設定はこの端末のブラウザに保存されます。' }),
  );
}
