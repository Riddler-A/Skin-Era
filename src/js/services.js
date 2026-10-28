// Filtro de servicios: Todos / Damas / Caballeros. Sin JavaScript se ven todos.
const bar = document.querySelector('[data-filter]');
if (bar) {
  const buttons = [...bar.querySelectorAll('[data-filter-value]')];
  const groups = [...document.querySelectorAll('[data-group]')];

  function apply(value, updateHash = true) {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filterValue === value)));
    groups.forEach((g) => { g.hidden = value !== 'all' && g.dataset.group !== value; });
    if (updateHash) history.replaceState(null, '', value === 'all' ? location.pathname : `#${value}`);
  }

  bar.hidden = false;
  buttons.forEach((b) => b.addEventListener('click', () => apply(b.dataset.filterValue)));
  const fromHash = location.hash.slice(1);
  if (groups.some((g) => g.dataset.group === fromHash)) apply(fromHash, false);
}
