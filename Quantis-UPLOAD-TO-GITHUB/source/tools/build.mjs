#!/usr/bin/env node
/**
 * Quantis Terminal · tools/build.mjs — production build  (npm run build → dist/)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. JS   — concatenates every file in js/manifest.json (same order, same global scope), minifies
 *           with Terser (compress + mangle local names, strips comments) → assets/app.<hash>.js
 * 2. CSS  — concatenates css/*.css in index.html order, minifies with clean-css → assets/app.<hash>.css
 * 3. HTML — single CSS/JS reference with SRI integrity, Content-Security-Policy meta, minified.
 * 4. PWA  — copies manifest + icons; injects the hashed shell list into sw.js and bumps its version.
 * 5. Hosting security headers — copies config/headers/* (Netlify/Cloudflare `_headers`, vercel.json,
 *           firebase.json, nginx.conf) so the same policy ships whichever host you use.
 * WHY ONE BUNDLE  2 requests instead of ~75, cache-busted by content hash, no source comments.
 * NOTE  Minification makes code harder to read, NOT secret — anything a browser runs can be viewed.
 *       Keep real secrets (API keys) on a server: see server/cloudflare-worker/key-proxy.js and docs/SECURITY.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import {fileURLToPath} from 'node:url';
import {minify} from 'terser'; import CleanCSS from 'clean-css'; import {minify as minifyHtml} from 'html-minifier-terser';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const sri = s => 'sha384-' + crypto.createHash('sha384').update(s).digest('base64');
fs.rmSync(DIST, {recursive:true, force:true}); fs.mkdirSync(path.join(DIST, 'assets'), {recursive:true});

// ---- JS ----
const files = JSON.parse(rd('js/manifest.json')).files;
const src = files.map(f => `/* ${f} */\n${rd(f)}\n;`).join('\n');
const js = await minify(src, {ecma:2020, compress:{passes:2, keep_fargs:true}, mangle:{toplevel:false}, format:{comments:false}, toplevel:false});
if(js.error) throw js.error;
const jsName = `assets/app.${hash(js.code)}.js`; fs.writeFileSync(path.join(DIST, jsName), js.code);

// ---- CSS ----
let html = rd('index.html');
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map(m=>m[1]);
const css = new CleanCSS({level:2}).minify(cssFiles.map(rd).join('\n')).styles;
const cssName = `assets/app.${hash(css)}.css`; fs.writeFileSync(path.join(DIST, cssName), css);

// ---- HTML ----
html = html.replace(/(<link rel="stylesheet" href="css\/[^"]+">\n?)+/, `<link rel="stylesheet" href="${cssName}" integrity="${sri(css)}">\n`);
html = html.replace(/<!-- APP-SCRIPTS:START[\s\S]*?APP-SCRIPTS:END -->/, `<script src="${jsName}" integrity="${sri(js.code)}"></script>`);
const CSP = ["default-src 'self'", "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://www.gstatic.com https://apis.google.com", "script-src-attr 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob: https:", "connect-src 'self' https:",
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://apis.google.com", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'none'", "upgrade-insecure-requests"].join('; ');
html = html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`);
html = await minifyHtml(html, {collapseWhitespace:true, conservativeCollapse:true, removeComments:true, minifyCSS:false, minifyJS:false, keepClosingSlash:true});
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// ---- PWA ----
fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), {recursive:true});
fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));
fs.copyFileSync(path.join(ROOT, 'site-config.js'), path.join(DIST, 'site-config.js')); // owner-editable, not bundled
const shell = ['./', './index.html', './manifest.webmanifest', './'+jsName, './'+cssName, './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
const sw = rd('sw.js').replace(/const VERSION = '[^']+';/, `const VERSION = 'quantis-${hash(js.code+css)}';`).replace(/const SHELL = [^;]+;/, `const SHELL = ${JSON.stringify(shell)};`);
fs.writeFileSync(path.join(DIST, 'sw.js'), (await minify(sw, {format:{comments:false}})).code);

// ---- hosting headers ----
fs.cpSync(path.join(ROOT, 'config/headers'), DIST, {recursive:true});
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nAllow: /\n');

const kb = p => (fs.statSync(path.join(DIST, p)).size/1024).toFixed(0)+' KB';
console.log(`dist/ built\n  ${jsName}  ${kb(jsName)}  (from ${files.length} files)\n  ${cssName}  ${kb(cssName)}\n  index.html  ${kb('index.html')}`);
