import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import * as booking from '../netlify/lib/booking.mjs';
import { handleAgenda } from '../netlify/functions/agenda.mjs';

// "Ahora" fijo: lunes 12 de octubre de 2026, 12:00 hora de México.
const NOW = Date.parse('2026-10-12T12:00:00-06:00');
const SLOT = '2026-10-14T11:00:00-06:00'; // miércoles 11:00
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

let calls, events, ipCounter = 0, realFetch;
const ip = () => `10.0.0.${++ipCounter}`;

function configure() {
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'agenda@skinera.iam.gserviceaccount.com';
  process.env.GOOGLE_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n'); // como se pega en Netlify
  process.env.GOOGLE_CALENDAR_ID = 'jass@example.com';
}

// Google simulado: valida la firma del acceso y responde eventos / crea eventos.
function mockGoogle({ failEvents = false } = {}) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const assertion = new URLSearchParams(String(init.body)).get('assertion');
      const [h, c, s] = assertion.split('.');
      assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')), 'firma JWT inválida');
      const claim = JSON.parse(Buffer.from(c, 'base64url').toString());
      assert.equal(claim.iss, process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
      assert.equal(claim.scope, 'https://www.googleapis.com/auth/calendar.events');
      return Response.json({ access_token: 'token-de-prueba', expires_in: 3600 });
    }
    if (failEvents) return new Response('boom con datos internos', { status: 500 });
    if (url.includes('/events') && (init.method ?? 'GET') === 'GET') return Response.json({ items: events });
    if (url.includes('/events') && init.method === 'POST') return Response.json({ id: 'evt-1' });
    throw new Error(`fetch inesperado: ${url}`);
  };
}

const get = (query = '', headers = {}) =>
  handleAgenda(new Request(`http://x/api/agenda${query}`, { headers: { 'x-nf-client-connection-ip': ip(), ...headers } }), { now: NOW });
const post = (body, headers = {}) =>
  handleAgenda(new Request('http://x/api/agenda', {
    method: 'POST', headers: { 'x-nf-client-connection-ip': ip(), 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }), { now: NOW });
const valid = { start: SLOT, name: 'Ana Prueba', phone: '322 123 4567', service: 'Piernas', notes: 'Primera vez' };
const created = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/events'));

beforeEach(() => {
  realFetch = globalThis.fetch;
  events = [];
  configure();
  mockGoogle();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL; delete process.env.GOOGLE_PRIVATE_KEY; delete process.env.GOOGLE_CALENDAR_ID;
});

// ---------- Reglas de horarios ----------
test('la semana abre de lunes a sábado, de 10:00 a 18:00 (citas de 60 min)', () => {
  const week = booking.buildWeek(booking.clampWeek(null, NOW), NOW);
  assert.deepEqual(week.days.map((d) => d.label), ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']);
  assert.deepEqual(week.days[0].slots.map((s) => s.time), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
  assert.equal(week.prevWeek, null);
  assert.equal(week.nextWeek, '2026-10-19');
});

test('respeta la anticipación mínima de 1 día', () => {
  const tue = booking.buildWeek(booking.clampWeek(null, NOW), NOW).days[1];
  assert.equal(tue.slots[0].available, false); // martes 10:00 (menos de 24 h)
  assert.equal(tue.slots[2].available, true); // martes 12:00
});

test('valida el inicio de una cita', () => {
  const ok = (s) => booking.isValidSlotStart(s, NOW);
  assert.equal(ok(SLOT), true);
  assert.equal(ok('2026-10-18T11:00:00-06:00'), false, 'domingo');
  assert.equal(ok('2026-10-14T11:30:00-06:00'), false, 'fuera de la cuadrícula');
  assert.equal(ok('2026-10-14T09:00:00-06:00'), false, 'antes del horario');
  assert.equal(ok('2026-10-14T19:00:00-06:00'), false, 'termina después del cierre');
  assert.equal(ok('2026-10-13T10:00:00-06:00'), false, 'menos de 24 h');
  assert.equal(ok('2027-01-14T11:00:00-06:00'), false, 'fuera del rango de semanas');
  assert.equal(ok('2026-10-14T11:00:00Z'), false, 'zona horaria distinta');
  assert.equal(ok('basura'), false);
});

// ---------- API ----------
test('sin credenciales responde 503 (la página oculta el calendario)', async () => {
  delete process.env.GOOGLE_CALENDAR_ID;
  process.env.AGENDA_DEMO = '0'; // site.json puede traer la demostración activa
  assert.equal((await get()).status, 503);
  assert.equal((await post(valid)).status, 503);
  delete process.env.AGENDA_DEMO;
});

test('modo demostración: horarios de ejemplo, no guarda nada y se apaga con Google Calendar', async () => {
  delete process.env.GOOGLE_CALENDAR_ID;
  process.env.AGENDA_DEMO = '1';
  let res = await get();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).demo, true);
  res = await post(valid);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).demo, true);
  assert.equal(created().length, 0, 'no debe crear eventos');
  process.env.GOOGLE_CALENDAR_ID = 'jass@example.com'; // ya conectado: deja de ser demostración
  assert.equal((await (await get()).json()).demo, undefined);
  delete process.env.AGENDA_DEMO;
});

test('GET marca ocupados solo los eventos reales con horario', async () => {
  events = [
    { status: 'confirmed', start: { dateTime: SLOT }, end: { dateTime: '2026-10-14T12:00:00-06:00' } },
    { status: 'confirmed', start: { date: '2026-10-15' }, end: { date: '2026-10-16' } }, // todo el día: se ignora
    { status: 'confirmed', transparency: 'transparent', start: { dateTime: '2026-10-15T10:00:00-06:00' }, end: { dateTime: '2026-10-15T11:00:00-06:00' } },
    { status: 'cancelled', start: { dateTime: '2026-10-15T12:00:00-06:00' }, end: { dateTime: '2026-10-15T13:00:00-06:00' } },
  ];
  const data = await (await get()).json();
  const slot = (date, time) => data.days.find((d) => d.date === date).slots.find((s) => s.time === time).available;
  assert.equal(slot('2026-10-14', '11:00'), false);
  assert.equal(slot('2026-10-14', '12:00'), true);
  assert.equal(slot('2026-10-15', '10:00'), true, 'evento "Disponible"');
  assert.equal(slot('2026-10-15', '12:00'), true, 'evento cancelado');
});

test('POST crea el evento con los datos correctos', async () => {
  const res = await post(valid);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.match(data.label, /miércoles.*14.*octubre/i);
  assert.equal(created().length, 1);
  const event = JSON.parse(created()[0].body);
  assert.equal(event.summary, 'Cita: Ana Prueba · Piernas');
  assert.equal(event.start.dateTime, SLOT);
  assert.equal(event.end.dateTime, '2026-10-14T12:00:00-06:00');
  assert.equal(event.start.timeZone, 'America/Mexico_City');
  assert.match(event.description, /WhatsApp: 322 123 4567/);
  assert.match(event.description, /Servicio: Piernas/);
  assert.match(event.description, /Primera vez/);
});

test('POST sobre un horario ocupado responde 409 y no crea nada', async () => {
  events = [{ status: 'confirmed', start: { dateTime: '2026-10-14T10:30:00-06:00' }, end: { dateTime: '2026-10-14T11:30:00-06:00' } }];
  assert.equal((await post(valid)).status, 409);
  assert.equal(created().length, 0);
});

test('POST rechaza datos inválidos sin tocar el calendario', async () => {
  for (const bad of [
    { ...valid, phone: '123' }, { ...valid, phone: 'abc' }, { ...valid, name: 'A' }, { ...valid, name: '' },
    { ...valid, start: '2026-10-14T11:30:00-06:00' }, { ...valid, start: '' },
  ]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  const arr = await handleAgenda(new Request('http://x/api/agenda', { method: 'POST', headers: { 'x-nf-client-connection-ip': ip() }, body: '[1,2]' }), { now: NOW });
  assert.equal(arr.status, 400);
  const notJson = await handleAgenda(new Request('http://x/api/agenda', { method: 'POST', headers: { 'x-nf-client-connection-ip': ip() }, body: '{no' }), { now: NOW });
  assert.equal(notJson.status, 400);
  assert.equal(created().length, 0);
});

test('el campo trampa de los bots finge éxito pero no agenda', async () => {
  const res = await post({ ...valid, empresa: 'Spam SA' });
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(created().length, 0);
});

test('rechaza cuerpos enormes (413) y métodos no permitidos (405)', async () => {
  assert.equal((await post(valid, { 'content-length': '50000' })).status, 413);
  const del = await handleAgenda(new Request('http://x/api/agenda', { method: 'DELETE', headers: { 'x-nf-client-connection-ip': ip() } }), { now: NOW });
  assert.equal(del.status, 405);
});

test('limita a 5 intentos de agendar por persona (429)', async () => {
  const same = { 'x-nf-client-connection-ip': '9.9.9.9' };
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await post({ ...valid, name: 'X' }, same)).status);
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
});

test('si Google falla responde 502 sin filtrar detalles internos', async () => {
  mockGoogle({ failEvents: true });
  const res = await get();
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.doesNotMatch(text, /boom|datos internos/);
});
