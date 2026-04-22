import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureSyncDemo() {
  console.log('📸 Capturing Sync Mode Demo...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 700 }
  });
  const page = await context.newPage();

  // Load the sync mode demo HTML
  const htmlPath = path.join(__dirname, 'sync-mode-demo.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  
  // Wait for rendering
  await page.waitForTimeout(500);
  
  // Take screenshot
  const outputPath = path.join(__dirname, 'output', 'skills-admin-sync-mode.png');
  await page.screenshot({ 
    path: outputPath,
    fullPage: true
  });
  
  console.log(`✅ Saved: skills-admin-sync-mode.png`);
  console.log(`   Location: ${outputPath}`);
  
  await browser.close();
  
  console.log('\n🎉 Screenshot captured!');
}

captureSyncDemo().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
