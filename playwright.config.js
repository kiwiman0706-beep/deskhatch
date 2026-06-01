const { defineConfig } = require('@playwright/test');

// E2E tests drive the real Electron app. They need a display (works on a Windows
// or macOS desktop; on headless Linux use xvfb-run). They do NOT depend on any
// remote site — the geometry assertions use the offline "My Documents" drawer.
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
});
