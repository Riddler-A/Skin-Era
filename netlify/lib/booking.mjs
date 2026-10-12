// Reglas de la agenda de Skin Era. Cambiar aquí cambia lo que se puede reservar.
// Horario de EJEMPLO: se ajusta cuando el equipo defina servicios y duraciones.
export const BOOKING = {
  timeZone: 'America/Mexico_City',
  weekdays: [1, 2, 3, 4, 5, 6], // 0 = domingo … 6 = sábado
  firstHour: 10, // la primera cita empieza a esta hora
  lastHour: 19, // la última cita termina a esta hora
  durationMinutes: 60,
  slotStepMinutes: 60, // una cita empieza cada hora
  minNoticeDays: 1, // anticipación mínima para reservar
  weeksAvailable: 4, // semanas que se pueden recorrer desde la primera disponible
};

// Puerto Vallarta usa la hora del centro de México, sin horario de verano desde 2022.
const UTC_OFFSET = '-06:00';
const OFFSET_MS = -6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad = (n) => String(n).padStart(2, '0');

export const toKey = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;

export function fromKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!match) return null;
  const parts = { y: +match[1], m: +match[2], d: +match[3] };
  const check = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (check.getUTCMonth() !== parts.m - 1 || check.getUTCDate() !== parts.d) return null;
  return parts;
}

export function addDays(p, n) {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const weekday = (p) => new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
const isOpenDay = (p) => BOOKING.weekdays.includes(weekday(p));

export function mondayOf(p) {
  const wd = weekday(p);
  return addDays(p, wd === 0 ? -6 : 1 - wd);
}

// Fecha del calendario en la hora de México para un instante dado.
function mxDate(ms) {
  const dt = new Date(ms + OFFSET_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export const dayStartISO = (p) => `${toKey(p)}T00:00:00${UTC_OFFSET}`;
const slotISO = (p, minutes) => `${toKey(p)}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00${UTC_OFFSET}`;

// Minutos del día (desde las 00:00) en que puede empezar una cita.
export function slotMinutes() {
  const out = [];
  for (let t = BOOKING.firstHour * 60; t + BOOKING.durationMinutes <= BOOKING.lastHour * 60; t += BOOKING.slotStepMinutes) {
    out.push(t);
  }
  return out;
}

export const earliestBookableMs = (nowMs) => nowMs + BOOKING.minNoticeDays * DAY_MS;
export const firstWeek = (nowMs) => mondayOf(mxDate(earliestBookableMs(nowMs)));
export const lastWeek = (nowMs) => addDays(firstWeek(nowMs), (BOOKING.weeksAvailable - 1) * 7);

// Semana válida más cercana a la pedida (dentro del rango permitido).
export function clampWeek(requested, nowMs) {
  const first = firstWeek(nowMs);
  const last = lastWeek(nowMs);
  const parsed = requested ? fromKey(requested) : null;
  if (!parsed) return first;
  const monday = mondayOf(parsed);
  if (toKey(monday) < toKey(first)) return first;
  if (toKey(monday) > toKey(last)) return last;
  return monday;
}

export function buildWeek(monday, nowMs) {
  const earliest = earliestBookableMs(nowMs);
  const minutes = slotMinutes();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    if (!isOpenDay(day)) continue;
    days.push({
      date: toKey(day),
      label: WEEKDAY_LABELS[weekday(day)],
      short: `${pad(day.d)}/${pad(day.m)}`,
      slots: minutes.map((min) => {
        const start = slotISO(day, min);
        return { start, time: `${pad(Math.floor(min / 60))}:${pad(min % 60)}`, available: Date.parse(start) >= earliest };
      }),
    });
  }
  const first = firstWeek(nowMs);
  const last = lastWeek(nowMs);
  const key = toKey(monday);
  return {
    week: key,
    prevWeek: key > toKey(first) ? toKey(addDays(monday, -7)) : null,
    nextWeek: key < toKey(last) ? toKey(addDays(monday, 7)) : null,
    days,
  };
}

// ¿Es este inicio uno de los horarios que ofrecemos y está dentro del rango?
export function isValidSlotStart(startISO, nowMs) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):00-06:00$/.exec(startISO ?? '');
  if (!match) return false;
  const day = fromKey(match[1]);
  if (!day || !isOpenDay(day)) return false;
  if (!slotMinutes().includes(+match[2] * 60 + +match[3])) return false;
  const ms = Date.parse(startISO);
  if (ms < earliestBookableMs(nowMs)) return false;
  return ms < Date.parse(dayStartISO(addDays(lastWeek(nowMs), 7)));
}

export function slotEndISO(startISO) {
  const end = new Date(Date.parse(startISO) + BOOKING.durationMinutes * 60 * 1000);
  const l = new Date(end.getTime() + OFFSET_MS);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:00${UTC_OFFSET}`;
}

const longDateFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: BOOKING.timeZone,
});
export const formatLongDate = (iso) => longDateFormat.format(new Date(iso));
