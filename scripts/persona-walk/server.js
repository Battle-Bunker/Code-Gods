// Screen-only browser harness server. See README.txt.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const SITE = process.env.SITE || 'http://127.0.0.1:3211';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('port', 4700), USER = arg('user', 'alice'), OUT = path.resolve(arg('dir', './out-' + PORT));
const [VW, VH] = arg('viewport', '1440x900').split('x').map(Number);
const MOBILE = VW < 600;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser, context, page, t0 = 0, shotN = 0, lastItems = [], notes = [];
const friends = [];

async function signIn(ctx, who) {
  const p = await ctx.newPage();
  await p.goto(SITE + '/');
  await p.getByTestId('button-login').waitFor({ timeout: 60000 });
  const url = await p.evaluate(async () => {
    const r = await fetch('/api/auth/sign-in/oauth2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'fake', callbackURL: '/' }) });
    return (await r.json()).url;
  });
  await p.goto(url);
  await p.getByRole('link', { name: new RegExp(`\\(${who}\\)`) }).click();
  await p.waitForURL(SITE + '/');
  await p.getByTestId('button-avatar').waitFor({ timeout: 60000 });
  return p;
}

// Runs in the page: what is visible in the viewport, as items with rects.
function scan() {
  const vw = innerWidth, vh = innerHeight;
  document.querySelectorAll('[data-walk]').forEach(e => e.removeAttribute('data-walk'));
  const INTER = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[role=slider],[contenteditable=""],[contenteditable=true],.cm-editor,.monaco-editor,[onclick]';
  const inView = r => r.width > 0 && r.height > 0 && r.bottom > 1 && r.right > 1 && r.top < vh - 1 && r.left < vw - 1;
  const onTop = (el, r) => {
    const pts = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3]];
    for (const [x0, y0] of pts) {
      const x = Math.min(Math.max(x0, 1), vw - 2), y = Math.min(Math.max(y0, 1), vh - 2);
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return true;
    }
    return getComputedStyle(el).pointerEvents === 'none' && !document.querySelector('[role=dialog],[aria-modal=true]');
  };
  const visible = el => { try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); } catch { return true; } };
  const interOf = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.matches(INTER)) { const ed = e.closest('.cm-editor,.monaco-editor'); return ed || e; }
      const cs = getComputedStyle(e);
      if (cs.cursor === 'pointer' && (!e.parentElement || getComputedStyle(e.parentElement).cursor !== 'pointer')) return e;
    }
    return null;
  };
  const items = [], map = new Map();
  const kindOf = el => {
    const t = el.tagName.toLowerCase(), role = el.getAttribute('role');
    if (el.matches('.cm-editor,.monaco-editor')) return 'code-editor';
    if (t === 'a') return 'link';
    if (t === 'input') return 'input' + (el.type && el.type !== 'text' ? ' type=' + el.type : '');
    if (t === 'textarea' || t === 'select' || t === 'button') return t;
    if (el.isContentEditable) return 'editable';
    return role || 'clickable';
  };
  const add = el => {
    if (map.has(el)) return map.get(el);
    const r = el.getBoundingClientRect();
    if (!inView(r) || !visible(el) || !onTop(el, r)) { map.set(el, null); return null; }
    const it = { inter: true, kind: kindOf(el), x: r.left, y: r.top, w: r.width, h: r.height, texts: [], el };
    const a = [];
    const t = el.tagName.toLowerCase();
    if (el.placeholder) a.push(`placeholder="${el.placeholder}"`);
    if (t === 'input' && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(el.type)) a.push(`value="${el.type === 'password' ? '*'.repeat(el.value.length) : el.value}"`);
    if (t === 'input' && ['checkbox', 'radio'].includes(el.type)) a.push(el.checked ? 'checked' : 'unchecked');
    if (t === 'select') a.push(`selected="${el.selectedOptions[0] ? el.selectedOptions[0].text : ''}" options="${[...el.options].map(o => o.text).join(' / ').slice(0, 200)}"`);
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') a.push('disabled');
    for (const k of ['aria-checked', 'aria-pressed', 'aria-selected', 'aria-expanded']) { const v = el.getAttribute(k); if (v === 'true') a.push(k.slice(5)); else if (v === 'false' && k !== 'aria-selected' && k !== 'aria-expanded') a.push('not-' + k.slice(5)); }
    if (document.activeElement === el || (el.contains(document.activeElement) && it.kind === 'code-editor')) a.push('focused');
    it.attrs = a;
    if (t === 'textarea') it.block = el.value;
    else if (it.kind === 'code-editor') {
      const lines = [...el.querySelectorAll('.cm-line,.view-line')].filter(l => inView(l.getBoundingClientRect()));
      it.block = lines.map(l => l.textContent).join('\n'); it.noText = true;
    } else if (it.kind === 'editable') { it.block = el.innerText; it.noText = true; }
    it.fallback = el.getAttribute('aria-label') || el.title || (el.querySelector('img[alt]') || {}).alt || (el.querySelector('svg title') || {}).textContent || '';
    items.push(it); map.set(el, it); return it;
  };
  document.querySelectorAll(INTER).forEach(el => { const i = interOf(el); if (i) add(i); });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange(); let lastH = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const pe = n.parentElement;
    if (!pe || pe.closest('script,style,noscript,template,title,option') || !visible(pe)) continue;
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(inView);
    if (!rects.length) continue;
    const r = rects[0];
    const cs = getComputedStyle(pe);
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || (r.width <= 2 && r.height <= 2)) continue; // sr-only
    const ie = interOf(pe);
    if (ie) {
      const it = add(ie);
      if (it && !it.noText && ie.tagName !== 'TEXTAREA') it.texts.push(s);
      if (it || ie.matches('.cm-editor,.monaco-editor,textarea') || ie.isContentEditable) continue;
    }
    if (!onTop(pe, r)) continue;
    const h = pe.closest('h1,h2,h3'), first = h && h !== lastH; if (h) lastH = h;
    items.push({ x: r.left, y: r.top, w: r.width, h: r.height, text: (first ? '#'.repeat(+h.tagName[1]) + ' ' : '') + s });
  }
  document.querySelectorAll('canvas,img,svg,video,iframe').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!inView(r) || !visible(el) || r.width < 60 || r.height < 60) return;
    const t = el.tagName.toLowerCase();
    if (t === 'svg' && el.querySelector('text')) { /* its text is listed too */ }
    items.push({ x: r.left, y: r.top, w: r.width, h: Math.min(r.height, 20), text: `{${t}${el.alt ? ' "' + el.alt + '"' : ''} ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}: Read the PNG}` });
  });
  // number interactive items in reading order
  const inter = items.filter(i => i.inter).sort((a, b) => (Math.abs(a.y - b.y) < 8 ? a.x - b.x : a.y - b.y));
  inter.forEach((it, i) => { it.local = i + 1; it.el.setAttribute('data-walk', String(i + 1)); delete it.el; });
  const se = document.scrollingElement;
  return { items, vw, vh, scrollY: Math.round(se.scrollTop), scrollMax: Math.round(se.scrollHeight - se.clientHeight), title: document.title };
}

function render(res) {
  const items = res.items.map(it => {
    if (!it.inter) return it;
    let label = [...new Set(it.texts)].join(' ').trim() || it.fallback || '';
    const head = `[${it.n} ${it.kind}${it.attrs.length ? ' ' + it.attrs.join(' ') : ''}]`;
    let text = head + (label ? ' ' + label : '');
    if (it.block != null) {
      const ls = it.block.split('\n');
      text += ls.length <= 1 && it.block.length < 80 ? ` value="${it.block}"` : '\n' + ls.slice(0, 60).map(l => '    | ' + l).join('\n') + (ls.length > 60 ? `\n    | ... (${ls.length - 60} more lines)` : '');
    }
    return { ...it, text };
  }).map(({ frame, ...r }) => r).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of items) {
    const cy = it.y + Math.min(it.h, 40) / 2;
    const row = rows.find(r => cy >= r.top && cy <= r.bottom && !r.multi && !it.text.includes('\n'));
    if (row) row.items.push(it);
    else rows.push({ top: it.y, bottom: it.y + Math.min(it.h, 40), items: [it], multi: it.text.includes('\n') });
  }
  const lines = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let s = '', end = null;
    for (const it of r.items) { s += end == null ? '' : (it.x - end > 28 ? '   |   ' : ' '); s += it.text; end = it.x + it.w; }
    for (const l of s.split('\n')) lines.push(l.length > 400 ? l.slice(0, 400) + '…' : l);
  }
  if (lines.length > 150) { const extra = lines.length - 150; lines.length = 150; lines.push(`... (${extra} more lines not listed: Read the PNG or scroll)`); }
  lastItems = res.items.filter(i => i.inter).map(i => ({ n: i.n, x: i.x + i.w / 2, y: i.y + i.h / 2, kind: i.kind, frame: i.frame, local: i.local }));
  return lines.join('\n');
}

async function look() {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const file = path.join(OUT, String(++shotN).padStart(3, '0') + '.png');
  let res;
  for (let i = 0; i < 3; i++) { try { res = await page.evaluate(scan); break; } catch (e) { await sleep(400); if (i === 2) throw e; } }
  res.items.forEach(it => { it.frame = page.mainFrame(); });
  for (const f of page.frames()) {
    if (f === page.mainFrame() || f.isDetached()) continue;
    try {
      const box = await (await f.frameElement()).boundingBox();
      if (!box) continue;
      let ox = box.x, oy = box.y;
      const sub = await Promise.race([f.evaluate(scan), sleep(3000).then(() => null)]);
      if (!sub) continue;
      for (const it of sub.items) {
        it.x += ox; it.y += oy; it.frame = f;
        if (it.y + it.h > Math.max(box.y, 0) && it.y < Math.min(box.y + box.height, res.vh) && it.x + it.w > Math.max(box.x, 0) && it.x < Math.min(box.x + box.width, res.vw)) res.items.push(it);
      }
    } catch (e) { /* frame went away */ }
  }
  res.items.filter(i => i.inter).sort((a, b) => (Math.abs(a.y - b.y) < 8 ? a.x - b.x : a.y - b.y)).forEach((it, i) => { it.n = i + 1; });
  await page.screenshot({ path: file, scale: 'css', animations: 'disabled', caret: 'initial' }).catch(e => notes.push('screenshot failed: ' + e.message));
  const u = new URL(page.url());
  const head = `shot: ${file}\nclock: ${((Date.now() - t0) / 1000).toFixed(1)}s   url: ${u.origin === SITE ? '' : u.origin}${u.pathname}${u.search}${u.hash}   title: ${res.title}   viewport: ${res.vw}x${res.vh}   page-scroll: ${res.scrollY}/${Math.max(res.scrollMax, 0)}`;
  const n = notes.splice(0).map(x => 'NOTE: ' + x).join('\n');
  return head + '\n' + (n ? n + '\n' : '') + '--- visible screen ---\n' + render(res);
}

function target(n) {
  const it = lastItems.find(i => i.n === +n);
  if (!it) throw new Error(`no element ${n} in the last look (1..${lastItems.length})`);
  return it;
}
async function clickXY(x, y) { if (MOBILE) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
async function clickN(n) {
  const it = target(n);
  const loc = it.frame.locator(`[data-walk="${it.local}"]`);
  if (await loc.count() === 1) {
    try { if (MOBILE) await loc.tap({ timeout: 3000 }); else await loc.click({ timeout: 3000 }); return; } catch (e) { /* fall back to coordinates */ }
  }
  await clickXY(it.x, it.y);
}

async function run(cmd, args, text) {
  const settle = async (ms = 600) => { await sleep(ms); return look(); };
  switch (cmd) {
    case 'look': return look();
    case 'click': await clickN(args[0]); return settle();
    case 'clickxy': await clickXY(+args[0], +args[1]); return settle();
    case 'type': await clickN(args[0]); await page.keyboard.type(text, { delay: 5 }); return settle();
    case 'fill': {
      const it = target(args[0]);
      const loc = it.frame.locator(`[data-walk="${it.local}"]`);
      if (it.kind === 'select') await loc.selectOption({ label: text }, { timeout: 5000 });
      else if (/^(input|textarea)/.test(it.kind) && await loc.count() === 1) await loc.fill(text);
      else { await clickN(args[0]); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await page.keyboard.insertText(text); }
      return settle();
    }
    case 'key': await page.keyboard.press(args[0]); return settle();
    case 'scroll': case 'scrollat': {
      let x = VW / 2, y = VH / 2, dy;
      if (cmd === 'scrollat') { x = +args[0]; y = +args[1]; dy = +args[2]; }
      else dy = (args[0] === 'up' ? -1 : 1) * (+args[1] || Math.round(VH * 0.7));
      await page.mouse.move(x, y); await page.mouse.wheel(0, dy); return settle();
    }
    case 'wait': await sleep(Math.min(Math.max(+args[0] || 1, 0), 30) * 1000); return look();
    case 'back': {
      const pages = context.pages();
      if (pages.length > 1 && page === pages[pages.length - 1] && !(await page.goBack({ timeout: 5000 }).catch(() => null))) { await page.close(); page = context.pages().slice(-1)[0]; notes.push('closed the extra tab'); }
      else if (pages.length <= 1) await page.goBack({ timeout: 10000 }).catch(() => {});
      return settle();
    }
    case 'friends': {
      const code = args[0], names = args.length > 1 ? args.slice(1) : ['bob', 'carol'], out = [];
      for (const who of names) {
        try {
          const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          const p = await signIn(ctx, who);
          // The invite link: the room's page offers "Join this room" to a signed-in visitor.
          await p.goto(`${SITE}/rooms/${code}`);
          await p.getByTestId('button-join-room').click({ timeout: 20000 });
          await sleep(1500);
          friends.push(ctx); out.push(`${who}: joined`);
        } catch (e) { out.push(`${who}: FAILED (${String(e.message).split('\n')[0]})`); }
      }
      return `friends in room ${code}: ${out.join('; ')}`;
    }
    default: throw new Error('unknown command ' + cmd);
  }
}

(async () => {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext(MOBILE
    ? { viewport: { width: VW, height: VH }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  page = await signIn(context, USER);
  context.on('page', p => { page = p; notes.push('a new browser tab opened and is now shown (use back to close it)'); p.on('dialog', onDialog); p.on('close', () => { if (page === p) page = context.pages().slice(-1)[0]; }); });
  const onDialog = d => { notes.push(`browser ${d.type()} dialog: "${d.message()}" (accepted automatically)`); d.accept().catch(() => {}); };
  page.on('dialog', onDialog);
  t0 = Date.now();
  let queue = Promise.resolve();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { res.end('bad request'); return; }
      if (m.cmd === 'quit') { res.end('bye\n'); setTimeout(() => process.exit(0), 100); return; }
      queue = queue.then(() => run(m.cmd, m.args || [], m.text || '')).then(o => res.end(o + '\n'), e => res.end('ERROR: ' + String(e.message).split('\n')[0] + '\n'));
    });
  });
  server.listen(PORT, '127.0.0.1', () => console.log(`ready on ${PORT} as ${USER} ${VW}x${VH}`));
  setTimeout(() => process.exit(0), 40 * 60 * 1000);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
