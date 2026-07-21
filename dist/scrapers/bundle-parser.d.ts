import { StorybookFramework } from '../types.js';
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
    baseClass: string;
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
export interface ParsedBundle {
    framework: StorybookFramework;
    components: Map<string, ComponentSource>;
    rawBundle: string;
}
export declare function fetchBundle(framework: StorybookFramework): Promise<string>;
export declare function parseBundle(framework: StorybookFramework, bundleCode: string): ParsedBundle;
export declare function getComponentSource(parsed: ParsedBundle, componentName: string): ComponentSource | undefined;
export declare function listComponents(parsed: ParsedBundle): string[];
//# sourceMappingURL=bundle-parser.d.ts.map