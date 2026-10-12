import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:false,
  workers:1,
  timeout:30000,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:5183',trace:'retain-on-failure',screenshot:'only-on-failure',channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'},
  projects:[
    {name:'desktop',use:{viewport:{width:1440,height:1000}}},
    {name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},
  ],
  webServer:{command:'npm run dev',env:{DATABASE_PATH:'.artifacts/e2e.sqlite',VITE_PORT:'5183',PORT:'4176'},url:'http://127.0.0.1:5183',reuseExistingServer:!process.env.CI,timeout:60000},
});
