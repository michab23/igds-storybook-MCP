import { StorybookFramework, StoryVariant } from '../types.js';
export declare function closeBrowser(): Promise<void>;
export declare function scrapeStoryExamples(framework: StorybookFramework, componentName: string, stories: StoryVariant[]): Promise<StoryVariant[]>;
export declare function scrapeAllStoriesForComponent(framework: StorybookFramework, componentName: string, storyIds: string[]): Promise<StoryVariant[]>;
//# sourceMappingURL=story-scraper.d.ts.map