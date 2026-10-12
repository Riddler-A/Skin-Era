// Calendario incrustado: ajusta el alto del iframe con el mensaje que envía la propia agenda.
const frame = document.querySelector('[data-agenda]');
if (frame) {
  const origin = frame.dataset.origin;
  window.addEventListener('message', (e) => {
    // Solo se acepta el mensaje del origen esperado y de este mismo iframe
    if (e.origin !== origin || e.source !== frame.contentWindow) return;
    const data = e.data;
    if (!data || data.type !== 'prisma-agenda-height') return;
    const height = Number(data.height);
    if (Number.isFinite(height) && height > 0) {
      frame.style.height = `${Math.min(Math.max(Math.round(height), 400), 5000)}px`;
    }
  });
}
