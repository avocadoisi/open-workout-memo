import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// sw.js の SHELL にファイルを足し忘れると、オフライン時にそのモジュールだけ落ちる。
// シェルに載せるべきローカルファイルを列挙して、漏れをテストで止める。
const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const block = source.match(/const SHELL = \[([\s\S]*?)\n\];/);
assert.ok(block, 'sw.js に SHELL の定義がない');

const shell = new Set(
  [...block[1].matchAll(/'\.\/([^']*)'/g)].map((match) => match[1]).filter(Boolean),
);

const root = new URL('./', import.meta.url);
const rootFiles = readdirSync(root)
  .filter((name) => name.endsWith('.js') && name !== 'sw.js' && !name.endsWith('.test.mjs'));
const viewFiles = readdirSync(new URL('./views/', import.meta.url))
  .filter((name) => name.endsWith('.js') && !name.endsWith('.test.mjs'))
  .map((name) => `views/${name}`);
const staticFiles = [
  'index.html',
  'styles.css',
  'manifest.json',
  'icon.svg',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
];

test('SHELL はローカルのシェル一式をすべて含む', () => {
  for (const file of [...rootFiles, ...viewFiles, ...staticFiles]) {
    assert.ok(shell.has(file), `${file} が sw.js の SHELL にない`);
  }
});
