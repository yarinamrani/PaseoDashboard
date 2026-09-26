const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [f, w] of [['dish', 1240], ['cooks', 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
    await p.goto('file://' + __dirname + '/' + f + '.html');
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#wrap').screenshot({ path: __dirname + '/' + f + '.png' });
  }
  await b.close();
})();
