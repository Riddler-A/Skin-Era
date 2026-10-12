// Habla con la API de Google Calendar con una cuenta de servicio, sin dependencias:
// firma el acceso (JWT RS256) con las funciones nativas de Node.
// Solo se importa desde funciones del servidor: las credenciales nunca llegan al navegador.
import { createSign } from 'node:crypto';
import { BOOKING } from './booking.mjs';

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Permiso mínimo: leer y crear eventos (no administra calendarios).
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function readConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Tolera la llave pegada con comillas de más o con "\n" escritos como texto.
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim().replace(/^"+|"+$/g, '').replace(/\\n/g, '\n');
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  return email && key && calendarId ? { email, key, calendarId } : null;
}

export const isCalendarConfigured = () => readConfig() !== null;

const b64url = (data) => Buffer.from(data).toString('base64url');

function signJwt({ email, key }) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`;
  return `${input}.${b64url(createSign('RSA-SHA256').update(input).sign(key))}`;
}

let cached = null;

async function accessToken(config) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(config) }),
  });
  if (!res.ok) throw new Error(`Google OAuth respondió ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function calendarFetch(path, init = {}) {
  const config = readConfig();
  if (!config) throw new Error('Google Calendar no está configurado');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${await accessToken(config)}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Google Calendar respondió ${res.status}`);
  return res.json();
}

// Bloques ocupados según los eventos del calendario. Se ignoran los de "todo el día"
// (suelen ser recordatorios), los marcados como "Disponible" y los rechazados.
// Para bloquear un día completo, crear un evento con horario (p. ej. 10:00–19:00).
export async function getBusy(timeMin, timeMax) {
  const { calendarId } = readConfig();
  const busy = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', maxResults: '250', timeZone: BOOKING.timeZone });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    for (const event of data.items ?? []) {
      if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
      if (!event.start?.dateTime || !event.end?.dateTime) continue;
      if (event.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue;
      busy.push({ start: Date.parse(event.start.dateTime), end: Date.parse(event.end.dateTime) });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return busy;
}

export async function createEvent({ start, end, summary, description }) {
  const { calendarId } = readConfig();
  const created = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary,
      description,
      start: { dateTime: start, timeZone: BOOKING.timeZone },
      end: { dateTime: end, timeZone: BOOKING.timeZone },
      reminders: { useDefault: true },
    }),
  });
  return created.id;
}

export const overlaps = (start, end, busy) => busy.some((b) => start < b.end && end > b.start);
