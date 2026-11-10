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
