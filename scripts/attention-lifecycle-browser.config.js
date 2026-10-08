import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'test-attention-lifecycle-browser.spec.js',workers:1,timeout:45000,
 outputDir:process.env.ATTENTION_EVIDENCE_DIR||'../.npm-cache/attention-lifecycle-browser-results',reporter:'list',
 use:{baseURL:'http://127.0.0.1:3364',browserName:'chromium'},
 webServer:process.env.INBOX_EXTERNAL_SERVER?undefined:{command:'node scripts/accessibility-lab.cjs start',url:'http://127.0.0.1:3364/login',reuseExistingServer:false,timeout:60000,cwd:'..'}});
