// cap.cjs <outPrefix> <script.json>: the dev kit at a 16:9 stage with the platform's overlay hidden, for clean captures.
// Serve this folder's game on port 5510 first (any static server that sends CORS headers); the debug keys the
// scripts press only exist when the game is loaded from localhost.
// W/H set the stage size in CSS pixels (default 1920x1080).
const { chromium } = require('playwright');
(async () => {
  const [out, stepsFile] = process.argv.slice(2);
  const steps = JSON.parse(require('fs').readFileSync(stepsFile, 'utf8'));
  const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const vp = { width: W + 440, height: H + 120 };
  const ctx = await browser.newContext({ viewport: vp, permissions: ['local-network-access'] }).catch(() => browser.newContext({ viewport: vp }));
  const page = await ctx.newPage();
  await page.goto(`https://project0.city/devkit?entry=${encodeURIComponent('http://127.0.0.1:5510/main.js')}&width=12&depth=12&height=19`, { timeout: 90000 });
  await page.evaluate(([w, h]) => { const d = document.querySelector('#device'); d.style.width = w + 'px'; d.style.height = h + 'px'; d.style.flex = 'none'; d.style.borderRadius = '0'; d.style.border = '0'; d.style.overflow = 'hidden'; const f = d.querySelector('iframe'); if (f) { f.style.borderRadius = '0'; f.style.border = '0' } }, [W, H]);
  console.log('STATUS', await page.evaluate(() => devkit.wait()).catch(e => 'wait failed ' + e.message));
  const hide = async on => { for (const f of page.frames()) if (/stage=1/.test(f.url())) await f.evaluate(v => { const x = document.querySelector('#xhud'); if (x) x.style.display = v ? 'none' : '' }, on).catch(() => {}) };
  await hide(true);
  for (const s of steps) {
    if (s.press) await page.evaluate(([c, ms]) => devkit.press(c, ms), s.press);
    if (s.key) await page.evaluate(([c, d]) => devkit.key(c, d), s.key);
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.shot) { await hide(true); const b = await page.locator('#device').boundingBox(); console.log('SHOT', s.shot, Math.round(b.width) + 'x' + Math.round(b.height)); await page.locator('#device').screenshot({ path: `${out}-${s.shot}.png`, timeout: 60000 }).catch(e => console.log('SHOT FAILED', s.shot, e.message)) }
  }
  const r = await page.evaluate(() => ({ status: devkit.status, errors: devkit.errors, console: devkit.console.slice(-12) })).catch(e => ({ err: e.message }));
  console.log(JSON.stringify(r, null, 1).slice(0, 3000));
  await browser.close();
})();
