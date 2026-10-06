// Shared, progressively enhanced behavior. Project content is ordinary HTML.
(() => {
  'use strict';
  document.querySelectorAll('[data-current-year], #year').forEach(el => {
    el.textContent = String(new Date().getFullYear());
  });
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  document.body.classList.add('js-ready');
})();
