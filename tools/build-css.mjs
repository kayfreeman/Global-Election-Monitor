// Builds public/css/tw.css from the class names used in public/ (Tailwind v4).
// Only needed if you change Tailwind classes in the UI:
//   npm i -D tailwindcss@4   then   node tools/build-css.mjs
// Override the package location with TAILWIND_DIR if installed elsewhere.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let twDir = process.env.TAILWIND_DIR;
if (!twDir) { try { twDir = path.dirname(require.resolve('tailwindcss/package.json')); } catch { console.error('tailwindcss v4 not found. Run: npm i -D tailwindcss@4'); process.exit(1); } }
const { compile } = await import(pathToFileURL(path.join(twDir, 'dist', 'lib.mjs')).href);

const input = `
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
@theme {
  --font-sans: Geist, Inter, system-ui, sans-serif;
  --font-body: Inter, Geist, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --color-void: #0A0F1D; --color-panel: #0F172A; --color-elev: #1E293B;
  --color-primary: #0284c7; --color-primary-deep: #075985;
}`;

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(html|js)$/.test(f)) files.push(p); } })(path.join(ROOT, 'public'));
const candidates = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/[A-Za-z0-9_\-:./\[\]#%!]+/g)) candidates.add(m[0]);

const compiler = await compile(input, {
  base: twDir,
  async loadStylesheet(id, base) {
    const file = id === 'tailwindcss' ? path.join(twDir, 'index.css') : id.startsWith('tailwindcss/') ? path.join(twDir, id.slice('tailwindcss/'.length)) : path.resolve(base, id);
    return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
  },
});
const css = compiler.build([...candidates]);
fs.writeFileSync(path.join(ROOT, 'public', 'css', 'tw.css'), css);
console.log(`tw.css written: ${(css.length / 1024).toFixed(1)} KB from ${files.length} files`);
