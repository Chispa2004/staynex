import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'test-density-browser.spec.js',workers:1,timeout:180000,
  outputDir:'../.npm-cache/density-browser-results',reporter:'list',
  use:{baseURL:'http://127.0.0.1:3363',headless:true},
  webServer:process.env.DENSITY_EXTERNAL_SERVER ? undefined : {command:'node scripts/density-lab.cjs start',url:'http://127.0.0.1:3363/login',reuseExistingServer:!process.env.CI,timeout:60000,cwd:'..'}
});
