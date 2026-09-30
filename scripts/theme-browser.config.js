import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'test-theme-browser.spec.js',workers:1,timeout:60000,
  outputDir:'../.npm-cache/theme-browser-results',reporter:'list',
  use:{baseURL:'http://127.0.0.1:3362',headless:true,viewport:{width:1366,height:900}},
  webServer:{command:'node scripts/theme-lab.cjs start',url:'http://127.0.0.1:3362/login',reuseExistingServer:!process.env.CI,timeout:60000,cwd:'..'}
});
