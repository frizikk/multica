#!/usr/bin/env node
/**
 * Screenshot script using Playwright
 * 
 * This script takes screenshots of the Skills Admin pages.
 * Run this after starting the application:
 *   1. Start database: docker compose up db -d
 *   2. Start server: cd server && go run ./cmd/server
 *   3. Start web: cd apps/web && pnpm dev
 *   4. Run this script: node take-screenshots.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'output');

async function takeScreenshots() {
  console.log('Starting screenshot capture...');
  console.log(`Base URL: ${BASE_URL}`);
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // Screenshot 1: Skills Admin Page
    console.log('Taking screenshot of Skills Admin page...');
    await page.goto(`${BASE_URL}/test-workspace/admin-skills`, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(OUTPUT_DIR, '01-skills-admin-page.png'),
      fullPage: false
    });
    console.log('✅ Screenshot saved: 01-skills-admin-page.png');

    // Screenshot 2: Settings Page with Admin section
    console.log('Taking screenshot of Settings page...');
    await page.goto(`${BASE_URL}/test-workspace/settings`, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(OUTPUT_DIR, '02-settings-page.png'),
      fullPage: false
    });
    console.log('✅ Screenshot saved: 02-settings-page.png');

    // Screenshot 3: Skills Matrix Component (if skills exist)
    const skillsMatrix = await page.locator('.divide-y').count();
    if (skillsMatrix > 0) {
      await page.screenshot({ 
        path: path.join(OUTPUT_DIR, '03-skills-matrix.png'),
        fullPage: true
      });
      console.log('✅ Screenshot saved: 03-skills-matrix.png');
    }

    console.log('\n✅ All screenshots saved to:', OUTPUT_DIR);
    
  } catch (error) {
    console.error('❌ Error taking screenshots:', error.message);
    console.log('\nMake sure the application is running:');
    console.log('  1. Database: docker compose up db -d');
    console.log('  2. Server: cd server && go run ./cmd/server');
    console.log('  3. Web: cd apps/web && pnpm dev');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
