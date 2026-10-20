/**
 * Re-read the text of every component's zeroheight sections (Design, Code, Usage,
 * Accessibility) into data/zeroheight-data.json, keeping the existing images.
 *
 * A full zeroheight scrape also re-downloads ~1,000 images; this refreshes only what
 * agents read. A section the component doesn't have is removed: older scrapes filled it
 * from another component's page.
 *
 * Run: npm run scrape:zeroheight-text && npm run build:docs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { closeBrowser, findSectionLinks, getBrowser, readPageSummary, readSectionText } from '../src/scrapers/zeroheight-scraper.js';
import { ZeroheightData, ZeroheightSectionName } from '../src/types.js';

const FILE = join(process.cwd(), 'data', 'zeroheight-data.json');
const SECTION_LINK_TEXT: Record<ZeroheightSectionName, RegExp> = {
  design: /^(design|desing)$/,
  code: /^code$/,
  usage: /^usage$/,
  accessibility: /^access[a-z]*$/,
};

const data = JSON.parse(readFileSync(FILE, 'utf-8')) as ZeroheightData & { textRefreshedAt?: string };
// ZH_ONLY=Table,Modal limits a run to some components (for testing).
const only = process.env.ZH_ONLY?.split(',').map((name) => name.trim().toLowerCase());
const names = Object.keys(data.components).sort().filter((name) => !only || only.includes(name.toLowerCase()));
let read = 0;
let removed = 0;
const failed: string[] = [];

try {
  const page = await getBrowser();
  for (const [index, name] of names.entries()) {
    const component = data.components[name];
    const links = await findSectionLinks(component.url);
    delete component.summary;
    const found: string[] = [];
    // No links at all means the page didn't load, not that the sections don't exist.
    if (!Object.keys(links).length) {
      failed.push(name);
      console.log(`[${index + 1}/${names.length}] ${name}: no section links found, kept existing data`);
      continue;
    }
    for (const [section, pattern] of Object.entries(SECTION_LINK_TEXT) as [ZeroheightSectionName, RegExp][]) {
      const url = Object.entries(links).find(([text]) => pattern.test(text))?.[1];
      if (!url) {
        if (component.sections[section]) removed++;
        delete component.sections[section];
        continue;
      }
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const content = await readSectionText();
      component.summary ??= await readPageSummary(name);
      const codeExamples = await page.evaluate(() =>
        Array.from(document.querySelectorAll('pre, code')).map((block) => block.textContent?.trim() || '').filter((text) => text.length > 10)
      );
      // An empty tab (Code embeds Storybook in an iframe) adds nothing for agents.
      if (!content) {
        delete component.sections[section];
        continue;
      }
      const existing = component.sections[section];
      component.sections[section] = {
        title: section.charAt(0).toUpperCase() + section.slice(1),
        content,
        images: existing?.images || [],
        codeExamples,
      };
      read++;
      found.push(`${section} ${content.length}`);
    }
    console.log(`[${index + 1}/${names.length}] ${name}: ${found.join(', ') || 'no sections'}`);
  }
} finally {
  await closeBrowser();
}

data.textRefreshedAt = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log(`zeroheight text: ${read} sections read, ${removed} misattributed sections removed${failed.length ? `, kept existing data for ${failed.length}: ${failed.join(', ')}` : ''}`);
