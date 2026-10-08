import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'test-platform-workspace-entry-browser.spec.js',workers:1,timeout:180000,
 outputDir:process.env.INBOX_EVIDENCE_DIR||'../.npm-cache/platform-workspace-entry-results',reporter:'list',
 use:{baseURL:process.env.INBOX_BASE_URL||'http://127.0.0.1:3364',headless:true,actionTimeout:10000},
 webServer:process.env.INBOX_EXTERNAL_SERVER ? undefined : {command:'node scripts/accessibility-lab.cjs start',url:'http://127.0.0.1:3364/login',reuseExistingServer:false,timeout:60000,cwd:'..'}});
