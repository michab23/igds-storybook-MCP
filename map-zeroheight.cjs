const { chromium } = require('playwright');

async function mapSite() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Start from the main page
  await page.goto('https://igds.gov.il/4988d5140/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // Get all navigation links
  const allLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.map(a => ({
      text: a.textContent?.trim(),
      href: a.getAttribute('href')
    })).filter(l => l.href && (l.href.includes('/4988d5140/') || l.href.includes('/p/')));
  });
  
  console.log('All links found:', allLinks.length);
  
  // Group by path pattern
  const patterns = {};
  allLinks.forEach(l => {
    const match = l.href?.match(/\/4988d5140\/(p|n)\/([^/]+)/);
    if (match) {
      const type = match[1];
      const slug = match[2];
      if (!patterns[type]) patterns[type] = [];
      patterns[type].push({ text: l.text, slug, href: l.href });
    }
  });
  
  console.log('\nPage types:');
  console.log('  /p/ (pages):', patterns.p?.length || 0);
  console.log('  /n/ (nodes):', patterns.n?.length || 0);
  
  // List all /p/ pages
  console.log('\n=== All /p/ pages ===');
  const seen = new Set();
  (patterns.p || []).forEach(p => {
    if (!seen.has(p.href)) {
      seen.add(p.href);
      console.log(`  ${p.text} -> ${p.href}`);
    }
  });
  
  // Now visit the Components page to get full structure
  console.log('\n=== Exploring Components page ===');
  await page.goto('https://igds.gov.il/4988d5140/p/4809b2-components', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  const componentLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.map(a => ({
      text: a.textContent?.trim(),
      href: a.getAttribute('href')
    })).filter(l => l.href && l.href.includes('/p/'));
  });
  
  console.log('Component links:', componentLinks.length);
  const uniqueComponents = new Map();
  componentLinks.forEach(l => {
    if (!uniqueComponents.has(l.href)) {
      uniqueComponents.set(l.href, l.text);
    }
  });
  
  console.log('\nUnique component pages:');
  for (const [href, text] of uniqueComponents) {
    console.log(`  ${text} -> ${href}`);
  }
  
  await browser.close();
}

mapSite().catch(console.error);
