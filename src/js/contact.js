// Formulario de contacto: preselecciona el servicio (?servicio=slug) y envía por fetch a Netlify Forms.
const form = document.querySelector('[data-contact-form]');
if (form) {
  const select = form.querySelector('#c-servicio');
  const wanted = new URLSearchParams(location.search).get('servicio');
  if (wanted && [...select.options].some((o) => o.value === wanted)) select.value = wanted;

  const status = form.querySelector('[data-form-status]');
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.classList.remove('is-error');
    status.textContent = form.dataset.sending;
    button.disabled = true;
    button.textContent = form.dataset.sending;
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      status.textContent = form.dataset.ok;
    } catch {
      status.classList.add('is-error');
      status.textContent = form.dataset.error;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}
