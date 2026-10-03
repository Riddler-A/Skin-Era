// Build mínimo sin dependencias: ensambla parciales + contenido por idioma en dist/.
//   npm run build   -> genera dist/
//   npm run dev     -> genera, sirve en :3000 y reconstruye al guardar
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Orden de las secciones del landing. Se agregan aquí a medida que se construyen.
const SECTIONS = ['hero'];

async function render(template, ctx, partials) {
  let out = template;
  // {{> nombre}} incluye un parcial (se resuelve recursivamente)
  for (let i = 0; i < 5 && /\{\{>\s*[\w-]+\s*\}\}/.test(out); i++) {
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => partials[n] ?? `<!-- parcial ${n} no existe -->`);
  }
  // {{#if clave}}...{{/if}}
  out = out.replace(/\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, body) => (get(ctx, k) ? body : ''));
  // {{clave.anidada}}
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = get(ctx, k);
    if (v === undefined) { console.warn(`  ! falta clave de contenido: ${k}`); return ''; }
    return String(v);
  });
}

async function build() {
  const t0 = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const site = JSON.parse(await readFile(join(SRC, 'content/site.json'), 'utf8'));
  const partials = {};
  for (const f of await readdir(join(SRC, 'partials'))) {
    partials[f.replace('.html', '')] = await readFile(join(SRC, 'partials', f), 'utf8');
  }
  const layout = await readFile(join(SRC, 'layout.html'), 'utf8');

  // Un idioma por cada src/content/<lang>.json. Hoy solo 'es'; agregar en.json activa /en/.
  const langs = (await readdir(join(SRC, 'content'))).filter(f => /^[a-z]{2}\.json$/.test(f)).map(f => f.slice(0, 2));
  for (const lang of langs) {
    const copy = JSON.parse(await readFile(join(SRC, 'content', `${lang}.json`), 'utf8'));
    const isDefault = lang === site.defaultLang;
    const base = isDefault ? '' : `/${lang}`;
    const ctx = {
      ...copy, site, lang, base,
      hasEnglish: langs.includes('en'),
      sectionsHtml: SECTIONS.map(s => `{{> ${s}}}`).join('\n'),
    };
    const html = await render(layout.replace('{{sectionsHtml}}', ctx.sectionsHtml), ctx, partials);
    const dir = isDefault ? DIST : join(DIST, lang);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html);
  }

  await cp(join(SRC, 'css'), join(DIST, 'css'), { recursive: true });
  await cp(join(SRC, 'js'), join(DIST, 'js'), { recursive: true });
  await cp(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
  // config pública para el JS (fecha de lanzamiento, etc.)
  await writeFile(join(DIST, 'js/config.json'), JSON.stringify({ launch: site.launch }, null, 2));
  if (existsSync(join(SRC, 'static'))) await cp(join(SRC, 'static'), DIST, { recursive: true });
  console.log(`✓ build listo en ${Date.now() - t0} ms (${langs.join(', ')})`);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ico': 'image/x-icon' };

function serve() {
  createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/') || p === '') p = join(p, 'index.html');
    try {
      const data = await readFile(join(DIST, p));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('404'); }
  }).listen(3000, () => console.log('→ http://localhost:3000'));
  let timer;
  watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => build().catch(console.error), 150); });
}

await build();
if (process.argv.includes('--serve')) serve();
