// アイコンは stroke のパスだけで持つ（fill はなし）。文字ボタンの代わりに使う
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  pencil: ['M4 20h4L20 8l-4-4L4 16v4z', 'M13 7l4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
  archive: ['M3 5h18v4H3z', 'M5 9v11h14V9', 'M10 13h4'],
  restore: ['M3 5h18v4H3z', 'M5 9v11h14V9', 'M12 18v-5', 'M9.5 15.5L12 13l2.5 2.5'],
  download: ['M12 4v9', 'M8 10l4 4 4-4', 'M5 20h14'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7'],
  minimize: ['M6 9l6 6 6-6'],
  left: ['M14 6l-6 6 6 6'],
  right: ['M10 6l6 6-6 6'],
  calendar: ['M4 6h16v14H4z', 'M8 3v4', 'M16 3v4', 'M4 11h16'],
  chart: ['M4 19h16', 'M5 15l4-5 3 3 5-7'],
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })) {
    svg.setAttribute(key, value);
  }
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
