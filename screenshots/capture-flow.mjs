import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureFlow() {
  console.log('📸 Capturing Skills Admin flow demo...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Load the flow demo HTML
  const htmlPath = path.join(__dirname, 'flow-demo.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  
  // Wait for rendering
  await page.waitForTimeout(500);
  
  // Take full page screenshot
  const outputPath = path.join(__dirname, 'output', 'skills-admin-flow-demo.png');
  await page.screenshot({ 
    path: outputPath,
    fullPage: true
  });
  
  console.log(`✅ Saved: skills-admin-flow-demo.png`);
  console.log(`   Location: ${outputPath}`);
  
  // Also capture individual steps
  const steps = [
    { top: 0, height: 400, name: 'step1-navigation' },
    { top: 400, height: 400, name: 'step2-matrix' },
    { top: 900, height: 400, name: 'step3-selection' },
    { top: 1400, height: 350, name: 'step4-actions' },
    { top: 1800, height: 300, name: 'step5-confirm' },
    { top: 2150, height: 250, name: 'step6-success' },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const clip = { x: 0, y: step.top, width: 1280, height: step.height };
    const stepPath = path.join(__dirname, 'output', `flow-${step.name}.png`);
    
    await page.screenshot({ 
      path: stepPath,
      clip
    });
    console.log(`✅ Saved: flow-${step.name}.png`);
  }

  await browser.close();
  
  console.log('\n🎉 All flow screenshots captured!');
}

captureFlow().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
