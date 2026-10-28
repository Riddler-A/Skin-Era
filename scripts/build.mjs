// Build mínimo sin dependencias: ensambla parciales + contenido por idioma en dist/.
//   npm run build   -> genera dist/
//   npm run dev     -> genera, sirve en :3000 y reconstruye al guardar
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Páginas del sitio (src/pages.json): cada una lista sus secciones (parciales) y su CSS.
// Las secciones de la Home se agregan ahí a medida que se construyen.

async function render(template, ctx, partials) {
  let out = template;
  // {{> nombre}} incluye un parcial (se resuelve recursivamente)
  for (let i = 0; i < 5 && /\{\{>\s*[\w-]+\s*\}\}/.test(out); i++) {
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => partials[n] ?? `<!-- parcial ${n} no existe -->`);
  }
  // {{#each lista}}...{{this.campo}} {{@index}}...{{/each}} (sin anidar)
  out = out.replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, k, body) =>
    (get(ctx, k) ?? []).map((item, i) => body
      .replace(/\{\{\s*this\.([\w.]+)\s*\}\}/g, (_, f) => String(get(item, f) ?? ''))
      .replace(/\{\{\s*@index\s*\}\}/g, String(i))
      .replace(/\{\{\s*@number\s*\}\}/g, String(i + 1))).join(''));
  // {{#if clave}}...{{/if}}
  // (se resuelven de adentro hacia afuera, así que admite anidación)
  const innerIf = /\{\{#if\s+([\w.]+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/g;
  for (let prev; prev !== out; ) { prev = out; out = out.replace(innerIf, (_, k, body) => (get(ctx, k) ? body : '')); }
  // {{clave.anidada}}
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = get(ctx, k);
    if (v === undefined) { console.warn(`  ! falta clave de contenido: ${k}`); return ''; }
    return String(v);
  });
}

const FAQ_GROUPS = ['before', 'first', 'hygiene', 'after'];

// Oculta (o etiqueta) los elementos con pending:true según site.showDrafts.
const markDrafts = (items = [], site, label) => items
  .filter(i => !i.pending || site.showDrafts)
  .map(i => ({ ...i, draftBadge: i.pending ? `<span class="faq-draft">${label}</span>` : '' }));

// FAQ: aplica borradores y arma el JSON-LD (FAQPage) solo con respuestas finales.
function prepareFaq(faq, site) {
  if (!faq) return { faq, jsonLd: '' };
  const out = { ...faq }, published = [];
  for (const g of FAQ_GROUPS) {
    out[g] = markDrafts(faq[g], site, faq.draftLabel);
    published.push(...(faq[g] ?? []).filter(i => !i.pending));
  }
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: published.map(i => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
  const jsonLd = published.length ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '';
  return { faq: out, jsonLd };
}

// Selector de idioma: enlace a la misma página en el otro idioma + etiquetas hreflang
function langContext(lang, langs, site, page) {
  const urlFor = (l) => `${l === site.defaultLang ? '' : `/${l}`}/${page.path ? `${page.path}/` : ''}`;
  const other = langs.find(l => l !== lang);
  return {
    langSwitchHref: other ? urlFor(other) : '',
    langSwitchLabel: other ? other.toUpperCase() : '',
    langSwitchLang: other ?? '',
    hreflangLinks: langs.length > 1
      ? [...langs.map(l => `<link rel="alternate" hreflang="${l}" href="${site.url}${urlFor(l)}">`), `<link rel="alternate" hreflang="x-default" href="${site.url}${urlFor(site.defaultLang)}">`].join('\n  ')
      : '',
    ogLocale: lang === 'en' ? 'en_US' : 'es_MX',
  };
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
  const layouts = { default: await readFile(join(SRC, 'layout.html'), 'utf8'), bare: await readFile(join(SRC, 'layout-bare.html'), 'utf8') };

  // Un idioma por cada src/content/<lang>.json. Hoy solo 'es'; agregar en.json activa /en/.
  const langs = (await readdir(join(SRC, 'content'))).filter(f => /^[a-z]{2}\.json$/.test(f)).map(f => f.slice(0, 2));
  const pages = JSON.parse(await readFile(join(SRC, 'pages.json'), 'utf8'));
  const baseCss = ['tokens', 'base', 'header', 'footer', 'totop'];
  for (const lang of langs) {
    const copy = JSON.parse(await readFile(join(SRC, 'content', `${lang}.json`), 'utf8'));
    const { faq, jsonLd } = prepareFaq(copy.faq, site);
    copy.faq = faq;
    if (copy.blog) {
      const list = markDrafts(copy.blog.list, site, copy.blog.draftLabel);
      copy.blog = { ...copy.blog, list, noPosts: list.length ? '' : copy.blog.emptyText };
    }
    if (copy.firstTime) {
      const l = copy.firstTime.draftLabel;
      copy.firstTime = { ...copy.firstTime, stepsList: markDrafts(copy.firstTime.stepsList, site, l), prepList: markDrafts(copy.firstTime.prepList, site, l) };
    }
    const isDefault = lang === site.defaultLang;
    const base = isDefault ? '' : `/${lang}`;
    for (const page of pages.filter(p => !p.pending || site.showDrafts)) {
      // current.<id> marca el enlace activo del menú con aria-current
      const current = Object.fromEntries(pages.map(p => [p.id, p.id === page.id || p.id === page.parent ? 'aria-current="page"' : '']));
      const ctx = {
        ...copy, site, lang, base, current,
        page: { id: page.id, path: page.path ? `${page.path}/` : '', ...(copy.pages?.[page.id] ?? {}),
          draftBadge: page.pending && site.showDrafts ? `<span class="faq-draft">${copy.blog?.draftLabel ?? ''}</span>` : '' },
        ...langContext(lang, langs, site, page),
        jsonLd: page.id === 'faq' ? jsonLd : '',
        agendaI18n: JSON.stringify(copy.contact?.agenda?.js ?? {}).replace(/</g, '\\u003c'),
        year: new Date().getFullYear(),
        hasSocial: Boolean(site.instagram || site.facebook || site.tiktok),
        cssLinks: [...(page.layout === 'bare' ? ['tokens', 'base'] : baseCss), ...page.css].filter(n => existsSync(join(SRC, 'css', `${n}.css`)))
          .map(n => `<link rel="stylesheet" href="/css/${n}.css">`).join('\n  '),
        pageScripts: (page.js ?? []).map(n => `<script src="/js/${n}.js" defer></script>`).join('\n  '),
        sectionsHtml: page.sections.map(sec => `{{> ${sec}}}`).join('\n'),
      };
      const html = await render((layouts[page.layout ?? 'default']).replace('{{sectionsHtml}}', ctx.sectionsHtml), ctx, partials);
      const dir = join(isDefault ? DIST : join(DIST, lang), page.path);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), html);
    }
  }

  await cp(join(SRC, 'css'), join(DIST, 'css'), { recursive: true });
  await cp(join(SRC, 'js'), join(DIST, 'js'), { recursive: true });
  await cp(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
  // config pública para el JS (fecha de lanzamiento, etc.)
  await writeFile(join(DIST, 'js/config.json'), JSON.stringify({ launch: site.launch }, null, 2));
  if (existsSync(join(SRC, 'static'))) await cp(join(SRC, 'static'), DIST, { recursive: true });
  console.log(`✓ build listo en ${Date.now() - t0} ms (${langs.join(', ')}; ${pages.length} páginas)`);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ico': 'image/x-icon' };

// En desarrollo, /api/agenda usa la misma función que Netlify, con horarios de ejemplo.
async function handleApi(req, res) {
  const mod = await import(`${pathToFileURL(join(ROOT, 'netlify/functions/agenda.mjs')).href}?t=${Date.now()}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = {};
  for (const h of ['content-type', 'x-forwarded-for']) if (req.headers[h]) headers[h] = req.headers[h];
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const out = await mod.default(new Request(`http://localhost:3000${req.url}`, { method: req.method, headers, body }));
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}

function serve() {
  if (!process.env.GOOGLE_CALENDAR_ID) process.env.AGENDA_DEMO = '1'; // horarios de ejemplo, no crea citas reales
  createServer(async (req, res) => {
    if (req.url.split('?')[0] === '/api/agenda') {
      try { return await handleApi(req, res); } catch (e) { console.error(e); res.writeHead(500); return res.end('error'); }
    }
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
