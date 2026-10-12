// API de la agenda de Skin Era: GET /api/agenda?week=YYYY-MM-DD  y  POST /api/agenda
import {
  BOOKING, addDays, buildWeek, clampWeek, dayStartISO, formatLongDate, isValidSlotStart, slotEndISO,
} from '../lib/booking.mjs';
import { createEvent, getBusy, isCalendarConfigured, overlaps } from '../lib/google-calendar.mjs';
import site from '../../src/content/site.json' with { type: 'json' };
import { clientIp, isRateLimited } from '../lib/rate-limit.mjs';

export const config = { path: '/api/agenda' };

// Horarios de ejemplo (no crean citas ni tocan ningún calendario). Se activan solo si NO hay Google Calendar
// configurado y se pide explícitamente: AGENDA_DEMO=1 en tu computadora, o "agendaDemo": true en site.json.
// Al conectar Google Calendar la demostración se apaga sola.
const demoMode = () =>
  !isCalendarConfigured() &&
  process.env.AGENDA_DEMO !== '0' &&
  (process.env.AGENDA_DEMO === '1' || site.agendaDemo === true);

function demoBusy(timeMin) {
  const start = Date.parse(timeMin);
  const busy = [];
  for (let i = 0; i < 7 * 24; i++) {
    if ((i * 7 + 3) % 5 === 0) busy.push({ start: start + i * 3600_000, end: start + (i + 1) * 3600_000 });
  }
  return busy;
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function handleAgenda(request, { now = Date.now() } = {}) {
  const demo = demoMode();
  if (!isCalendarConfigured() && !demo) return json({ error: 'not_configured' }, 503);

  if (request.method === 'GET') {
    if (isRateLimited(`get:${clientIp(request)}`, 60, 60_000, now)) return json({ error: 'too_many_requests' }, 429);
    const monday = clampWeek(new URL(request.url).searchParams.get('week'), now);
    const week = buildWeek(monday, now);
    try {
      const busy = demo ? demoBusy(dayStartISO(monday)) : await getBusy(dayStartISO(monday), dayStartISO(addDays(monday, 7)));
      for (const day of week.days) {
        for (const slot of day.slots) {
          const start = Date.parse(slot.start);
          if (overlaps(start, start + BOOKING.durationMinutes * 60_000, busy)) slot.available = false;
        }
      }
      return json({ ...week, demo: demo || undefined });
    } catch (error) {
      console.error('[agenda] error al leer el calendario', error);
      return json({ error: 'calendar_error' }, 502);
    }
  }

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (isRateLimited(`post:${clientIp(request)}`, 5, 15 * 60_000, now)) return json({ error: 'too_many_requests' }, 429);
  if (Number(request.headers.get('content-length') ?? 0) > 10_000) return json({ error: 'invalid' }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid' }, 400);

  // Campo trampa: los bots lo llenan, las personas no lo ven.
  if (typeof body.empresa === 'string' && body.empresa.trim() !== '') return json({ ok: true });

  const start = str(body.start, 40);
  const name = str(body.name, 80);
  const phone = str(body.phone, 30);
  const service = str(body.service, 80);
  const notes = str(body.notes, 1000);
  const digits = phone.replace(/\D/g, '');

  if (!isValidSlotStart(start, now) || name.length < 2 || digits.length < 8 || digits.length > 15) {
    return json({ error: 'invalid' }, 400);
  }

  const end = slotEndISO(start);
  const result = { ok: true, start, end, label: formatLongDate(start) };
  if (demo) return json({ ...result, demo: true });

  try {
    // Volvemos a revisar: alguien pudo tomar el horario mientras se llenaba el formulario.
    if (overlaps(Date.parse(start), Date.parse(end), await getBusy(start, end))) return json({ error: 'slot_taken' }, 409);
  } catch (error) {
    console.error('[agenda] error al leer el calendario', error);
    return json({ error: 'calendar_error' }, 502);
  }

  try {
    await createEvent({
      start,
      end,
      summary: service ? `Cita: ${name} · ${service}` : `Cita: ${name}`,
      description: [
        `WhatsApp: ${phone}`,
        service && `Servicio: ${service}`,
        notes && `\nNotas:\n${notes}`,
        '\nAgendada desde la página web de Skin Era. Contactar por WhatsApp para confirmar.',
      ].filter(Boolean).join('\n'),
    });
  } catch (error) {
    console.error('[agenda] error al crear la cita', error);
    return json({ error: 'calendar_error' }, 502);
  }
  return json(result);
}

export default (request) => handleAgenda(request);
