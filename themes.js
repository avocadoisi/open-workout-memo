// nvim の colorscheme のパレットを参考にした配色。実色は styles.css のパレット定義にある
export const THEMES = [
  { id: 'gruvbox', label: 'gruvbox light' },
  { id: 'catppuccin', label: 'catppuccin latte' },
  { id: 'kanagawa', label: 'kanagawa lotus' },
];

const KEY = 'owa-theme';

export function currentTheme() {
  const id = document.documentElement.dataset.theme;
  return THEMES.some((theme) => theme.id === id) ? id : THEMES[0].id;
}

export function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(KEY, id);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
