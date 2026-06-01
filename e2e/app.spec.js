const path = require('path');
const { test, expect, _electron: electron } = require('@playwright/test');

let app;
let win;

test.beforeEach(async () => {
  app = await electron.launch({ args: [path.join(__dirname, '..')] });
  win = await app.firstWindow();
  await win.waitForSelector('.ss-btn');
});

test.afterEach(async () => {
  await app.close();
});

test('the bar renders a button for every configured drawer', async () => {
  const count = await win.locator('.ss-btn').count();
  expect(count).toBeGreaterThanOrEqual(5);
});

test('clicking a button opens a drawer aligned beneath it', async () => {
  // Use the offline "My Documents" drawer so the test needs no network.
  const btn = win.locator('.ss-btn[data-id="docs"]');
  const btnBox = await btn.boundingBox();
  await btn.click();

  const drawer = win.locator('.ss-drawer[data-id="docs"]');
  await expect(drawer).toBeVisible();

  const drawerBox = await drawer.boundingBox();
  // Left edges aligned (allowing for sub-pixel rounding).
  expect(Math.abs(drawerBox.x - btnBox.x)).toBeLessThan(2);
  // Drawer sits just below the bar.
  expect(drawerBox.y).toBeGreaterThanOrEqual(btnBox.y + btnBox.height - 2);

  await win.screenshot({ path: 'e2e/screenshot.png' });
});

test('only one unpinned drawer is open at a time', async () => {
  await win.locator('.ss-btn[data-id="docs"]').click();
  await expect(win.locator('.ss-drawer[data-id="docs"]')).toBeVisible();

  await win.locator('.ss-btn[data-id="mail"]').click();
  await expect(win.locator('.ss-drawer[data-id="mail"]')).toBeVisible();
  // The previous, unpinned drawer should have closed.
  await expect(win.locator('.ss-drawer[data-id="docs"]')).toHaveCount(0);
});
