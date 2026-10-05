import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'test-dashboard-pending-browser.spec.js',workers:1,timeout:90000,
  outputDir:process.env.PENDING_OUTPUT||'../.npm-cache/pending-ticket-browser-results',reporter:'list',
  use:{baseURL:process.env.PENDING_BASE_URL||'http://127.0.0.1:3370',headless:true,actionTimeout:10000},
  webServer:process.env.PENDING_EXTERNAL_SERVER?undefined:{command:'node scripts/pending-tickets-lab.cjs start',url:'http://127.0.0.1:3370/login',reuseExistingServer:false,timeout:60000,cwd:'..'}
});
