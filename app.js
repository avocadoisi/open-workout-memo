import { seedIfEmpty } from './db.js';
import { byId, el, setStatus } from './dom.js';
import { icon } from './icons.js';
import { applyTheme, applyTitle, currentTheme, currentTitle } from './prefs.js';
import { view as recordView } from './views/record.js';
import { view as historyView } from './views/history.js';
import { view as chartView } from './views/chart.js';
import { view as dataView } from './views/data.js';
import { view as aboutView } from './views/about.js';
import { view as settingsView } from './views/settings.js';

const views = [recordView, historyView, chartView, dataView, aboutView, settingsView];
// 設定はタイルに並べない（ヘッダーの歯車から開く）
const tileViews = views.filter((view) => view.tile !== false);
const HOME = '#/';

// プレビューは実画面を縮小して描く。この幅を基準に zoom を決める
const PREVIEW_WIDTH = 720;

let renderToken = 0;

// null ならホーム（タイル一覧）。#/history?exercise=xxx のようなクエリも通す
function route() {
  const [id, query] = location.hash.replace(/^#\/?/, '').split('?');
  return views.some((view) => view.id === id) ? { id, query: query ?? '' } : null;
}

async function mountHome(host) {
  const tiles = [];
  const grid = el('div', { class: 'tiles' });
  host.append(grid);
  for (const view of tileViews) {
    const screen = el('div', { class: 'tile-screen', inert: '' });
    const frame = el('div', { class: 'tile-frame' }, screen);
    tiles.push({ view, screen, frame });
    grid.append(el('a', { class: 'tile', href: `#/${view.id}` },
      frame,
      el('div', { class: 'tile-head' },
        el('span', { class: 'tile-title', text: view.label }),
        el('span', { class: 'tile-open', 'aria-hidden': 'true' }, icon('right')),
      ),
    ));
  }

  await Promise.all(tiles.map(async (tile) => {
    try {
      await tile.view.mount(tile.screen);
    } catch (error) {
      tile.screen.textContent = `表示できません: ${error.message}`;
    }
    // shortcut: ウィンドウ幅が変わったときは追従しない（開き直せば直る）
    tile.screen.style.zoom = String(tile.frame.clientWidth / PREVIEW_WIDTH);
  }));
}

async function render() {
  const current = route();
  const id = current?.id ?? null;
  const hash = id ? `#/${id}${current.query ? `?${current.query}` : ''}` : HOME;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  byId('minimize').hidden = !id;

  // 戻る/進むの連打で古い view が新しい画面に混ざらないよう、毎回新しい host に描く
  const token = ++renderToken;
  const host = el('div', { class: 'view' });
  byId('app').replaceChildren(host);

  try {
    if (id) await views.find((view) => view.id === id).mount(host);
    else await mountHome(host);
  } catch (error) {
    if (token === renderToken) setStatus(`表示に失敗しました: ${error.message}`, true);
  }
}

async function init() {
  try {
    await seedIfEmpty();
    const minimize = byId('minimize');
    minimize.classList.add('icon-btn');
    minimize.setAttribute('aria-label', '最小化');
    minimize.title = '最小化';
    minimize.replaceChildren(icon('minimize'));
    minimize.addEventListener('click', () => { location.hash = HOME; });

    const about = byId('about');
    about.classList.add('icon-btn');
    about.setAttribute('aria-label', 'コンセプト');
    about.title = 'コンセプト';
    about.replaceChildren(icon('help'));
    about.addEventListener('click', () => { location.hash = '#/about'; });

    const settings = byId('settings');
    settings.classList.add('icon-btn');
    settings.setAttribute('aria-label', '設定');
    settings.title = '設定';
    settings.replaceChildren(icon('settings'));
    settings.addEventListener('click', () => { location.hash = '#/settings'; });

    applyTheme(currentTheme());
    applyTitle(currentTitle());
    window.addEventListener('hashchange', render);
    await render();
  } catch (error) {
    setStatus(`起動に失敗しました: ${error.message}`, true);
  }
}

// オフライン用のキャッシュを用意する（sw.js）。file:// では登録できないので失敗は無視する
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

init();
