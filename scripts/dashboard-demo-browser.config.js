import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'test-dashboard-demo-browser.spec.js',workers:1,timeout:60000,
  outputDir:'../.npm-cache/dashboard-demo-browser-results',reporter:'list',
  use:{baseURL:'http://127.0.0.1:3372',headless:true,video:'on',actionTimeout:10000},
  webServer:process.env.DASHBOARD_DEMO_EXTERNAL_SERVER ? undefined : {command:'node scripts/dashboard-demo-lab.cjs start',url:'http://127.0.0.1:3372/login',reuseExistingServer:!process.env.CI,timeout:60000,cwd:'..'}});
