/**
 * Every sport's badge drawing (src/components/SportArt.tsx — the court, table
 * or board from above) as a plain SVG string, so tests can check that no two
 * sports look alike. The app's file is compiled here with TypeScript and run
 * with stand-ins for React Native.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');

const FRAG = '#fragment';
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), Fragment: FRAG };
const STUBS = {
  react: { __esModule: true, default: React, ...React },
  'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: (x) => x, absoluteFill: {}, flatten: (x) => x } },
  'react-native-svg': { __esModule: true, default: 'svg', Rect: 'rect', Circle: 'circle', Line: 'line', Path: 'path', G: 'g', Ellipse: 'ellipse' },
  // Names only matter for the badge rows, which the website doesn't draw.
  '../sports/sportMeta': { getSportMeta: (id) => ({ id, name: id, icon: '' }) },
};

const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const src = readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  cache.set(file, module.exports);
  const req = (spec) => {
    if (STUBS[spec]) return STUBS[spec];
    if (spec.startsWith('.')) {
      const base = resolve(dirname(file), spec);
      for (const ext of ['.ts', '.tsx']) { try { readFileSync(base + ext); return load(base + ext); } catch { /* next */ } }
    }
    throw new Error(`sportArtSvg: no stand-in for '${spec}' (imported by ${file})`);
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: req, console }, { filename: file });
  cache.set(file, module.exports);
  return module.exports;
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function toSvg(node) {
  if (node == null || node === false || node === true) return '';
  if (Array.isArray(node)) return node.map(toSvg).join('');
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  const { type, props, children } = node;
  const kids = toSvg(children.length ? children : props.children);
  if (type === FRAG) return kids;
  const attrs = Object.entries(props)
    .filter(([k, v]) => k !== 'children' && k !== 'key' && v != null && v !== false)
    .map(([k, v]) => ` ${kebab(k)}="${esc(v)}"`).join('');
  return `<${type}${attrs}>${kids}</${type}>`;
}

function art() {
  return load(join(ROOT, 'src/components/SportArt.tsx'));
}

/** A sport's markings (the drawing without its colour) and its colour. */
export async function sportArtParts(sport) {
  const m = art();
  return { markings: toSvg(m.sportArtNodes(sport)), color: m.SPORT_COLORS[sport] ?? m.SPORT_FALLBACK };
}

/** The whole drawing as an SVG document (a square, like the app's badges). */
export async function sportArtSvg(sport, { size = 100, radius = 0 } = {}) {
  const { markings, color } = await sportArtParts(sport);
  const clip = radius ? `<clipPath id="c"><rect width="100" height="100" rx="${radius}"/></clipPath>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice">${clip}<g${radius ? ' clip-path="url(#c)"' : ''}><rect width="100" height="100" fill="${color}"/>${markings}</g></svg>`;
}
