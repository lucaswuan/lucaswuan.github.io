import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gallery, artwork, card, validate, SIZES } from './build-projects.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=JSON.parse(await readFile(path.join(root,'content/projects.json'),'utf8'));
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

test('a real cover replaces the illustration and preserves its description',()=>{
  const html=artwork({...data.projects[0],cover:fixture},{detail:true});
  assert.ok(html.includes('<img'));
  assert.ok(html.includes('fetchpriority="high"'));
  assert.ok(html.includes('A robot &amp; its &quot;intake&quot;'));
  assert.ok(!html.includes('<svg'));
});

test('covers with sized copies list them for the browser to choose from',()=>{
  const uwasic=data.projects.find(p=>p.slug==='uwasic');
  const html=card(uwasic,0,true,SIZES.wide);
  assert.ok(html.includes('<picture><source type="image/avif" srcset="/assets/projects/uwasic/gds-layout-600.avif 600w'));
  assert.ok(html.includes('<source type="image/webp" srcset="/assets/projects/uwasic/gds-layout-600.webp 600w, /assets/projects/uwasic/gds-layout-1200.webp 1200w, /assets/projects/uwasic/gds-layout-2400.webp 2400w"'));
  assert.ok(html.includes(`sizes="${SIZES.wide}"`));
  assert.ok(html.includes('<img src="/assets/projects/uwasic/gds-layout.webp"'));
  assert.ok(!artwork({...uwasic,cover:fixture}).includes('<picture>'),'images without copies stay a plain <img>');
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

test('home has three real project links, with one featured first; index contains every project',async()=>{
  const home=await readFile(path.join(root,'index.html'),'utf8');
  const index=await readFile(path.join(root,'projects/index.html'),'utf8');
  const cards=[...home.matchAll(/<a class="project-card([^"]*)" href="([^"]+)"/g)];
  assert.equal(cards.length,3);
  assert.ok(cards[0][1].includes('wide-project'));
  assert.ok(cards.slice(1).every(card=>!card[1].includes('wide-project')));
  assert.deepEqual(cards.map(card=>card[2]),data.featured.map(slug=>`/projects/${slug}/`));
  for (const p of data.projects) assert.ok(index.includes(`aria-label="Explore ${p.title}"`));
});
