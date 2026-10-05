import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:['test-accessibility-browser.spec.js','test-ticket-actions-browser.spec.js'],workers:1,timeout:180000,
  outputDir:'../.npm-cache/accessibility-browser-results',reporter:'list',
  use:{baseURL:process.env.ACCESSIBILITY_BASE_URL||'http://127.0.0.1:3364',headless:true,actionTimeout:10000},
  webServer:process.env.ACCESSIBILITY_EXTERNAL_SERVER ? undefined : {command:'node scripts/accessibility-lab.cjs start',url:'http://127.0.0.1:3364/login',reuseExistingServer:!process.env.CI,timeout:60000,cwd:'..'}
});
