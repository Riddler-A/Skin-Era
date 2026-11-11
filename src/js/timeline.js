// Videos de la línea de tiempo: se reproducen (en silencio) solo mientras se ven en pantalla.
// Con "reducir movimiento" no se reproducen solos; la persona los inicia con los controles.
const videos = document.querySelectorAll('[data-timeline-video]');
if (videos.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.play().catch(() => {});
      else e.target.pause();
    });
  }, { threshold: 0.5 });
  videos.forEach((v) => io.observe(v));
}

// Imágenes ampliables: clic (o Enter) abre la imagen grande; Esc, la X o un clic fuera la cierran.
const box = document.querySelector('[data-lightbox]');
if (box && typeof box.showModal === 'function') {
  const big = box.querySelector('.lightbox__img');
  document.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const img = btn.querySelector('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      box.showModal();
    });
  });
  box.querySelector('[data-lightbox-close]').addEventListener('click', () => box.close());
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  box.addEventListener('close', () => { big.removeAttribute('src'); });
}

// Botón "Ir a lo más reciente": baja al último capítulo; ya abajo, cambia a "Volver al inicio".
const jump = document.querySelector('[data-jump]');
const items = document.querySelectorAll('.timeline__item');
if (jump && items.length > 1) {
  const text = jump.querySelector('[data-jump-text]');
  const story = document.querySelector('[data-story]');
  const last = items[items.length - 1];
  const first = document.querySelector('.timeline');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduce ? 'auto' : 'smooth';
  // En escritorio la historia tiene su propio scroll; en móvil o pantallas bajas se mueve la página.
  const innerScroll = () => story && story.scrollHeight > story.clientHeight + 2 && getComputedStyle(story).overflowY !== 'visible';
  const goTo = (el, pad = 0) => {
    pad += 60; // deja libre el botón flotante
    if (innerScroll()) {
      const top = el.getBoundingClientRect().top - story.getBoundingClientRect().top + story.scrollTop - pad;
      story.scrollTo({ top, behavior });
    } else {
      window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - pad, behavior });
    }
  };
  const atEnd = () => {
    const edge = innerScroll() ? story.getBoundingClientRect().top + story.clientHeight * 0.55 : innerHeight * 0.55;
    return last.getBoundingClientRect().top < edge;
  };
  const sync = () => {
    const up = atEnd();
    jump.classList.toggle('is-up', up);
    text.textContent = up ? jump.dataset.labelFirst : jump.dataset.labelLatest;
  };
  jump.addEventListener('click', () => (atEnd() ? goTo(first, -60) : goTo(last)));
  (story || window).addEventListener('scroll', sync, { passive: true });
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  jump.hidden = false;
  sync();
}

// Sonido del video: arranca en silencio (los navegadores no permiten autoplay con sonido); el botón lo activa.
document.querySelectorAll('[data-sound]').forEach((btn) => {
  const video = btn.parentElement.querySelector('video');
  if (!video) return;
  const sync = () => {
    const on = !video.muted && video.volume > 0;
    btn.setAttribute('aria-pressed', String(on));
    const label = on ? btn.dataset.labelOff : btn.dataset.labelOn;
    btn.setAttribute('aria-label', label);
    btn.title = label;
  };
  btn.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted) { video.volume = 1; video.play().catch(() => {}); }
    sync();
  });
  video.addEventListener('volumechange', sync); // también si usan el control propio del video
  sync();
});
