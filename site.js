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

  // About photos: two columns drift in opposite directions. Hovering with a mouse stops the drift,
  // and the wheel then scrolls whichever column is under the pointer. Each column is repeated once
  // (repeats hidden from screen readers) so its position can wrap around seamlessly.
  const wall = document.querySelector('.photo-wall');
  if (wall) {
    const columns = [...wall.querySelectorAll('.wall-column')].map((column, i) => {
      const track = column.querySelector('.wall-track');
      [...track.children].forEach(img => {
        const repeat = img.cloneNode();
        repeat.alt = '';
        repeat.setAttribute('aria-hidden', 'true');
        track.append(repeat);
      });
      // Drift speed in column widths per second; the second column moves the other way, a little slower.
      return { column, track, direction: i ? -1 : 1, rate: i ? 0.09 : 0.105, offset: 0, target: 0, loop: 1 };
    });
    const measure = () => columns.forEach(c => { c.loop = Math.max(1, c.track.scrollHeight / 2); c.width = c.column.clientWidth; });
    measure();
    if ('ResizeObserver' in window) {
      const resized = new ResizeObserver(measure);
      columns.forEach(c => resized.observe(c.track));
    } else {
      addEventListener('resize', measure);
    }

    // Only a mouse actually moving over the wall counts, so a page scroll that slides the photos under a
    // still cursor keeps scrolling the page instead of being taken over by the columns.
    let hovering = false, onScreen = true;
    wall.addEventListener('pointermove', event => {
      if (event.pointerType !== 'touch' && (event.movementX || event.movementY)) hovering = true;
    });
    wall.addEventListener('pointerleave', () => { hovering = false; });
    wall.addEventListener('wheel', event => {
      const c = hovering && columns.find(c => c.column.contains(event.target));
      if (!c) return;
      event.preventDefault();
      c.target += event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? c.column.clientHeight : 1);
    }, { passive: false });

    // Stopped by hovering, the Motion button, reduced motion (galaxy.js folds that into "paused"),
    // a background tab, or the wall being off screen.
    const drifting = () => !hovering && onScreen && !document.hidden &&
      !(window.portfolioGalaxy ? window.portfolioGalaxy.paused : document.body.classList.contains('motion-paused'));
    let last = performance.now();
    const step = now => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      if (onScreen) columns.forEach(c => {
        if (drifting()) c.target += c.direction * c.rate * c.width * dt;
        c.offset += (c.target - c.offset) * Math.min(1, dt * 12);   // ease toward wheel jumps
        const y = ((c.offset % c.loop) + c.loop) % c.loop;
        c.track.style.transform = `translate3d(0, ${-y}px, 0)`;
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    // Photos clipped by the wall never count as on screen for lazy loading, so load them all once the
    // section gets close instead of as they come into view.
    const loadAll = () => wall.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { loadAll(); near.disconnect(); }
      }, { rootMargin: '800px 0px' });
      near.observe(wall);
      new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; }).observe(wall);
    } else {
      loadAll();
    }
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
