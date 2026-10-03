// Header: sombra al hacer scroll y menú móvil accesible
const header = document.querySelector('[data-header]');
const toggle = document.querySelector('[data-nav-toggle]');
const nav = document.querySelector('[data-nav]');

const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const setMenu = (open) => {
  toggle.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
};
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); toggle.focus(); } });

// Cuenta regresiva: solo se muestra si launch.enabled === true y launch.date es válida (src/content/site.json)
(async () => {
  const box = document.querySelector('[data-countdown]');
  if (!box) return;
  try {
    const { launch } = await (await fetch('/js/config.json')).json();
    const target = launch?.enabled && launch.date ? new Date(launch.date).getTime() : NaN;
    if (Number.isNaN(target) || target <= Date.now()) return;

    const cells = Object.fromEntries([...box.querySelectorAll('[data-cd]')].map((el) => [el.dataset.cd, el]));
    const tick = () => {
      const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const parts = { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 };
      for (const [k, v] of Object.entries(parts)) cells[k].textContent = String(v).padStart(2, '0');
      if (s === 0) { clearInterval(id); box.hidden = true; }
    };
    const id = setInterval(tick, 1000);
    tick();
    box.hidden = false;
  } catch { /* sin config: la cuenta regresiva permanece oculta */ }
})();
