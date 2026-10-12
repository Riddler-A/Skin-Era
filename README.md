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
    site.json          datos globales (redes, fecha de lanzamiento)
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

## Agenda de citas
La página `/agendar/` incluye un calendario propio que lee y escribe en **Google Calendar** a través de una
función de Netlify (`netlify/functions/agenda.mjs`, sin dependencias externas).

- **Reglas** (días, horario, duración, anticipación): `netlify/lib/booking.mjs`. Hoy son de **ejemplo**
  (lunes a sábado, 10:00 a 19:00, citas de 60 min, 1 día de anticipación). Ajustarlas cuando se definan los servicios.
- **Sin credenciales** el calendario permanece oculto y solo se ve el formulario "Déjanos tus datos".
- **Modo de prueba**: `npm run dev` usa horarios de ejemplo y no crea citas reales.
- **Pruebas**: `npm test` (reglas de horarios y API con un Google simulado).

### Conectar el calendario real de Skin Era
1. En Google Cloud Console crea un proyecto y activa **Google Calendar API**.
2. Crea una **cuenta de servicio** y descarga su llave JSON.
3. En Google Calendar abre el calendario de Skin Era > *Compartir con personas* > agrega el correo de la cuenta de
   servicio con permiso **Hacer cambios en eventos**.
4. En Netlify > *Environment variables* agrega `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y
   `GOOGLE_CALENDAR_ID` (ver `.env.example`) y vuelve a desplegar.

Las citas se crean como eventos con nombre, WhatsApp y servicio. Para bloquear horarios (descansos, días
cerrados) crea en ese calendario eventos **con horario** (los de "todo el día" se ignoran a propósito).

## Borradores (preguntas frecuentes)
Las respuestas con `"pending": true` en `src/content/es.json` están por confirmar con la clienta. Mientras
`"showDrafts": true` en `src/content/site.json` se ven con la etiqueta *Borrador por confirmar*. **Antes de publicar el
dominio definitivo, poner `showDrafts` en `false`**: las oculta y las excluye del JSON-LD (FAQPage).

## Marca
- Colores: crema `#E8DEC5`, ocre `#BE8840`, café `#6C5649`, rosa `#D4B2A9`
- Tipografías: Giflika (títulos; sin `¿ ¡ —`, por eso los títulos con esos signos van en League Spartan) y League Spartan (cuerpo)
- Logos: extraídos del brandeck (raster). Sustituir por SVG/PNG originales cuando existan.

## Pendientes de licencia y contenido
- **Giflika es "personal use only"**: se requiere licencia comercial (https://brandsemut.com/product/giflika/) antes de publicar el dominio definitivo.
- Fotografías temporales: el arco del hero es un marcador.
- Sin precios por decisión del cliente.

### Calendario de demostración

Mientras no estén las 3 variables de Google Calendar, `"agendaDemo": true` en `src/content/site.json` muestra horarios de
ejemplo con un aviso visible y **no guarda ninguna cita**. En cuanto se conecta Google Calendar, la demostración se apaga sola;
conviene además poner `agendaDemo` en `false`. Para forzar que no haya demostración (por ejemplo en pruebas): `AGENDA_DEMO=0`.
