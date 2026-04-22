#!/usr/bin/env node
/**
 * Static Screenshot Script using Playwright
 * Takes screenshots of static HTML files representing the Skills Admin UI
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');

async function takeScreenshots() {
  console.log('📸 Starting static screenshot capture...\n');
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const files = [
    { 
      input: 'static-admin-skills-with-sidebar.html', 
      output: '01-skills-admin-with-sidebar.png',
      title: 'Skills Admin - Full Layout with Sidebar'
    },
    { 
      input: 'static-skills-matrix.html', 
      output: '02-skills-admin-matrix-only.png',
      title: 'Skills Admin - Matrix View'
    }
  ];

  for (const { input, output, title } of files) {
    const inputPath = path.join(__dirname, input);
    
    if (!fs.existsSync(inputPath)) {
      console.log(`⚠️  Skipping ${input} - file not found`);
      continue;
    }

    console.log(`📄 Processing: ${title}`);
    
    // Load file
    await page.goto(`file://${inputPath}`, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for rendering
    await page.waitForTimeout(500);
    
    // Take screenshot
    const outputPath = path.join(OUTPUT_DIR, output);
    await page.screenshot({ 
      path: outputPath,
      fullPage: false
    });
    
    console.log(`✅ Saved: ${output}\n`);
  }

  await browser.close();

  console.log('🎉 All screenshots saved to:', OUTPUT_DIR);
  console.log('\nFiles created:');
  const createdFiles = fs.readdirSync(OUTPUT_DIR);
  createdFiles.forEach(f => console.log(`  - ${f}`));
}

takeScreenshots().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
