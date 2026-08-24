import { StorybookFramework } from '../types.js';
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
/**
 * Note the absence of `cssStyles`: component CSS was 74% of the Angular source payload and
 * is of no use to an agent writing markup, so it is no longer extracted at all.
 */
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
    events: ComponentEvent[];
    slots: ComponentSlot[];
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