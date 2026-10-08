import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'test-night-blue-navigation-browser.spec.js',workers:1,timeout:120000,
 outputDir:'../.npm-cache/night-blue-browser-results',reporter:'list',
 use:{baseURL:'http://127.0.0.1:3364',headless:true,actionTimeout:10000},
 webServer:{command:'node scripts/accessibility-lab.cjs start',url:'http://127.0.0.1:3364/login',reuseExistingServer:false,timeout:60000,cwd:'..'}});
