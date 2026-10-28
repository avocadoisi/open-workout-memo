// 端末に保存する設定（配色・ヘッダーのタイトル）。実色は styles.css のパレット定義にある
export const THEMES = [
  { id: 'gruvbox', label: 'gruvbox light', swatch: '#af3a03' },
  { id: 'catppuccin', label: 'catppuccin latte', swatch: '#1e66f5' },
  { id: 'tokyonight', label: 'tokyonight night', swatch: '#bb9af7' },
];

const THEME_KEY = 'owa-theme';
const TITLE_KEY = 'owa-title';
export const DEFAULT_TITLE = '挙上log';
export const TITLE_MAX = 12;

export function currentTheme() {
  const id = document.documentElement.dataset.theme;
  return THEMES.some((theme) => theme.id === id) ? id : THEMES[0].id;
}

export function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(THEME_KEY, id);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function currentTitle() {
  return localStorage.getItem(TITLE_KEY) || DEFAULT_TITLE;
}

// 「挙上log」の文字はヘッダーとタブに出る
export function applyTitle(value) {
  const title = String(value).trim().slice(0, TITLE_MAX) || DEFAULT_TITLE;
  localStorage.setItem(TITLE_KEY, title);
  document.title = title;
  const brand = document.getElementById('brand-title');
  if (brand) brand.textContent = title;
  return title;
}
