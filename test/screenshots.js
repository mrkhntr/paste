/*
 * Visual screenshot test for Safe Paste.
 *
 * Captures compose / view / history across iPhone, iPad and a 13" desktop, in
 * both light and dark color schemes, so the layout and markdown formatting can
 * be eyeballed. Also asserts the toolbars don't overflow to too many rows.
 *
 * Usage:
 *   npm install              # installs puppeteer
 *   npm run screenshots                      # hits the live site by default
 *   BASE=http://localhost:8753/paste/ npm run screenshots   # local
 *
 * Output PNGs go to test/screenshots/.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || process.argv[2] || 'https://mrkhntr.com/paste/';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = `# Safe Paste demo

A **serverless** paste with _markdown_, \`inline code\`, and ~~strikethrough~~.

## Features
- No server — content lives in the URL
- Auto-detect format (markdown vs plain)
- Local history, offline support

1. Write or paste
2. Press Save
3. Share the link

> Nothing ever leaves your browser.

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

| Feature   | Status |
| --------- | ------ |
| Markdown  | yes    |
| Dark mode | yes    |

[Open the repo](https://github.com/mrkhntr/paste)
`;

const DEVICES = {
  desktop13: { vp: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false } },
  ipad: {
    vp: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  iphone: {
    vp: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setVal = (p, t) => p.evaluate((v) => document.querySelector('.CodeMirror').CodeMirror.setValue(v), t);
const toolbarRows = (p, sel) =>
  p.evaluate((s) => {
    const tb = document.querySelector(s);
    // Cluster children by vertical center (tolerance) so short elements like the
    // format badge count on the same row as the taller buttons beside them.
    const centers = [...tb.children]
      .filter((c) => c.getBoundingClientRect().height > 0) // ignore zero-height spacer
      .map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; })
      .sort((a, b) => a - b);
    let rows = 0;
    let last = -Infinity;
    for (const c of centers) { if (c - last > 12) { rows++; last = c; } }
    return rows;
  }, sel);

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const issues = [];

  for (const [name, d] of Object.entries(DEVICES)) {
    for (const scheme of ['dark', 'light']) {
      const p = await browser.newPage();
      await p.setViewport(d.vp);
      if (d.ua) await p.setUserAgent(d.ua);
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await p.goto(BASE, { waitUntil: 'networkidle0' });
      await p.waitForSelector('.CodeMirror', { timeout: 15000 });
      await p.evaluate(() => localStorage.clear());
      await setVal(p, SAMPLE);
      await sleep(500);

      await p.screenshot({ path: path.join(OUT, `${name}-${scheme}-compose.png`) });

      // Mobile preview toggle
      const hasPreview = await p.$eval('#btn-preview', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
      if (hasPreview) {
        await p.click('#btn-preview');
        await sleep(300);
        await p.screenshot({ path: path.join(OUT, `${name}-${scheme}-compose-preview.png`) });
        await p.click('#btn-preview'); // back to edit
        await sleep(150);
      }

      const composeRows = await toolbarRows(p, '#compose .toolbar');
      if (composeRows > 2) issues.push(`${name}/${scheme}: compose toolbar uses ${composeRows} rows`);

      await p.click('#btn-save');
      await p.waitForFunction(() => !document.getElementById('view').hidden, { timeout: 5000 });
      await sleep(400);
      await p.screenshot({ path: path.join(OUT, `${name}-${scheme}-view.png`) });

      const viewRows = await toolbarRows(p, '#view .toolbar');
      if (viewRows > 2) issues.push(`${name}/${scheme}: view toolbar uses ${viewRows} rows`);

      if (scheme === 'dark') {
        await p.evaluate(() => {
          const a = JSON.parse(localStorage.getItem('safepaste:pastes') || '[]');
          a.unshift({ id: 'mX', title: 'Shopping list', hash: 'mX', format: 'markdown', createdAt: Date.now() - 3600e3 });
          a.push({ id: 'tY', title: 'API keys note', hash: 'tY', format: 'plain', createdAt: Date.now() - 86400e3 });
          localStorage.setItem('safepaste:pastes', JSON.stringify(a));
        });
        await p.click('#btn-history-2');
        await p.waitForSelector('#history:not([hidden])');
        await sleep(300);
        await p.screenshot({ path: path.join(OUT, `${name}-history.png`) });
      }

      await p.close();
      console.log(`captured ${name} (${scheme})`);
    }
  }

  await browser.close();
  console.log(`\nScreenshots written to ${OUT}`);
  if (issues.length) {
    console.log('\nLayout warnings:');
    issues.forEach((i) => console.log(' - ' + i));
    process.exit(1);
  }
  console.log('No layout overflow detected.');
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
