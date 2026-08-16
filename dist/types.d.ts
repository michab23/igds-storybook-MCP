export type StorybookFramework = 'angular' | 'react' | 'core-web';
export interface StorybookEntry {
    id: string;
    title: string;
    name: string;
    importPath: string;
    type: 'story' | 'docs';
    subtype?: 'story';
    tags: string[];
    exportName?: string;
    storiesImports?: string[];
    componentPath?: string;
}
export interface StorybookIndex {
    v: number;
    entries: Record<string, StorybookEntry>;
}
export interface ArgType {
    name: string;
    description?: string;
    defaultValue?: string;
    type?: string;
    control?: string;
    required?: boolean;
}
export interface ComponentProperty {
    name: string;
    type: string;
    attribute?: string;
    reflect?: boolean;
    defaultValue?: string;
}
export interface ComponentSource {
    className: string;
    tagName: string;
    properties: ComponentProperty[];
    states: string[];
    queries: {
        selector: string;
        name: string;
    }[];
    cssStyles: string[];
    constructorDefaults: Record<string, string>;
    isFormAssociated: boolean;
}
export interface ComponentDocs {
    framework: StorybookFramework;
    componentName: string;
    title: string;
    description?: string;
    argTypes: ArgType[];
    stories: StoryVariant[];
    source?: ComponentSource;
    url: string;
}
export interface StoryVariant {
    id: string;
    name: string;
    url: string;
    sourceCode?: string;
    args?: Record<string, any>;
    description?: string;
    renderedHtml?: string;
}
export interface StoryExample {
    framework: StorybookFramework;
    componentName: string;
    storyName: string;
    storyId: string;
    sourceCode?: string;
    args?: Record<string, any>;
    description?: string;
    url: string;
}
export interface ScrapedData {
    angular: Map<string, ComponentDocs>;
    react: Map<string, ComponentDocs>;
    'core-web': Map<string, ComponentDocs>;
}
export interface ZeroheightSection {
    title: string;
    content: string;
    images: string[];
    codeExamples: string[];
}
export interface ZeroheightComponent {
    name: string;
    slug: string;
    url: string;
    category: string;
    storybookCrossRef?: {
        angular?: string;
        react?: string;
        'core-web'?: string;
    };
    sections: {
        design?: ZeroheightSection;
        code?: ZeroheightSection;
        usage?: ZeroheightSection;
        accessibility?: ZeroheightSection;
    };
}
export interface ZeroheightPage {
    id: string;
    title: string;
    slug: string;
    url: string;
    type: 'component' | 'guide' | 'template' | 'brand' | 'designers' | 'developers' | 'marketers';
    content?: string;
    images?: string[];
}
export interface ZeroheightData {
    components: Record<string, ZeroheightComponent>;
    pages: Record<string, ZeroheightPage>;
    categories: string[];
    scrapedAt: string;
}
//# sourceMappingURL=types.d.ts.map