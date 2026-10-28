import { seedIfEmpty } from './db.js';
import { byId, el, setStatus } from './ui.js';
import { view as recordView } from './views/record.js';
import { view as historyView } from './views/history.js';
import { view as chartView } from './views/chart.js';
import { view as dataView } from './views/data.js';

const views = [recordView, historyView, chartView, dataView];
const DEFAULT_ID = 'record';

let renderToken = 0;

function routeId() {
  const id = location.hash.replace(/^#\//, '');
  return views.some((view) => view.id === id) ? id : DEFAULT_ID;
}

function renderNav(activeId) {
  byId('nav').replaceChildren(...views.map((view) =>
    el('a', {
      href: `#/${view.id}`,
      class: view.id === activeId ? 'tab active' : 'tab',
      'aria-current': view.id === activeId ? 'page' : 'false',
      text: view.label,
    }),
  ));
}

async function render() {
  const id = routeId();
  if (location.hash !== `#/${id}`) history.replaceState(null, '', `#/${id}`);

  // 戻る/進むの連打で古い view が新しい画面に混ざらないよう、毎回新しい host に描く
  const token = ++renderToken;
  renderNav(id);
  const host = el('div', { class: 'view' });
  byId('app').replaceChildren(host);

  try {
    await views.find((view) => view.id === id).mount(host);
  } catch (error) {
    if (token === renderToken) setStatus(`表示に失敗しました: ${error.message}`, true);
  }
}

async function init() {
  try {
    await seedIfEmpty();
    window.addEventListener('hashchange', render);
    await render();
  } catch (error) {
    setStatus(`起動に失敗しました: ${error.message}`, true);
  }
}

init();
