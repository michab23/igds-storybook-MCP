/** Every chunk reachable from the entry module, fetched once each. */
export declare function fetchAllChunks(entryCode: string, assetsBase: string, concurrency?: number): Promise<Map<string, string>>;
export declare function extractTagTable(codes: Iterable<string>): Record<string, string>;
/** Slot names per tag. `default` stands for the unnamed slot; dynamic names are skipped. */
export declare function extractSlots(code: string, tags: Record<string, string>): Record<string, string[]>;
export interface SlotsFile {
    fetchedAt: string;
    slots: Record<string, string[]>;
}
export declare const SLOTS_FILE: string;
export declare function writeSlots(entryCode: string, assetsBase: string): Promise<SlotsFile>;
//# sourceMappingURL=slots.d.ts.map