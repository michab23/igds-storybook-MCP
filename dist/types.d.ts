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
    /** Legal values for a closed vocabulary, from Storybook's argTypes options or a union. */
    options?: string[];
}
export interface ComponentProperty {
    name: string;
    type: string;
    attribute?: string;
    reflect?: boolean;
    defaultValue?: string;
    description?: string;
    required?: boolean;
}
export interface ComponentEvent {
    name: string;
    description?: string;
    type?: string;
}
export interface ComponentSlot {
    name: string;
    description?: string;
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
    events?: ComponentEvent[];
    slots?: ComponentSlot[];
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
export type ZeroheightSectionName = 'design' | 'code' | 'usage' | 'accessibility';
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