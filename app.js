import { seedIfEmpty } from './db.js';
import { byId, el, setStatus } from './ui.js';
import { view as recordView } from './views/record.js';
import { view as historyView } from './views/history.js';
import { view as chartView } from './views/chart.js';
import { view as dataView } from './views/data.js';

const views = [recordView, historyView, chartView, dataView];
const HOME = '#/';

// プレビューは実画面を縮小して描く。この幅を基準に zoom を決める
const PREVIEW_WIDTH = 720;

let renderToken = 0;

// null ならホーム（タイル一覧）
function routeId() {
  const id = location.hash.replace(/^#\/?/, '');
  return views.some((view) => view.id === id) ? id : null;
}

async function mountHome(host) {
  const tiles = [];
  const grid = el('div', { class: 'tiles' });
  host.append(grid);
  for (const view of views) {
    const screen = el('div', { class: 'tile-screen', inert: '' });
    const frame = el('div', { class: 'tile-frame' }, screen);
    tiles.push({ view, screen, frame });
    grid.append(el('a', { class: 'tile', href: `#/${view.id}` },
      frame,
      el('div', { class: 'tile-head' },
        el('span', { class: 'tile-title', text: view.label }),
        el('span', { class: 'tile-open', text: 'ひらく ›' }),
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
  const id = routeId();
  const hash = id ? `#/${id}` : HOME;
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
    byId('minimize').addEventListener('click', () => { location.hash = HOME; });
    window.addEventListener('hashchange', render);
    await render();
  } catch (error) {
    setStatus(`起動に失敗しました: ${error.message}`, true);
  }
}

init();
