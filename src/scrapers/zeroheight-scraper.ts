import { Page } from 'playwright';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { ZeroheightComponent, ZeroheightPage, ZeroheightSection, ZeroheightData } from '../types.js';

const BASE_URL = 'https://igds.gov.il/4988d5140';
const IMAGES_DIR = join(process.cwd(), 'data', 'images', 'zeroheight');

let browser: any = null;
let currentPage: any = null;

export async function getBrowser(): Promise<any> {
  if (currentPage) return currentPage;
  
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
  // See the matching comment in scrape-all.ts: opt-in only, for TLS-intercepting proxies.
  currentPage = await browser.newPage({ ignoreHTTPSErrors: process.env.IGDS_SCRAPE_INSECURE_TLS === '1' });
  
  return currentPage;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    currentPage = null;
  }
}

async function downloadImage(url: string, componentName: string, sectionName: string, index: number): Promise<string | null> {
  try {
    if (!existsSync(IMAGES_DIR)) {
      mkdirSync(IMAGES_DIR, { recursive: true });
    }
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const buffer = await response.arrayBuffer();
    const ext = url.match(/\.(jpg|jpeg|png|gif|svg|webp)/i)?.[1] || 'png';
    const filename = `${componentName}-${sectionName}-${index}.${ext}`;
    const filepath = join(IMAGES_DIR, filename);
    
    writeFileSync(filepath, Buffer.from(buffer));
    return filename;
  } catch (e) {
    console.error(`Failed to download image: ${url}`, e);
    return null;
  }
}

export async function scrapeZeroheightNavigation(): Promise<{ pages: ZeroheightPage[]; categories: string[] }> {
  const p = await getBrowser();
  
  console.error('Fetching Zeroheight navigation...');
  await p.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(3000);
  
  const navData = await p.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.map(a => ({
      text: a.textContent?.trim() || '',
      href: a.getAttribute('href') || ''
    })).filter(l => l.href.includes('/4988d5140/'));
  });
  
  const pages: ZeroheightPage[] = [];
  const seen = new Set<string>();
  
  for (const link of navData) {
    const match = link.href.match(/\/4988d5140\/p\/([^-]+)-(.+)/);
    if (match && !seen.has(link.href)) {
      seen.add(link.href);
      pages.push({
        id: match[1],
        title: link.text,
        slug: match[2],
        url: link.href.startsWith('http') ? link.href : `https://igds.gov.il${link.href}`,
        type: 'guide'
      });
    }
  }
  
  return { pages, categories: [] };
}

export async function scrapeZeroheightComponents(): Promise<ZeroheightComponent[]> {
  const p = await getBrowser();
  
  console.error('Fetching Zeroheight components page...');
  await p.goto(`${BASE_URL}/p/4809b2-components`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(3000);
  
  const componentLinks = await p.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.map(a => ({
      text: a.textContent?.trim() || '',
      href: a.getAttribute('href') || ''
    })).filter(l => l.href.includes('/p/') && !l.href.includes('/b/'));
  });
  
  const categories = await p.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h3'));
    return headings.map(h => h.textContent?.trim() || '').filter(t => t.length > 0);
  });
  
  const components: ZeroheightComponent[] = [];
  const seen = new Set<string>();
  
  for (const link of componentLinks) {
    const match = link.href.match(/\/4988d5140\/p\/([^-]+)-(.+)/);
    if (match && !seen.has(match[2]) && link.text !== 'Components' && !link.text.includes('->')) {
      seen.add(match[2]);
      
      const category = guessCategory(link.text, categories);
      
      components.push({
        name: link.text,
        slug: match[2],
        url: link.href.startsWith('http') ? link.href : `https://igds.gov.il${link.href}`,
        category,
        sections: {}
      });
    }
  }
  
  return components;
}

function guessCategory(componentName: string, categories: string[]): string {
  const name = componentName.toLowerCase();
  
  if (name.includes('button') || name.includes('checkbox') || name.includes('toggle') || 
      name.includes('slider') || name.includes('spin') || name.includes('anchor') || 
      name.includes('rating') || name.includes('radio') || name.includes('chip')) {
    return 'Buttons';
  }
  if (name.includes('input') || name.includes('drop') || name.includes('search') || 
      name.includes('date') || name.includes('file') || name.includes('text') || 
      name.includes('time') || name.includes('profile') || name.includes('signature') || 
      name.includes('chat')) {
    return 'Input and Selection';
  }
  if (name.includes('divider') || name.includes('badge') || name.includes('progress') || 
      name.includes('tag') || name.includes('step') || name.includes('scroll') || 
      name.includes('skeleton') || name.includes('loader')) {
    return 'Indicator and Status';
  }
  if (name.includes('accordion') || name.includes('card') || name.includes('banner') || 
      name.includes('list') || name.includes('update')) {
    return 'Content Display';
  }
  if (name.includes('breadcrumb') || name.includes('menu') || name.includes('tab') || 
      name.includes('pagination')) {
    return 'Navigation';
  }
  if (name.includes('toast') || name.includes('tooltip') || name.includes('modal') || 
      name.includes('drawer') || name.includes('tour') || name.includes('error')) {
    return 'Messaging';
  }
  if (name.includes('table') || name.includes('filter') || name.includes('navigation')) {
    return 'Data and Tables';
  }
  
  return 'Other';
}

export async function scrapeComponentSections(component: ZeroheightComponent): Promise<ZeroheightComponent> {
  const p = await getBrowser();
  
  console.error(`  Scraping sections for ${component.name}...`);
  
  const sectionTypes = ['design', 'code', 'usage', 'accessibility'] as const;
  const sectionPatterns: Record<string, string[]> = {
    design: ['Design', 'Desing'],
    code: ['Code'],
    usage: ['Usage'],
    accessibility: ['Accessibility', 'Accessibiliy', 'Accesibility']
  };
  
  for (const sectionType of sectionTypes) {
    const patterns = sectionPatterns[sectionType];
    
    for (const pattern of patterns) {
      const sectionUrl = `${component.url}/b/${await findSectionId(component.url, pattern)}`;
      
      if (sectionUrl.includes('undefined')) continue;
      
      try {
        await p.goto(sectionUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await p.waitForTimeout(2000);
        
        const section = await extractSection(sectionType, component.name);
        if (section && (section.content.length > 0 || section.images.length > 0)) {
          component.sections[sectionType] = section;
          break;
        }
      } catch (e) {
        console.error(`    Failed to scrape ${sectionType} section:`, e);
      }
    }
  }
  
  return component;
}

/**
 * The section tabs of THIS component: links under its own path (`/p/06a72e-table/b/…`).
 * Every zeroheight page also carries a site-wide sidebar listing Design/Code/Usage/
 * Accessibility for every component, Button's first, so matching link text alone picked
 * another component's sections.
 */
export async function findSectionLinks(componentUrl: string): Promise<Record<string, string>> {
  const p = await getBrowser();
  try {
    await p.goto(componentUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const path = new URL(componentUrl).pathname;
    // The tab links render after networkidle; wait for them rather than a fixed delay.
    await p.waitForSelector(`a[href*="${path}/b/"]`, { timeout: 15000 }).catch(() => undefined);
    return await p.evaluate((ownPath: string) => {
      const links: Record<string, string> = {};
      for (const link of Array.from(document.querySelectorAll(`a[href*="${ownPath}/b/"]`))) {
        const text = link.textContent?.trim().toLowerCase() || '';
        const href = link.getAttribute('href');
        if (href && text && !links[text]) links[text] = new URL(href, location.origin).href;
      }
      return links;
    }, path);
  } catch {
    return {};
  }
}

async function findSectionId(componentUrl: string, sectionName: string): Promise<string | undefined> {
  const links = await findSectionLinks(componentUrl);
  const match = Object.entries(links).find(([text]) => text.includes(sectionName.toLowerCase()));
  return match?.[1].match(/\/b\/([a-f0-9]+)/)?.[1];
}

/**
 * The tab bar every component page renders above its content. The sidebar also lists the
 * current component's tabs with the same text, earlier on the page, so use the LAST match.
 */
const TAB_BAR = /\n(?:Design|Desing)\nCode\nUsage\nAccess[a-z]*\n/g;

/**
 * Wait for the section's own content, then return only it. Tab content renders after
 * `networkidle`; the old fixed 2 s wait often captured the navigation and nothing else.
 */
/** The one-line description zeroheight shows under the title, just above the tab bar. */
export async function readPageSummary(componentName: string): Promise<string | undefined> {
  const p = await getBrowser();
  const text: string = await p.evaluate(() => document.body.innerText || '');
  const bar = [...text.matchAll(TAB_BAR)].pop();
  if (!bar || bar.index === undefined) return undefined;
  const line = text
    .slice(0, bar.index)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return line && line.toLowerCase() !== componentName.toLowerCase() && line.length >= 20 ? line : undefined;
}

export async function readSectionText(timeoutMs = 15000): Promise<string> {
  const p = await getBrowser();
  const deadline = Date.now() + timeoutMs;
  let previous = '';
  while (Date.now() < deadline) {
    const text = await p.evaluate(() => document.body.innerText || '');
    const bar = [...text.matchAll(TAB_BAR)].pop();
    const content = bar && bar.index !== undefined ? text.slice(bar.index + bar[0].length).trim() : '';
    // Stable and non-trivial across two polls: the tab has finished rendering.
    if (content.length > 40 && content === previous) return content.slice(0, 20000);
    previous = content;
    await p.waitForTimeout(1000);
  }
  return previous.slice(0, 20000);
}

async function extractSection(sectionType: string, componentName: string): Promise<ZeroheightSection> {
  const p = await getBrowser();
  
  const content = await readSectionText();
  
  const images = await p.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const imageUrls: string[] = [];
    
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const src = img.src || img.getAttribute('data-src');
      if (src && !src.includes('logo') && !src.includes('icon')) {
        imageUrls.push(src);
      }
    }
    
    return imageUrls;
  });
  
  const codeExamples = await p.evaluate(() => {
    const codeBlocks = Array.from(document.querySelectorAll('pre, code'));
    return codeBlocks.map(block => block.textContent?.trim() || '').filter(t => t.length > 10);
  });
  
  const downloadedImages: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const filename = await downloadImage(images[i], componentName, sectionType, i);
    if (filename) {
      downloadedImages.push(filename);
    }
  }
  
  return {
    title: sectionType.charAt(0).toUpperCase() + sectionType.slice(1),
    content,
    images: downloadedImages,
    codeExamples
  };
}

export async function scrapeZeroheightPage(pageUrl: string): Promise<ZeroheightPage | null> {
  const p = await getBrowser();
  
  try {
    await p.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(2000);
    
    const pageData = await p.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      const content = document.body.innerText?.substring(0, 5000) || '';
      const images = Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src => src && !src.includes('logo'));
      
      return { title, content, images };
    });
    
    const match = pageUrl.match(/\/4988d5140\/p\/([^-]+)-(.+)/);
    
    return {
      id: match?.[1] || '',
      title: pageData.title,
      slug: match?.[2] || '',
      url: pageUrl,
      type: 'guide',
      content: pageData.content,
      images: pageData.images
    };
  } catch (e) {
    console.error(`Failed to scrape page: ${pageUrl}`, e);
    return null;
  }
}

export async function scrapeAllZeroheight(): Promise<ZeroheightData> {
  const data: ZeroheightData = {
    components: {},
    pages: {},
    categories: [],
    scrapedAt: new Date().toISOString()
  };
  
  try {
    const { pages } = await scrapeZeroheightNavigation();
    for (const page of pages) {
      data.pages[page.slug] = page;
    }
    
    const components = await scrapeZeroheightComponents();
    data.categories = [...new Set(components.map(c => c.category))];
    
    for (const component of components) {
      console.error(`\nProcessing ${component.name}...`);
      const fullComponent = await scrapeComponentSections(component);
      data.components[component.name] = fullComponent;
    }
    
    const guidePages = [
      { name: 'Designers', url: `${BASE_URL}/p/176702-designers` },
      { name: 'Developers', url: `${BASE_URL}/p/08ae19-developers` },
      { name: 'Marketers', url: `${BASE_URL}/p/5382d2-marketers` }
    ];
    
    for (const guide of guidePages) {
      const page = await scrapeZeroheightPage(guide.url);
      if (page) {
        data.pages[guide.name.toLowerCase()] = page;
      }
    }
    
  } finally {
    await closeBrowser();
  }
  
  data.scrapedAt = new Date().toISOString();
  return data;
}
