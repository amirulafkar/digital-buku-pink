const { chromium } = require('../../../web/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('file:///' + process.argv[2].replace(/\\/g, '/'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: process.argv[3], fullPage: true });
  await b.close();
})();
