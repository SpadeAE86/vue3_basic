import puppeteer from 'puppeteer';

(async () => {
  const url = process.argv[2] || 'http://localhost:5173';
  console.log(`Starting headless browser check at ${url}...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const warnings = [];
  const errors = [];

  // Listen to console events
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    
    // Ignore vite dev server logs
    if (text.includes('[vite]')) return;
    
    if (type === 'warning' || type === 'warn') {
      if (text.includes('[Vue warn]') || text.includes('warning')) {
        warnings.push(text);
      }
    } else if (type === 'error') {
      // Ignore some non-critical errors if any, but capture Vue errors and generic TypeErrors
      errors.push(text);
    }
  });

  page.on('pageerror', err => {
    errors.push(err.message);
  });

  try {
    // Navigate and wait for network to be idle
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    
    // Wait a brief moment for any final async renderings or transitions
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (err) {
    console.error(`Failed to navigate to ${url}: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  await browser.close();

  if (errors.length > 0 || warnings.length > 0) {
    console.log('\n--- HEADLESS CONSOLE CHECK FAILED ---');
    if (errors.length > 0) {
      console.log('\nErrors found:');
      errors.forEach(e => console.log(`  ❌ ${e}`));
    }
    if (warnings.length > 0) {
      console.log('\nWarnings found:');
      warnings.forEach(w => console.log(`  ⚠️ ${w}`));
    }
    process.exit(1);
  }

  console.log('✅ Headless console check passed! No Vue warnings or errors detected.');
  process.exit(0);
})();
