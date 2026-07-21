import { chromium } from 'playwright';
const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';
let browser = null;
async function getBrowser() {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}
export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}
export async function scrapeStoryExamples(framework, componentName, stories) {
    const b = await getBrowser();
    const context = await b.newContext();
    const page = await context.newPage();
    const enrichedStories = [];
    for (const story of stories) {
        try {
            const enriched = await scrapeStory(page, framework, story);
            enrichedStories.push(enriched);
        }
        catch (error) {
            console.error(`  Failed to scrape story ${story.id}:`, error);
            enrichedStories.push(story);
        }
    }
    await page.close();
    return enrichedStories;
}
async function scrapeStory(page, framework, story) {
    const url = `${BASE_URL}/${framework}/iframe.html?id=${story.id}&viewMode=story`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#storybook-root', { timeout: 10000 });
    await page.waitForTimeout(1500);
    // Extract rendered HTML
    const renderedHtml = await page.evaluate(() => {
        const root = document.querySelector('#storybook-root');
        return root ? root.innerHTML : undefined;
    });
    // Try to get source code by clicking "Show code" button
    let sourceCode;
    try {
        const showCodeBtn = page.locator('.docblock-code-toggle');
        if (await showCodeBtn.isVisible({ timeout: 2000 })) {
            await showCodeBtn.click();
            await page.waitForTimeout(500);
            sourceCode = await page.evaluate(() => {
                const sourceBlock = document.querySelector('.docblock-source');
                if (sourceBlock) {
                    const code = sourceBlock.querySelector('code, pre');
                    return code?.textContent || sourceBlock.textContent || undefined;
                }
                return undefined;
            });
        }
    }
    catch {
        // Source code not available
    }
    // Extract args from controls panel (if visible)
    const args = await page.evaluate(() => {
        const result = {};
        // Try to get from storybook globals
        const storyStore = window.__STORYBOOK_STORY_STORE__;
        if (storyStore?.getState) {
            const state = storyStore.getState();
            const storyData = state?.stories?.[document.querySelector('[data-story-id]')?.getAttribute('data-story-id') || ''];
            if (storyData?.args) {
                return storyData.args;
            }
        }
        return result;
    });
    return {
        ...story,
        sourceCode,
        args: Object.keys(args).length > 0 ? args : undefined,
        renderedHtml,
        url: `${BASE_URL}/${framework}/?path=/story/${story.id}`,
    };
}
export async function scrapeAllStoriesForComponent(framework, componentName, storyIds) {
    const stories = storyIds.map(id => ({
        id,
        name: id.split('--').pop() || id,
        url: `${BASE_URL}/${framework}/?path=/story/${id}`,
    }));
    return scrapeStoryExamples(framework, componentName, stories);
}
//# sourceMappingURL=story-scraper.js.map