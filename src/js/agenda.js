// Calendario de citas: muestra los horarios de /api/agenda y agenda la cita.
// Si la API no responde (p. ej. aún sin Google Calendar), la sección sigue oculta.
const root = document.querySelector('[data-agenda]');
if (root) {
  const q = (sel) => root.querySelector(sel);
  const api = root.dataset.api;
  let t = {};
  try { t = JSON.parse(document.getElementById('agenda-i18n')?.textContent || '{}'); } catch { /* textos por defecto */ }

  const els = {
    picker: q('[data-picker]'), days: q('[data-days]'), msg: q('[data-msg]'), label: q('[data-week-label]'),
    prev: q('[data-prev]'), next: q('[data-next]'), form: q('[data-agenda-form]'), chosen: q('[data-chosen]'),
    submit: q('[data-submit]'), status: q('[data-agenda-status]'),
    done: q('[data-done]'), doneText: q('[data-done-text]'), service: q('#a-servicio'),
  };
  const state = { data: null, start: null, busy: false };
  const longDate = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' });
  const dayFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const weekLabel = (a, b) => {
    try { return dayFmt.formatRange(asUTC(a), asUTC(b)); } catch { return `${dayFmt.format(asUTC(a))} – ${dayFmt.format(asUTC(b))}`; }
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const asUTC = (key) => new Date(`${key}T12:00:00Z`);

  function setMsg(text, error = false) {
    els.msg.textContent = text || '';
    els.msg.classList.toggle('is-error', error);
  }

  function setChosen(start) {
    state.start = start;
    const chosen = Boolean(start);
    els.chosen.textContent = chosen ? `${t.chosen}: ${cap(longDate.format(new Date(start)))}` : els.chosen.dataset.empty;
    els.chosen.classList.toggle('is-chosen', chosen);
    els.submit.disabled = !chosen;
  }

  function clearSelection() {
    setChosen(null);
    els.days.querySelectorAll('.slot[aria-pressed="true"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }

  function render() {
    const { data } = state;
    const first = data.days[0]?.date;
    const last = data.days[data.days.length - 1]?.date;
    els.label.textContent = first ? weekLabel(first, last) : '';
    els.prev.disabled = !data.prevWeek;
    els.next.disabled = !data.nextWeek;
    els.days.replaceChildren();

    let available = 0;
    for (const day of data.days) {
      const wrap = document.createElement('div');
      wrap.className = 'agenda__day';
      const title = document.createElement('h3');
      title.className = 'agenda__dayname';
      title.append(day.label);
      const short = document.createElement('span');
      short.textContent = day.short;
      title.append(short);
      const slots = document.createElement('div');
      slots.className = 'agenda__slots';
      for (const slot of day.slots) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.dataset.start = slot.start;
        b.textContent = slot.time;
        b.disabled = !slot.available;
        b.setAttribute('aria-pressed', String(slot.start === state.start));
        if (slot.available) available += 1;
        slots.append(b);
      }
      wrap.append(title, slots);
      els.days.append(wrap);
    }
    setMsg(available ? '' : t.noSlots);
  }

  async function load(week) {
    setMsg('…');
    const res = await fetch(`${api}${week ? `?week=${encodeURIComponent(week)}` : ''}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    state.data = await res.json();
    render();
    root.hidden = false;
    // Con el calendario activo, el formulario alterno de abajo se oculta (ver contact.css)
    document.documentElement.classList.add('has-agenda');
  }

  async function go(week) {
    clearSelection();
    try { await load(week); } catch { setMsg(t.errLoad, true); }
  }

  els.prev.addEventListener('click', () => state.data?.prevWeek && go(state.data.prevWeek));
  els.next.addEventListener('click', () => state.data?.nextWeek && go(state.data.nextWeek));

  els.days.addEventListener('click', (e) => {
    const btn = e.target.closest('button.slot');
    if (!btn || btn.disabled) return;
    els.days.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    setChosen(btn.dataset.start);
    els.status.textContent = '';
    els.status.classList.remove('is-error');
    // En pantallas angostas el formulario queda debajo: se acerca a la vista.
    if (els.form.getBoundingClientRect().top > innerHeight * 0.85) els.form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    els.form.querySelector('#a-nombre').focus({ preventScroll: true });
  });

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy || !state.start) return;
    if (!els.form.checkValidity()) { els.form.reportValidity(); return; }
    const fd = new FormData(els.form);
    const label = els.submit.textContent;
    state.busy = true;
    els.submit.disabled = true;
    els.submit.textContent = t.sending;
    els.status.classList.remove('is-error');
    els.status.textContent = '';
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ start: state.start, name: fd.get('name'), phone: fd.get('phone'), service: fd.get('service'), notes: fd.get('notes'), empresa: fd.get('empresa') }),
      });
      if (res.ok) {
        const data = await res.json();
        els.doneText.textContent = (t.done || '').replace('{fecha}', cap(data.label || longDate.format(new Date(state.start))));
        els.picker.hidden = true;
        els.form.closest('.agenda__side').hidden = true;
        els.done.hidden = false;
        els.form.reset();
        els.done.focus();
        return;
      }
      let message = t.errGeneric;
      if (res.status === 409) {
        message = t.errTaken;
        clearSelection();
        load(state.data?.week).catch(() => {});
      } else if (res.status === 400) message = t.errInvalid;
      else if (res.status === 429) message = t.errBusy;
      els.status.classList.add('is-error');
      els.status.textContent = message;
    } catch {
      els.status.classList.add('is-error');
      els.status.textContent = t.errGeneric;
    } finally {
      state.busy = false;
      els.submit.disabled = !state.start; // sin horario elegido, el botón queda deshabilitado
      els.submit.textContent = label;
    }
  });

  // Servicio preseleccionado desde /agendar/?servicio=piernas
  const wanted = new URLSearchParams(location.search).get('servicio');
  if (wanted && els.service) {
    const opt = [...els.service.options].find((o) => o.dataset.slug === wanted);
    if (opt) els.service.value = opt.value;
  }

  load().catch(() => { /* sin API: el calendario permanece oculto y queda el formulario */ });
}
