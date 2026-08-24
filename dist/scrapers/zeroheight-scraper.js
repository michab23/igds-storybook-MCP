import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
const BASE_URL = 'https://igds.gov.il/4988d5140';
const IMAGES_DIR = join(process.cwd(), 'data', 'images', 'zeroheight');
let browser = null;
let currentPage = null;
async function getBrowser() {
    if (currentPage)
        return currentPage;
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    // See the matching comment in scrape-all.ts: opt-in only, for TLS-intercepting proxies.
    currentPage = await browser.newPage({ ignoreHTTPSErrors: process.env.IGDS_SCRAPE_INSECURE_TLS === '1' });
    return currentPage;
}
export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        currentPage = null;
    }
}
async function downloadImage(url, componentName, sectionName, index) {
    try {
        if (!existsSync(IMAGES_DIR)) {
            mkdirSync(IMAGES_DIR, { recursive: true });
        }
        const response = await fetch(url);
        if (!response.ok)
            return null;
        const buffer = await response.arrayBuffer();
        const ext = url.match(/\.(jpg|jpeg|png|gif|svg|webp)/i)?.[1] || 'png';
        const filename = `${componentName}-${sectionName}-${index}.${ext}`;
        const filepath = join(IMAGES_DIR, filename);
        writeFileSync(filepath, Buffer.from(buffer));
        return filename;
    }
    catch (e) {
        console.error(`Failed to download image: ${url}`, e);
        return null;
    }
}
export async function scrapeZeroheightNavigation() {
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
    const pages = [];
    const seen = new Set();
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
export async function scrapeZeroheightComponents() {
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
    const components = [];
    const seen = new Set();
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
function guessCategory(componentName, categories) {
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
export async function scrapeComponentSections(component) {
    const p = await getBrowser();
    console.error(`  Scraping sections for ${component.name}...`);
    const sectionTypes = ['design', 'code', 'usage', 'accessibility'];
    const sectionPatterns = {
        design: ['Design', 'Desing'],
        code: ['Code'],
        usage: ['Usage'],
        accessibility: ['Accessibility', 'Accessibiliy', 'Accesibility']
    };
    for (const sectionType of sectionTypes) {
        const patterns = sectionPatterns[sectionType];
        for (const pattern of patterns) {
            const sectionUrl = `${component.url}/b/${await findSectionId(component.url, pattern)}`;
            if (sectionUrl.includes('undefined'))
                continue;
            try {
                await p.goto(sectionUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await p.waitForTimeout(2000);
                const section = await extractSection(sectionType, component.name);
                if (section && (section.content.length > 0 || section.images.length > 0)) {
                    component.sections[sectionType] = section;
                    break;
                }
            }
            catch (e) {
                console.error(`    Failed to scrape ${sectionType} section:`, e);
            }
        }
    }
    return component;
}
async function findSectionId(componentUrl, sectionName) {
    const p = await getBrowser();
    try {
        await p.goto(componentUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await p.waitForTimeout(2000);
        const sectionId = await p.evaluate((name) => {
            const links = Array.from(document.querySelectorAll('a[href*="/b/"]'));
            for (const link of links) {
                if (link.textContent?.trim().toLowerCase().includes(name.toLowerCase())) {
                    const match = link.getAttribute('href')?.match(/\/b\/([a-f0-9]+)/);
                    return match?.[1];
                }
            }
            return undefined;
        }, sectionName);
        return sectionId;
    }
    catch (e) {
        return undefined;
    }
}
async function extractSection(sectionType, componentName) {
    const p = await getBrowser();
    const content = await p.evaluate(() => {
        const body = document.body;
        const text = body.innerText || '';
        return text.substring(0, 10000);
    });
    const images = await p.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const imageUrls = [];
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
    const downloadedImages = [];
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
export async function scrapeZeroheightPage(pageUrl) {
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
    }
    catch (e) {
        console.error(`Failed to scrape page: ${pageUrl}`, e);
        return null;
    }
}
export async function scrapeAllZeroheight() {
    const data = {
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
    }
    finally {
        await closeBrowser();
    }
    data.scrapedAt = new Date().toISOString();
    return data;
}
//# sourceMappingURL=zeroheight-scraper.js.map