import { el } from '../ui.js';

export const view = {
  id: 'chart',
  label: 'グラフ',
  mount(container) {
    container.append(el('section', {}, el('p', { class: 'placeholder', text: '準備中' })));
  },
};
