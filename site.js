// Shared, progressively enhanced behavior. Project content is ordinary HTML.
(() => {
  'use strict';
  document.querySelectorAll('[data-current-year], #year').forEach(el => {
    el.textContent = String(new Date().getFullYear());
  });

  // Homepage side navigation. The title under the pointer grows most and its neighbours grow a
  // little, so moving along the list feels continuous. The section being read is highlighted.
  const sectionNav = document.querySelector('.section-nav');
  if (sectionNav) {
    const links = [...sectionNav.querySelectorAll('a')];
    const sections = links.map(link => document.querySelector(link.hash));
    sectionNav.addEventListener('pointermove', event => {
      const top = sectionNav.getBoundingClientRect().top;
      links.forEach(link => {
        const distance = Math.abs(event.clientY - top - (link.offsetTop + link.offsetHeight / 2));
        link.style.setProperty('--grow', String(Math.max(0, 1 - distance / 72)));
      });
    });
    const shrink = () => links.forEach(link => link.style.setProperty('--grow', '0'));
    sectionNav.addEventListener('pointerleave', shrink);
    let queued = false;
    const markCurrent = () => {
      queued = false;
      let current = 0;
      sections.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= innerHeight * 0.4) current = i;
      });
      // The last section may be too short to reach that line, so the bottom of the page selects it.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = sections.length - 1;
      links.forEach((link, i) => i === current ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current'));
      // Stay out of the opening banner: appear once the planet has gone and Projects is in view.
      const visible = current > 0;
      if (!visible) shrink();
      sectionNav.classList.toggle('is-visible', visible);
    };
    const queue = () => {
      if (!queued) { queued = true; requestAnimationFrame(markCurrent); }
    };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    markCurrent();
  }

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
