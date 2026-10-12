// Comparador antes/después: se arrastra la barra (ratón, táctil o teclado) para descubrir el "después".
document.querySelectorAll('[data-compare]').forEach((root) => {
  const handle = root.querySelector('[data-compare-handle]');
  const template = root.dataset.valuetext || '{antes}% / {despues}%';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pos = 50;
  let dragging = false;
  let touched = false; // cuando la persona interactúa, se cancela la animación de pista
  let hintFrame = 0;

  const set = (value) => {
    pos = Math.min(100, Math.max(0, value));
    const rounded = Math.round(pos);
    root.style.setProperty('--pos', `${pos}%`);
    handle.setAttribute('aria-valuenow', String(rounded));
    handle.setAttribute('aria-valuetext', template.replace('{antes}', rounded).replace('{despues}', 100 - rounded));
  };

  const fromEvent = (e) => {
    const rect = root.getBoundingClientRect();
    set(((e.clientX - rect.left) / rect.width) * 100);
  };

  const stopHint = () => { touched = true; cancelAnimationFrame(hintFrame); };

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopHint();
    dragging = true;
    root.classList.add('is-dragging');
    root.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  root.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
  const end = () => { dragging = false; root.classList.remove('is-dragging'); };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('lostpointercapture', end);

  handle.addEventListener('keydown', (e) => {
    const steps = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10 };
    if (e.key in steps) set(pos + steps[e.key]);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(100);
    else return;
    stopHint();
    e.preventDefault();
  });

  // Pista: la primera vez que entra en pantalla, la barra se mueve un poco para invitar a deslizar.
  if (!calm && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const frame = (now) => {
        if (touched) return;
        const t = Math.min(1, (now - start) / 1600);
        set(50 - 22 * Math.sin(t * Math.PI)); // 50 → 28 → 50
        if (t < 1) hintFrame = requestAnimationFrame(frame);
      };
      setTimeout(() => { if (!touched) hintFrame = requestAnimationFrame(frame); }, 500);
    }, { threshold: 0.6 });
    io.observe(root);
  }
});
