// The homepage's experience timeline (built from content/experience.json). Without this script it is a plain list with
// every summary showing. With it, each entry becomes a branch drawn to scale: a bar runs from the entry's start to its
// end (ongoing ones reach Now), and a thin line joins the start of each bar to its entry. On a wide screen the bars stand
// in the middle with entries alternating either side, so two that start together sit apart; on a narrow one the bars
// stand on the left. Clicking an entry opens its summary; open entries and the one hovered stay lit, and every other
// bar dims.
(() => {
  'use strict';
  const root = document.querySelector('[data-timeline]');
  const list = root && root.querySelector('.timeline-list');
  if (!list) return;

  const SVG = 'http://www.w3.org/2000/svg';
  const BAR = 10, REACH = 34, YEARS = 44, SPACING = 18, ANCHOR = 18, WIDE = 760;
  const entries = [...list.children].map(item => ({
    item,
    head: item.querySelector('.timeline-head'),
    more: item.querySelector('.timeline-more'),
    dates: item.querySelector('.timeline-dates'),
    start: Number(item.dataset.start),
    end: item.dataset.end === '' ? null : Number(item.dataset.end),
    open: false,
    hovered: false
  }));
  entries.forEach(entry => { entry.label = entry.dates.textContent; });
  const today = new Date();
  const now = today.getFullYear() + (today.getMonth() + today.getDate() / 31) / 12;
  const until = entry => entry.end ?? now;
  const newestFirst = [...entries].sort((a, b) => b.start - a.start);
  const oldestFirst = [...newestFirst].reverse();

  const lines = document.createElementNS(SVG, 'svg');
  lines.setAttribute('class', 'timeline-lines');
  lines.setAttribute('aria-hidden', 'true');
  const years = document.createElement('div');
  years.className = 'timeline-years';
  years.setAttribute('aria-hidden', 'true');
  root.prepend(lines, years);
  root.classList.add('is-drawn');
  entries.forEach(entry => {
    entry.head.setAttribute('aria-expanded', 'false');
    entry.more.hidden = true;
  });

  const draw = (name, attributes, parent = lines) => {
    const element = document.createElementNS(SVG, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    parent.append(element);
    return element;
  };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (window.portfolioGalaxy ? window.portfolioGalaxy.paused : document.body.classList.contains('motion-paused'));

  // Sides and lanes depend only on the width. Each new branch takes the lane just outside every branch still running on
  // its side, so the line to its entry never crosses another bar. Branches that touch end to start count as running.
  let shape = null;
  function arrange() {
    // Phones get a slimmer year column and shorter lines, so the entries keep room for their text.
    const width = root.clientWidth, wide = width >= WIDE, compact = width < 560;
    const yearColumn = compact ? 30 : YEARS, reach = compact ? 20 : REACH;
    root.classList.toggle('is-compact', compact);
    newestFirst.forEach((entry, i) => { entry.side = wide && i % 2 ? 'left' : 'right'; });
    oldestFirst.forEach((entry, i) => {
      const running = oldestFirst.slice(0, i).filter(other => until(other) >= entry.start).map(other => other.lane);
      entry.lane = !running.length ? 0 : entry.side === 'right' ? Math.max(...running) + 1 : Math.min(...running) - 1;
    });
    const low = Math.min(...entries.map(e => e.lane)), high = Math.max(...entries.map(e => e.lane));
    const stack = (high - low + 1) * BAR;
    const x0 = wide ? Math.round(width / 2 - stack / 2) : yearColumn + 8;
    // The scale runs down from the latest end date: Now, or above it when something is still to come.
    const perYear = wide ? 120 : compact ? 84 : 96, top = 28, latest = Math.max(now, ...entries.map(until));
    shape = { width, low, stack, x0, reach, yearColumn, y: t => top + (latest - t) * perYear };
    const entryWidth = wide ? Math.min(420, x0 - reach - yearColumn - 16) : Math.min(560, width - x0 - stack - reach);
    entries.forEach(entry => {
      entry.item.classList.toggle('is-left', entry.side === 'left');
      entry.item.classList.toggle('is-upcoming', entry.start > now);
      entry.dates.textContent = entry.start > now ? `Incoming ${entry.label}` : entry.label;
      entry.item.style.width = `${entryWidth}px`;
      entry.item.style.left = `${entry.side === 'right' ? x0 + stack + reach : x0 - reach - entryWidth}px`;
    });
    years.textContent = '';
    // Years are marked down the side, except any too close to Now to read.
    const marks = [['Now', now]];
    for (let year = Math.floor(latest); year > Math.min(...entries.map(e => e.start)); year--) {
      if (Math.abs(year - now) * perYear >= 18) marks.push([String(year), year]);
    }
    marks.forEach(([label, t]) => {
      const mark = document.createElement('span');
      mark.textContent = label;
      mark.style.top = `${shape.y(t)}px`;
      years.append(mark);
    });
    shape.marks = marks;
  }

  // Entries sit with their logo level with the start of their bar, pushed down only as far as needed to clear the one
  // above on the same side.
  function targets() {
    const bottom = { left: -Infinity, right: -Infinity };
    return newestFirst.map(entry => {
      const top = Math.max(shape.y(entry.start) - ANCHOR, bottom[entry.side] + SPACING);
      bottom[entry.side] = top + entry.item.offsetHeight - 20;
      return [entry, top];
    });
  }

  function render(tops) {
    const { x0, stack, low, y, width, reach, yearColumn } = shape;
    const height = Math.max(...tops.map(([entry, top]) => top + entry.item.offsetHeight - 20), y(oldestFirst[0].start)) + 24;
    root.style.height = `${height}px`;
    lines.setAttribute('width', width);
    lines.setAttribute('height', height);
    lines.textContent = '';
    shape.marks.forEach(([, t], i) => draw('line', { class: i ? 'timeline-tick' : 'timeline-now', x1: yearColumn - 4, x2: yearColumn + 4, y1: y(t), y2: y(t) }));
    draw('line', { class: 'timeline-now', x1: x0 - 6, x2: x0 + stack + 6, y1: y(now), y2: y(now) });
    tops.forEach(([entry, top]) => {
      entry.item.style.top = `${top}px`;
      const x = x0 + (entry.lane - low) * BAR, from = y(entry.start), anchor = top + ANCHOR;
      // A bar still to come is drawn as an outline.
      entry.bar = draw('rect', { class: `timeline-bar${entry.start > now ? ' is-upcoming' : ''}`, x, y: y(until(entry)), width: BAR, height: from - y(until(entry)), style: `--c:${entry.item.style.getPropertyValue('--c')}` });
      const start = entry.side === 'right' ? x + BAR : x, finish = entry.side === 'right' ? x0 + stack + reach - 6 : x0 - reach + 6;
      const bend = (start + finish) / 2;
      entry.pointer = draw('path', { class: 'timeline-pointer', d: Math.abs(anchor - from) < 1 ? `M${start} ${from}H${finish}` : `M${start} ${from}H${bend}V${anchor}H${finish}` });
    });
    light();
  }

  // Open entries, and the one under the pointer or keyboard, stay lit while every other bar and line dims. With none of
  // them, everything is lit.
  function light() {
    const lit = entries.filter(entry => entry.open || entry.hovered);
    root.classList.toggle('is-focused', lit.length > 0);
    entries.forEach(entry => {
      const on = lit.includes(entry);
      entry.item.classList.toggle('is-lit', on);
      if (entry.bar) entry.bar.classList.toggle('is-lit', on);
      if (entry.pointer) entry.pointer.classList.toggle('is-lit', on);
    });
  }

  // Opening or closing an entry moves the ones below it; they glide there unless motion is off.
  let gliding = 0;
  function layout(animate) {
    const goal = targets();
    cancelAnimationFrame(gliding);
    if (!animate || still()) { render(goal); return; }
    const from = goal.map(([entry]) => parseFloat(entry.item.style.top) || 0);
    const began = performance.now();
    const step = time => {
      const t = Math.min(1, (time - began) / 260), ease = 1 - (1 - t) ** 3;
      render(goal.map(([entry, top], i) => [entry, from[i] + (top - from[i]) * ease]));
      if (t < 1) gliding = requestAnimationFrame(step);
    };
    gliding = requestAnimationFrame(step);
  }

  entries.forEach(entry => {
    entry.item.addEventListener('click', event => {
      if (event.target.closest('a')) return;
      entry.open = !entry.open;
      entry.head.setAttribute('aria-expanded', String(entry.open));
      entry.more.hidden = !entry.open;
      layout(true);
    });
    const hover = on => { entry.hovered = on; light(); };
    entry.item.addEventListener('pointerenter', () => hover(true));
    entry.item.addEventListener('pointerleave', () => hover(false));
    entry.head.addEventListener('focus', () => { if (entry.head.matches(':focus-visible')) hover(true); });
    entry.head.addEventListener('blur', () => hover(false));
  });

  let measured = 0;
  const refresh = () => {
    if (root.clientWidth === measured) return;
    measured = root.clientWidth;
    arrange();
    layout(false);
  };
  refresh();
  if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(root);
  else addEventListener('resize', refresh);
  // Text sizes change once the web font arrives.
  if (document.fonts) document.fonts.ready.then(() => layout(false));
})();
