import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
const number = n => String(n).padStart(2, '0');
const url = project => `/projects/${project.slug}/`;
const paragraphs = values => (values ?? []).map(value => `<p>${escape(value)}</p>`).join('\n');

// How wide a cover is drawn in each place (from projects.css), so the browser can pick the smallest sharp copy.
export const SIZES = {
  wide: '(max-width: 1000px) 86vw, min(1220px, 82vw)',                                  // featured home card, project page
  half: '(max-width: 650px) 86vw, (max-width: 1000px) 43vw, min(595px, 41vw)',          // other home cards
  third: '(max-width: 650px) 86vw, (max-width: 1000px) 43vw, min(387px, 27vw)'          // project index cards
};

// Smaller copies made by tools/make-image-sizes.py sit beside the image as <name>-<width>.avif / .webp.
function sizedCopies(src) {
  const dir = path.posix.dirname(src), stem = path.posix.basename(src).replace(/\.[^.]+$/, '');
  let files = [];
  try { files = readdirSync(path.join(root, '.' + dir)); } catch { return []; }
  const widths = {avif: [], webp: []};
  for (const file of files) {
    const match = file.match(/^(.+)-(\d+)\.(avif|webp)$/);
    if (match && match[1] === stem) widths[match[3]].push(Number(match[2]));
  }
  return ['avif', 'webp'].filter(type => widths[type].length).map(type => ({
    type, srcset: widths[type].sort((a, b) => a - b).map(w => `${dir}/${stem}-${w}.${type} ${w}w`).join(', ')
  }));
}

// These are symbolic illustrations, not photographs, screenshots, or circuit schematics.
function illustration(kind) {
  const pins = Array.from({length:8}, (_,i) => {
    const p = 154+i*16;
    return `<path d="M${p} 70v30m0 120v30M104 ${90+i*20}h36m128 0h36"/>`;
  }).join('');
  const art = {
    chip: `<g>${pins}<rect x="140" y="100" width="128" height="120" rx="5"/><rect x="160" y="120" width="88" height="80" rx="2"/><path d="M176 140h24v40h28m-52-24h48v-16m-8 40v-24"/><path opacity=".4" d="M24 72h65v68h50M302 180h58v76h39M50 274h57v-74h32M269 122h58V40h62"/><g fill="currentColor"><circle cx="24" cy="72" r="3"/><circle cx="399" cy="256" r="3"/><circle cx="50" cy="274" r="3"/><circle cx="389" cy="40" r="3"/></g></g>`,
    landmarks: `<path d="M191 266 133 218 104 180 111 171 144 187 168 208 150 135 145 84 158 80 176 130 187 169 181 104 183 49 198 47 208 100 216 160 219 99 225 62 240 66 238 115 243 172 251 128 266 98 279 104 269 145 268 205 240 244Z"/><path opacity=".35" d="m191 266-23-58 19-39 29-9 27 12 25 33m-81-36 4 97 25-106 24 84 3-72"/><g fill="currentColor">${[[191,266],[133,218],[104,180],[144,187],[168,208],[150,135],[145,84],[176,130],[187,169],[181,104],[183,49],[208,100],[216,160],[219,99],[225,62],[238,115],[243,172],[251,128],[266,98],[269,145],[268,205]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.5"/>`).join('')}</g>`,
    robot: `<g><path d="M80 223h247v-42H104l-24 42Zm41-42 26-56h123l39 56M147 125l25-39h91l27 69M99 215h220M172 86v71h112M147 125l108 48M191 99h55"/><circle cx="132" cy="237" r="29"/><circle cx="282" cy="237" r="29"/><circle cx="132" cy="237" r="13"/><circle cx="282" cy="237" r="13"/><circle cx="245" cy="132" r="25"/><circle cx="245" cy="132" r="11"/><path opacity=".4" d="M50 280h319M55 59h28m-14-14v28M344 98h28m-14-14v28m-50-2 53-32"/></g>`,
    rays: `<g><circle cx="251" cy="174" r="74"/><ellipse cx="251" cy="174" rx="29" ry="74"/><ellipse cx="251" cy="174" rx="74" ry="25"/><path d="M33 68 189 133 248 45M33 68l145 122-5 89M33 68l172 163 115 46"/><circle cx="33" cy="68" r="5"/><path opacity=".35" d="M42 282h341m-326-37h311m-295-37h270M135 293l21-98m211 98-40-98"/></g>`,
    community: `<g><path d="M209 263V134m0 0c-47-21-96-22-145-8v133c49-14 98-13 145 8 47-21 96-22 145-8V126c-49-14-98-13-145 8Z"/><path opacity=".5" d="M88 153c34-6 66-4 97 8m-97 17c34-6 66-4 97 8m-97 17c34-6 66-4 97 8m49-50c31-12 63-14 97-8m-97 33c31-12 63-14 97-8m-97 33c31-12 63-14 97-8"/><path d="M208 99c-18-12-38-28-38-42 0-21 28-24 38-6 10-18 38-15 38 6 0 14-20 30-38 42Z"/><path opacity=".4" d="M99 60h20m-10-10v20M297 79h20m-10-10v20"/></g>`
  };
  return `<svg class="work-illustration" viewBox="0 0 420 320" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${art[kind] ?? art.chip}</svg>`;
}

export function artwork(project, {detail=false, sizes=SIZES.third}={}) {
  if (project.cover) {
    // An optional cover.position (a CSS object-position) chooses which part stays visible when a card crops the image.
    const focus = project.cover.position ? ` style="object-position:${escape(project.cover.position)}"` : '';
    const img = `<img src="${escape(project.cover.src)}" alt="${escape(project.cover.alt)}"${focus} ${detail ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
    const sources = sizedCopies(project.cover.src).map(s => `<source type="image/${s.type}" srcset="${escape(s.srcset)}" sizes="${sizes}">`).join('');
    return `<span class="project-art photo-art">${sources ? `<picture>${sources}${img}</picture>` : img}</span>`;
  }
  return `<span class="project-art work-art art-${escape(project.art)}"><span class="art-topline"><span>${escape(project.title)}</span><span aria-hidden="true">${detail ? 'PROJECT NOTES' : 'EXPLORE ↗'}</span></span><span class="work-art-title">${project.artTitle.split('\n').map(escape).join('<br>')}</span>${illustration(project.art)}<span class="art-bottomline">${escape(project.artLabel)}</span></span>`;
}

export function card(project, index, featured=false, sizes=SIZES.third) {
  return `<a class="project-card${featured ? ' wide-project featured-project' : ''}" href="${url(project)}" aria-label="Explore ${escape(project.title)}">${artwork(project,{sizes})}<span class="project-info"><span class="project-number">${number(index+1)}</span><span class="project-description"><strong>${escape(project.title)}</strong><span>${escape(project.summary)}</span></span><span class="project-type">${escape(project.category)}</span><span class="card-arrow" aria-hidden="true">↗</span></span></a>`;
}

// Gallery items ending in .mp4 or .webm play as videos; an optional "poster" is the still shown before playing.
const isVideo = src => /\.(mp4|webm)$/i.test(src ?? '');
function media(image) {
  if (isVideo(image.src)) return `<video controls playsinline preload="metadata"${image.poster ? ` poster="${escape(image.poster)}"` : ''} aria-label="${escape(image.alt)}"><source src="${escape(image.src)}" type="video/${image.src.split('.').pop().toLowerCase()}"></video>`;
  return `<a href="${escape(image.src)}" target="_blank" rel="noopener" aria-label="Open image: ${escape(image.alt)}"><img src="${escape(image.src)}" alt="${escape(image.alt)}" loading="lazy" decoding="async"></a>`;
}

export function gallery(images=[], heading=true) {
  if (!images.length) return '';
  const items=images.map((image,i) => `<figure class="gallery-item${image.wide || (images.length%2 && i===0) ? ' gallery-wide' : ''}">${media(image)}${image.caption ? `<figcaption>${escape(image.caption)}</figcaption>` : ''}</figure>`).join('\n');
  const grid=`<div class="project-gallery">${items}</div>`;
  return heading ? `<section id="gallery" class="case-section"><p class="eyebrow">03 / IN PICTURES</p><h2>A closer look</h2>${grid}</section>` : grid;
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_,key) => {
    if (!(key in values)) throw new Error(`Missing template value: ${key}`);
    return values[key];
  }).replace(/[\t ]+$/gm, '');
}

export async function validate(data, assetRoot=root) {
  const seen=new Set();
  if (!Array.isArray(data.projects) || !data.projects.length) throw new Error('At least one project is required.');
  for (const project of data.projects) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug) || seen.has(project.slug)) throw new Error(`Invalid or duplicate project slug: ${project.slug}`);
    seen.add(project.slug);
    for (const key of ['title','subtitle','category','year','role','status','summary','art','artTitle','artLabel']) {
      if (!project[key]) throw new Error(`${project.slug}: missing ${key}`);
    }
    for (const link of project.links ?? []) {
      if (!link.label || !/^https:\/\//.test(link.url)) throw new Error(`${project.slug}: links need a label and an HTTPS URL.`);
    }
    for (const image of [project.cover,...(project.images ?? []),...(project.sections ?? []).flatMap(s=>s.images ?? [])].filter(Boolean)) {
      if (!image.alt?.trim()) throw new Error(`${project.slug}: images need alt text and a /assets/ path.`);
      for (const src of [image.src, ...(image.poster ? [image.poster] : [])]) {
        if (!src?.startsWith('/assets/')) throw new Error(`${project.slug}: images need alt text and a /assets/ path.`);
        const file=path.resolve(assetRoot, '.'+src);
        if (!file.startsWith(path.resolve(assetRoot,'assets')+path.sep)) throw new Error('Image path must stay inside assets/.');
        await access(file).catch(()=>{throw new Error(`Image not found: ${src}`);});
      }
    }
    if (isVideo(project.cover?.src)) throw new Error(`${project.slug}: the cover must be an image; put videos in a gallery.`);
  }
  if (!Array.isArray(data.featured) || data.featured.length!==3 || new Set(data.featured).size!==3 || data.featured.some(slug=>!seen.has(slug))) throw new Error('Choose exactly three distinct existing projects for the homepage.');
}

export async function build() {
  const data=JSON.parse(await readFile(path.join(root,'content/projects.json'),'utf8'));
  await validate(data);
  const count=number(data.projects.length);
  const header=`<header class="site-header"><a class="wordmark" href="/" aria-label="Lucas Wu, home">Lucas Wu</a><nav aria-label="Main navigation"><a href="/#projects">Projects <span class="nav-count">${count}</span></a><a href="/#about">About</a><a href="/#contact">Resume</a></nav><button class="motion-button" id="motion-toggle" aria-pressed="false" aria-label="Pause animation"><span class="pause-symbol" aria-hidden="true"><svg class="icon-pause" viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg><svg class="icon-play" viewBox="0 0 16 16"><path d="M5.5 3.5 12.5 8l-7 4.5z"/></svg></span><span class="motion-text">Motion on</span></button></header>`;
  const footer=`<footer class="site-footer section-shell"><a class="wordmark" href="/">Lucas Wu</a><a class="footer-email" href="mailto:lucaswu2018@gmail.com">lucaswu2018@gmail.com</a><span class="coordinate">© <span data-current-year>2026</span> LUCAS WU</span><a class="back-top" href="#main">Back to top ↑</a></footer>`;
  const projectTemplate=await readFile(path.join(root,'templates/project.html'),'utf8');
  const indexTemplate=await readFile(path.join(root,'templates/projects.html'),'utf8');
  const shared={header,footer,count};
  await mkdir(path.join(root,'projects'),{recursive:true});
  await writeFile(path.join(root,'projects/index.html'),fill(indexTemplate,{...shared,cards:data.projects.map((p,i)=>card(p,i)).join('\n')}));
  for (const [i,project] of data.projects.entries()) {
    const next=data.projects[(i+1)%data.projects.length];
    const links=(project.links ?? []).map(link=>`<a class="outline-link" href="${escape(link.url)}" target="_blank" rel="noopener">${escape(link.label)} <span aria-hidden="true">↗</span></a>`).join('');
    const values={...shared,...Object.fromEntries(['slug','title','subtitle','role','year','status'].map(key=>[key,escape(project[key])])),
      description:escape(project.summary),
      links:links ? `<div class="project-links">${links}</div>` : '',
      tags:(project.tags ?? []).map(tag=>`<li>${escape(tag)}</li>`).join(''),
      cover:artwork(project,{detail:true,sizes:SIZES.wide})+`<figcaption>${escape(project.cover?.caption ?? (project.cover ? '' : 'Project illustration'))}</figcaption>`,
      highlights:project.highlights?.length ? `<dl class="project-highlights">${project.highlights.map(h=>`<div><dt>${escape(h.label)}</dt><dd>${escape(h.value)}</dd></div>`).join('')}</dl>` : '',
      overview:paragraphs(project.overview),
      sections:(project.sections ?? []).map(section=>`<div class="work-section"><h3>${escape(section.title)}</h3>${paragraphs(section.body)}${section.bullets?.length ? `<ul>${section.bullets.map(b=>`<li>${escape(b)}</li>`).join('')}</ul>` : ''}${gallery(section.images,false)}</div>`).join('\n'),
      gallery:gallery(project.images),
      galleryLink:project.images?.length ? '<a href="#gallery">03 / In pictures</a>' : '',
      outcomeNumber:project.images?.length ? '04' : '03',
      outcome:paragraphs(project.outcome),nextUrl:url(next),nextTitle:escape(next.title)
    };
    await mkdir(path.join(root,'projects',project.slug),{recursive:true});
    await writeFile(path.join(root,'projects',project.slug,'index.html'),fill(projectTemplate,values));
  }
  const homeFile=path.join(root,'index.html');
  let home=await readFile(homeFile,'utf8');
  const start='<!-- featured-projects:start -->',end='<!-- featured-projects:end -->';
  const startAt=home.indexOf(start),endAt=home.indexOf(end);
  if (startAt<0 || endAt<startAt) throw new Error('Homepage featured-project markers are missing.');
  const cards=data.featured.map((slug,i)=>card(data.projects.find(p=>p.slug===slug),i,i===0,i===0?SIZES.wide:SIZES.half)).join('\n');
  home=home.slice(0,startAt+start.length)+'\n'+cards+'\n'+home.slice(endAt);
  home=home.replace(/(<span class="nav-count">)\d+(<\/span>)/,(_,before,after)=>before+count+after);
  await writeFile(homeFile,home);
  console.log(`Built ${data.projects.length} project pages, the project index, and 3 homepage previews.`);
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await build();
}
