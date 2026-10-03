# Skin Era: sitio web

Landing page de **Skin Era** (*Una nueva era para tu piel*), depilación con cera en Puerto Vallarta.
Stack: HTML + CSS + JS vanilla, con un build en Node sin dependencias. Se despliega en Netlify.

## Comandos
```bash
npm run dev     # build + servidor en http://localhost:3000 con rebuild al guardar
npm run build   # genera dist/
```

## Estructura
```
src/
  layout.html          estructura base (head, scripts)
  partials/            una sección = un parcial (header, hero, ...)
  content/
    site.json          datos globales (WhatsApp, redes, fecha de lanzamiento)
    es.json            textos en español
    en.json            (futuro) al crearlo se genera /en/ automáticamente
  css/                 tokens.css (marca) + un CSS por sección
  js/main.js
  assets/{fonts,img}
scripts/build.mjs
```

## Cuenta regresiva (apagada)
Está construida pero oculta. Para activarla, en `src/content/site.json`:
```json
"launch": { "enabled": true, "date": "2026-12-01T10:00:00-06:00" }
```

## Marca
- Colores: crema `#E8DEC5`, ocre `#BE8840`, café `#6C5649`, rosa `#D4B2A9`
- Tipografías: Giflika (títulos; sin `¿ ¡ —`, por eso los títulos con esos signos van en League Spartan) y League Spartan (cuerpo)
- Logos: extraídos del brandeck (raster). Sustituir por SVG/PNG originales cuando existan.

## Pendientes de licencia y contenido
- **Giflika es "personal use only"**: se requiere licencia comercial (https://brandsemut.com/product/giflika/) antes de publicar el dominio definitivo.
- Fotografías temporales: el arco del hero es un marcador.
- Sin precios por decisión del cliente.
