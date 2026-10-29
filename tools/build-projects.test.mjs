import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gallery, artwork, card, homeCards, moreProjects, validate, rich, toneMarks, stamp, assetVersions, ASSETS, SIZES } from './build-projects.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=JSON.parse(await readFile(path.join(root,'content/projects.json'),'utf8'));
const pages=['index.html','projects/index.html',...data.projects.map(p=>`projects/${p.slug}/index.html`)];
const fixture={src:'/assets/photo.jpg',alt:'A robot & its "intake"',caption:'A <test> caption'};

test('galleries support zero, one, even, and odd image counts',()=>{
  assert.equal(gallery([]),'');
  for (const count of [1,2,3,5,8]) {
    const html=gallery(Array.from({length:count},()=>fixture));
    assert.equal((html.match(/<figure /g) ?? []).length,count);
    assert.equal((html.match(/gallery-wide/g) ?? []).length,count%2);
    assert.equal((html.match(/loading="lazy"/g) ?? []).length,count);
    assert.ok(html.includes('A robot &amp; its &quot;intake&quot;'));
    assert.ok(html.includes('A &lt;test&gt; caption'));
  }
  assert.equal((gallery([{...fixture,wide:true},fixture]).match(/gallery-wide/g) ?? []).length,1);
  assert.ok(!gallery([fixture],false).includes('id="gallery"'));
});

test('gallery videos play inline with their poster instead of linking out',()=>{
  const html=gallery([{src:'/assets/clip.mp4',poster:'/assets/clip.webp',alt:'A catapult & its "launch"',caption:'A launch'}]);
  assert.ok(html.includes('<video controls playsinline muted'));
  assert.ok(html.includes('poster="/assets/clip.webp"'));
  assert.ok(html.includes('<source src="/assets/clip.mp4" type="video/mp4">'));
  assert.ok(html.includes('aria-label="A catapult &amp; its &quot;launch&quot;"'));
  assert.ok(!html.includes('<a '));
});

test('==phrase== in write-up text becomes a highlight, and everything else stays escaped',()=>{
  assert.equal(rich('Built a ==ray & sphere== test'),'Built a <mark>ray &amp; sphere</mark> test');
  assert.equal(rich('Two ==marks== in ==one== line'),'Two <mark>marks</mark> in <mark>one</mark> line');
  assert.equal(rich('No <mark> here'),'No &lt;mark&gt; here');
});

test('a real cover replaces the illustration and preserves its description',()=>{
  const html=artwork({...data.projects[0],cover:fixture},{detail:true});
  assert.ok(html.includes('<img'));
  assert.ok(html.includes('fetchpriority="high"'));
  assert.ok(html.includes('A robot &amp; its &quot;intake&quot;'));
  assert.ok(!html.includes('<svg'));
});

test('covers with sized copies list them for the browser to choose from',()=>{
  const spi=data.projects.find(p=>p.slug==='uwasic');
  const html=card(spi,0,true,SIZES.wide);
  assert.ok(html.includes('<picture><source type="image/avif" srcset="/assets/projects/spi-pwm-peripheral/gds-layout-600.avif 600w'));
  assert.ok(html.includes('<source type="image/webp" srcset="/assets/projects/spi-pwm-peripheral/gds-layout-600.webp 600w, /assets/projects/spi-pwm-peripheral/gds-layout-1200.webp 1200w, /assets/projects/spi-pwm-peripheral/gds-layout-2400.webp 2400w"'));
  assert.ok(html.includes(`sizes="${SIZES.wide}"`));
  assert.ok(html.includes('<img src="/assets/projects/spi-pwm-peripheral/gds-layout.webp"'));
  assert.ok(!artwork({...spi,cover:fixture}).includes('<picture>'),'images without copies stay a plain <img>');
});

test('content validation catches duplicate pages, invalid image paths, and missing photos',async()=>{
  await validate(data);
  const duplicate=structuredClone(data);
  duplicate.projects[1].slug=duplicate.projects[0].slug;
  await assert.rejects(validate(duplicate),/duplicate/);
  const invalid=structuredClone(data);
  invalid.projects[0].images=[{src:'/assets/../../outside.jpg',alt:'Photo'}];
  await assert.rejects(validate(invalid),/inside assets/);
  invalid.projects[0].images=[{src:'/assets/missing-photo.jpg',alt:'Photo'}];
  await assert.rejects(validate(invalid),/Image not found/);
  invalid.projects[0].images=[{src:'/assets/photo.jpg',alt:''}];
  await assert.rejects(validate(invalid),/alt text/);
  invalid.projects[0].images=[{src:'/assets/land.geojson',poster:'/assets/missing-poster.webp',alt:'Clip'}];
  await assert.rejects(validate(invalid),/Image not found: \/assets\/missing-poster/);
  const videoCover=structuredClone(data);
  videoCover.projects[0].cover={src:'/assets/projects/vex-robotics/catapult-launch.mp4',alt:'Clip'};
  await assert.rejects(validate(videoCover),/cover must be an image/);
});

test('every generated page and homepage has working local navigation and assets',async()=>{
  const files=['index.html','projects/index.html',...data.projects.map(p=>`projects/${p.slug}/index.html`)];
  for (const file of files) {
    const html=await readFile(path.join(root,file),'utf8');
    assert.equal((html.match(/<h1[ >]/g) ?? []).length,1,`${file}: one main heading`);
    assert.ok(!html.includes('{{'),`${file}: no unresolved templates`);
    assert.ok(!html.includes('=='),`${file}: every ==highlight== was converted`);
    assert.ok(!html.includes('<dialog'),`${file}: project links replace popups`);
    const srcsets=[...html.matchAll(/srcset="([^"]+)"/g)].flatMap(m=>m[1].split(',').map(c=>c.trim().split(/\s+/)[0]));
    for (const link of [...[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]),...srcsets]) {
      if (/^(?:https?:|mailto:|data:)/.test(link)) continue;
      const parsed=new URL(link,'https://local.test/'+file);
      let target=path.join(root,decodeURIComponent(parsed.pathname));
      if ((await stat(target)).isDirectory()) target=path.join(target,'index.html');
      await stat(target);
      if (parsed.hash) {
        const dest=await readFile(target,'utf8');
        assert.ok(dest.includes(`id="${decodeURIComponent(parsed.hash.slice(1))}"`),`${file}: missing anchor ${link}`);
      }
    }
  }
});

test('home shows the featured previews in order, wide first only when the count is odd; index contains every project',async()=>{
  const home=await readFile(path.join(root,'index.html'),'utf8');
  const index=await readFile(path.join(root,'projects/index.html'),'utf8');
  const cards=[...home.matchAll(/<a class="project-card([^"]*)" href="([^"]+)"/g)];
  assert.equal(cards.length,data.featured.length);
  assert.deepEqual(cards.map(card=>card[2]),data.featured.map(slug=>`/projects/${slug}/`));
  assert.equal(cards.filter(card=>card[1].includes('wide-project')).length,data.featured.length%2);
  const pick=n=>data.projects.slice(0,n);
  for (const n of [1,2,3,4,5]) {
    const html=homeCards(pick(n));
    assert.equal((html.match(/wide-project/g) ?? []).length,n%2,`${n} previews`);
    if (n%2) assert.ok(html.startsWith('<a class="project-card wide-project'));
  }
  for (const p of data.projects) assert.ok(index.includes(`aria-label="Explore ${p.title}"`));
});

test('a full-width "View more projects" button sits under the previews only when some are hidden',async()=>{
  const home=await readFile(path.join(root,'index.html'),'utf8');
  const row=home.slice(home.indexOf('<!-- more-projects:start -->'),home.indexOf('<!-- more-projects:end -->'));
  assert.ok(row.includes('<a class="more-projects reveal" href="/projects/">View more projects'));
  assert.ok(!row.includes('<li>'));
  assert.equal((home.match(new RegExp(`View all ${data.projects.length} projects`,'g')) ?? []).length,1);
  assert.equal(moreProjects(data.projects,data.projects),'');
  assert.ok(moreProjects(data.projects,data.projects.slice(1)).includes('View more projects'));
});

test('highlights get rotating tones, and punctuation right after a highlight joins it',()=>{
  const html=toneMarks('<p>a <mark>one</mark>. b <mark class="nowrap">two</mark> c <mark data-tone="5">three</mark>!</p>');
  assert.equal(html,'<p>a <mark data-tone="0">one.</mark> b <mark class="nowrap" data-tone="1">two</mark> c <mark data-tone="2">three!</mark></p>');
  assert.equal(toneMarks(html),html,'running it again changes nothing');
  assert.equal(toneMarks('<mark class="before-punctuation">UWASIC</mark>’s team, <mark>fast</mark>, <mark>“done”</mark>.)'),
    '<mark data-tone="0">UWASIC</mark>’s team, <mark data-tone="1">fast,</mark> <mark data-tone="2">“done”.)</mark>','a possessive stays outside; old classes go');
});

test('?v= stamps follow file contents, and every page links the current version of each file',async()=>{
  assert.equal(stamp('<link href="/styles.css?v=old"><script src="app.js?v=1"></script><img src="x.png?v=2">',{'styles.css':'abc','app.js':'def'}),
    '<link href="/styles.css?v=abc"><script src="app.js?v=def"></script><img src="x.png?v=2">');
  const versions=await assetVersions();
  for (const file of pages) {
    const html=await readFile(path.join(root,file),'utf8');
    for (const [, name, version] of html.matchAll(/\b([\w-]+\.(?:css|js))\?v=(\w+)/g)) {
      assert.ok(ASSETS.includes(name),`${file}: ${name} is stamped by the build`);
      assert.equal(version,versions[name],`${file}: ${name} is out of date; run node tools/build-projects.mjs`);
    }
  }
});

test('every page has the favicon and complete link-preview tags pointing at real images',async()=>{
  const site='https://'+(await readFile(path.join(root,'CNAME'),'utf8')).trim();
  for (const file of pages) {
    const html=await readFile(path.join(root,file),'utf8');
    assert.ok(html.includes('<link rel="icon" href="/favicon.ico"') && html.includes('href="/assets/favicon.svg"') && html.includes('rel="apple-touch-icon"'),`${file}: favicon links`);
    const meta=Object.fromEntries([...html.matchAll(/<meta (?:property|name)="((?:og|twitter):[\w:]+)" content="([^"]*)">/g)].map(m=>[m[1],m[2]]));
    for (const key of ['og:type','og:url','og:title','og:description','og:image','og:image:alt','twitter:card']) assert.ok(meta[key],`${file}: ${key}`);
    assert.equal(meta['og:url'],site+'/'+file.replace(/index\.html$/,''),`${file}: og:url is this page`);
    assert.ok(meta['og:image'].startsWith(site+'/'),`${file}: og:image is an absolute link on this site`);
    await stat(path.join(root,'.'+meta['og:image'].slice(site.length)));
  }
});

test('no CSS rule block is defined twice in the same place',async()=>{
  for (const file of ['styles.css','projects.css']) {
    const css=(await readFile(path.join(root,file),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'');
    const seen=new Set(), stack=[];
    let selector='';
    for (const ch of css) {
      if (ch==='{') {
        const name=selector.trim().replace(/\s+/g,' ');
        if (!name.startsWith('@')) {
          const key=[...stack,name].join(' | ');
          assert.ok(!seen.has(key),`${file}: "${name}" is defined twice${stack.length?` inside ${stack.join(' ')}`:''}; merge them`);
          seen.add(key);
        }
        stack.push(name); selector='';
      } else if (ch==='}') { stack.pop(); selector=''; }
      else if (ch===';' && !stack.length) selector='';
      else selector+=ch;
    }
  }
});
