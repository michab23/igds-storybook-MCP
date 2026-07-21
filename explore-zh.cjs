const { chromium } = require('playwright');

async function explorePages() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const pages = [
    { name: 'Designers', url: 'https://igds.gov.il/4988d5140/p/176702-designers' },
    { name: 'Developers', url: 'https://igds.gov.il/4988d5140/p/08ae19-developers' },
    { name: 'Components', url: 'https://zeroheight.com/4988d5140/p/4809b2-components' },
  ];
  
  for (const p of pages) {
    console.log(`\n=== ${p.name} ===`);
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for content to load
    await page.waitForTimeout(5000);
    
    const content = await page.evaluate(() => {
      const body = document.body;
      
      // Get all headings
      const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5')).map(h => ({
        tag: h.tagName,
        text: h.textContent?.trim()
      }));
      
      // Get navigation structure
      const navLinks = Array.from(body.querySelectorAll('a')).map(a => ({
        text: a.textContent?.trim().substring(0, 100),
        href: a.getAttribute('href')
      })).filter(l => l.text && l.text.length > 0);
      
      // Get main content
      const allText = body.innerText?.substring(0, 5000);
      
      return { headings, navLinks: navLinks.slice(0, 50), allText };
    });
    
    console.log('Headings:', content.headings.length);
    content.headings.slice(0, 20).forEach(h => console.log(`  ${h.tag}: ${h.text}`));
    
    console.log('\nNav links:', content.navLinks.length);
    content.navLinks.slice(0, 20).forEach(l => console.log(`  ${l.text} -> ${l.href}`));
    
    console.log('\nText preview:', content.allText?.substring(0, 1000));
    
    // Take screenshot
    await page.screenshot({ path: `data/zh-${p.name.toLowerCase()}.png`, fullPage: false });
    console.log(`Screenshot saved to data/zh-${p.name.toLowerCase()}.png`);
  }
  
  await browser.close();
}

explorePages().catch(console.error);
