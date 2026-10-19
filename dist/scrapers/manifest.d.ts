export interface ManifestParameter {
    name: string;
    optional?: boolean;
    type?: {
        text?: string;
    };
}
export interface ManifestMember {
    kind: string;
    name: string;
    privacy?: string;
    static?: boolean;
    parameters?: ManifestParameter[];
    return?: {
        type?: {
            text?: string;
        };
    };
    inheritedFrom?: {
        name: string;
    };
}
export interface ManifestModule {
    kind: string;
    path: string;
    declarations?: {
        kind: string;
        name: string;
        members?: ManifestMember[];
    }[];
}
export declare function extractManifestModules(bundleCode: string): ManifestModule[] | null;
export interface MethodSignature {
    name: string;
    /** e.g. `focusCellByAddress(row: number, cell: number, setFocusOnInput?: boolean)` */
    signature: string;
}
/** Reduced form committed to the repo: per class, its public instance methods. */
export interface ManifestMethods {
    fetchedAt: string;
    classes: Record<string, {
        path: string;
        methods: MethodSignature[];
    }>;
}
export declare function methodsFromManifest(modules: ManifestModule[], fetchedAt?: string): ManifestMethods;
export declare const MANIFEST_FILE: string;
export declare function writeManifestMethods(bundleCode: string): number;
//# sourceMappingURL=manifest.d.ts.map