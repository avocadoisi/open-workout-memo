import { el } from '../dom.js';

export const view = { id: 'about', label: 'コンセプト', mount };

const POINTS = [
  ['ログイン不要', 'アカウントもパスワードもありません。開いたら、すぐ記録できます。'],
  ['データは手元に', '記録はブラウザの中（IndexedDB）にだけ保存します。サーバーには送りません。'],
  ['書き出し・読み込み', 'すべてのデータを JSON で書き出せます。読み込みで引っ越しもバックアップもできます。'],
  ['広告なし', '広告も課金もありません。'],
];

const CSS = `
.about { display: grid; gap: 0.75rem; }
.about p { margin: 0; }
.about-lead { font-weight: 700; }
.about ul { gap: 0.75rem; }
.about li { display: grid; gap: 0.15rem; }
.about-title { font-weight: 700; }
.about-body { color: var(--fg-soft); font-size: 0.875rem; }
`;

function mount(container) {
  const style = el('style');
  style.textContent = CSS;
  container.append(style, el('section', { class: 'about' },
    el('h2', { text: '挙上log について' }),
    el('p', { class: 'about-lead', text: '挙げた重さを、淡々と残すための記録帳。' }),
    el('p', { text: 'サーバーもログインも同期もなし。記録があるのは、開いているブラウザの中だけです。' }),
    el('ul', {}, ...POINTS.map(([title, body]) => el('li', {},
      el('span', { class: 'about-title', text: title }),
      el('span', { class: 'about-body', text: body }),
    ))),
    el('p', { class: 'about-body', text: 'ブラウザのデータを消すと記録も消えます。ときどき書き出しておいてください。' }),
  ));
}
