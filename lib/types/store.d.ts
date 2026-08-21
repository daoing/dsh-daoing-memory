/**
 * Memory store: durable SQLite persistence for the experience lifecycle,
 * use reports, diary, facts, extractions, recall telemetry, and the
 * append-only hash-chained ledger. Uses node:sqlite (DatabaseSync) so the
 * library runs with zero external services.
 * @module dsh-daoing-memory/store
 */
import type { DatabaseSync } from 'node:sqlite';
import type { ConcernEntry, ConcernStatus, ConcernTree, DiaryEntry, EvidenceRef, ExperienceSnapshot, ExperienceStatus, ExtractionRecord, FactEntry, LedgerBlock } from './types.ts';
/** Monotone store schema version. v1→v2 is an additive ALTER migration (see open()). */
export declare const MEMORY_SCHEMA_VERSION = 5;
/** Half-life (ms) of the recency weighting applied to verification samples. */
export declare const TRUST_HALF_LIFE_MS: number;
/** One concerns-table row (007 §2). */
export interface ConcernRowShape {
    id: string;
    parent_id: string | null;
    title: string;
    background: string;
    kind: string | null;
    status: string | null;
    ts: number;
    source_diary_ids: string;
    context: string;
    deleted: number;
}
/** One counted use report row. */
export interface UseReportRow {
    id: string;
    experienceId: string;
    revision: number;
    outcome: 'success' | 'fail';
    attribution: 'experience' | 'environment' | 'unrelated' | 'unknown';
    counted: 'alpha' | 'beta' | 'none';
    evidence: EvidenceRef | undefined;
    dedupeKey: string | undefined;
    ts: number;
}
/** One recall telemetry row. */
export interface RecallEventRow {
    id: string;
    ts: number;
    situation: string;
    injectedIds: string[];
    none: boolean;
    /** Active context scope of the recall ('' = unscoped, 006 §2). */
    context: string;
}
/** Hash one ledger block's content, chained to the previous hash. */
export declare function blockHash(ts: number, op: string, objectType: string, objectId: string, actor: string, payload: string, prevHash: string): string;
/** Tokenize into latin words + CJK bigrams so Chinese situations match. */
export declare function tokenize(text: string): string[];
/** Rough token estimate for injection budgeting (CJK-heavy text). */
export declare function estimateTokens(text: string): number;
/** The durable store behind the memory core. */
export declare class MemoryStore {
    private readonly db;
    /** @param db - an open node:sqlite DatabaseSync handle. */
    constructor(db: DatabaseSync);
    /** Insert or update one experience revision row. */
    upsertExperience(s: ExperienceSnapshot): void;
    /** Read one experience revision. */
    getExperience(familyId: string, revision: number): ExperienceSnapshot | undefined;
    /** The active (non-superseded, non-deleted) revision of a family, if any. */
    getActiveRevision(familyId: string): ExperienceSnapshot | undefined;
    /** All revisions of one family, oldest first. */
    getFamily(familyId: string): ExperienceSnapshot[];
    /** List experience revisions by filter; live-ish first, best trust first. */
    listExperiences(filter: {
        status?: ExperienceStatus;
        kind?: string;
        family?: string;
        context?: string;
    }): ExperienceSnapshot[];
    /**
     * Recall candidates: token overlap against situation+gist+limits of the given
     * statuses, best overlap first. An optional context scopes the pool: only
     * same-context or globally-shared (global_flag) revisions qualify (006 §2).
     */
    recallCandidates(queryTokens: Set<string>, topK: number, opts?: {
        statuses?: ExperienceStatus[];
        context?: string;
    }): {
        snapshot: ExperienceSnapshot;
        score: number;
    }[];
    /**
     * Near-duplicate detection for the information-gain gate (007 flow-log fix).
     * Unlike recallCandidates it scores on gist+situation only (the lesson's
     * identity), so identical lessons with divergent limits/paths still match.
     * Returns the single best match across the requested statuses, or undefined.
     */
    findNearDuplicate(queryTokens: Set<string>, statuses: ExperienceStatus[]): {
        snapshot: ExperienceSnapshot;
        score: number;
    } | undefined;
    /** Count live revisions in one family (capacity budget). */
    countFamilyActive(familyTag: string): number;
    /** Mark one revision deleted (human delete tombstone). */
    deleteFamily(familyId: string): void;
    /**
     * Insert one counted report; a repeated (family, revision, dedupeKey)
     * returns false instead of double-counting (idempotent use).
     */
    insertReport(report: UseReportRow): boolean;
    /** Recent counted reports of one revision, newest first. */
    reportsFor(familyId: string, revision: number, limit: number): UseReportRow[];
    /** Every report row (export). */
    allReports(): UseReportRow[];
    /** Recency-weighted alpha/beta over counted reports. */
    weightedTrust(familyId: string, revision: number, now: number): number;
    /** Append one block, chaining the hash; returns the stored block. */
    appendLedger(block: Omit<LedgerBlock, 'seq' | 'hash'>): LedgerBlock;
    /** The newest block's hash ('' when the ledger is empty). */
    ledgerHead(): string;
    /** Ledger blocks, newest first, optionally filtered. */
    ledgerQuery(filter: {
        objectType?: string;
        objectId?: string;
        op?: string;
        limit: number;
        offset?: number;
        seqFrom?: number;
        seqTo?: number;
    }): LedgerBlock[];
    /** Shared WHERE-builder for the ledger query and its filtered count. */
    private ledgerFilterClauses;
    /** Count ledger blocks matching a filter (for pagination, 007 §2). */
    ledgerQueryCount(filter: {
        objectType?: string;
        objectId?: string;
        op?: string;
        seqFrom?: number;
        seqTo?: number;
    }): number;
    /** The complete ledger, oldest first (integrity checks + export). */
    ledgerAll(): LedgerBlock[];
    /** Total ledger block count. */
    ledgerCount(): number;
    /** Append one diary entry (append-only layer). */
    insertDiary(entry: DiaryEntry): void;
    /** Diary entries, newest first. */
    listDiary(limit: number, offset: number, onlyUnextracted: boolean): DiaryEntry[];
    /** Unextracted entries, oldest first (the extraction window). */
    unextractedDiary(): DiaryEntry[];
    /** Mark diary entries extracted. */
    markDiaryExtracted(ids: string[]): void;
    /** One diary entry by id. */
    getDiary(id: string): DiaryEntry | undefined;
    /** Several diary entries by id, preserving the requested order (008 Path A: fact→diary provenance). */
    getDiaryByIds(ids: string[]): DiaryEntry[];
    /** Diary counters. */
    diaryCounts(): {
        total: number;
        unextracted: number;
    };
    /** Insert one fact version. */
    insertFact(fact: FactEntry): void;
    /** Update one fact version in place (locking, tombstones, supersede links). */
    updateFact(fact: FactEntry): void;
    /** The current (open valid-time window, not deleted) version of one slot. */
    currentFact(category: string, factKey: string): FactEntry | undefined;
    /** One fact version by id. */
    getFact(id: string): FactEntry | undefined;
    /** Shared WHERE for fact filters (008 §3: reused by list + count). */
    private factFilterClauses;
    /** Fact versions by filter (008 §3: server-side pagination). */
    listFacts(filter: {
        category?: string;
        includeHistory: boolean;
    }, limit: number, offset: number): FactEntry[];
    /** Count of facts matching the filter (008 §3: pagination total). */
    factFilteredCount(filter: {
        category?: string;
        includeHistory: boolean;
    }): number;
    /** All fact versions including tombstones (export). */
    allFacts(): FactEntry[];
    /** Fact counters. */
    factCounts(): {
        total: number;
        current: number;
        locked: number;
        conflictPending: number;
    };
    rowToConcern(row: ConcernRowShape): ConcernEntry;
    /** Insert one concerns row (top-level or a discussion mention). */
    insertConcern(c: ConcernEntry): void;
    /**
     * Top-level concerns (newest first) each with its discussion loop (oldest
     * first). Optional kind/status filter + limit/offset pagination over the
     * top-level rows; a mention set is attached for every returned top-level.
     */
    listConcernTrees(filter: {
        kind?: string;
        status?: string;
    }, limit?: number, offset?: number): ConcernTree[];
    /** Count top-level (non-deleted) concerns matching the optional kind/status filter. */
    listConcernsCount(filter: {
        kind?: string;
        status?: string;
    }): number;
    /** Update a top-level concern's lifecycle status. */
    setConcernStatus(id: string, status: ConcernStatus): void;
    /** Tombstone a concern and its whole discussion loop (human-only cleanup). */
    deleteConcernSubtree(id: string): void;
    /** Record one extraction run. */
    insertExtraction(record: ExtractionRecord): void;
    /** Extraction runs, newest first (008 §3: server-side pagination). */
    listExtractions(limit: number, offset: number): ExtractionRecord[];
    /** Total extraction runs (008 §3: pagination count). */
    extractionCount(): number;
    /** Last extraction ts (cadence gate). */
    lastExtractionTs(): number;
    /** Record one consolidation run (which experiences merged into which). */
    recordConsolidation(record: {
        id: string;
        ts: number;
        mergedIds: string[];
        producedId: string;
        note: string;
    }): void;
    /** Last consolidation ts (interval cadence gate; 0 = never consolidated). */
    lastConsolidationTs(): number;
    /** Non-deleted experiences created strictly after `ts` (new material since last consolidation). */
    countExperiencesSince(ts: number): number;
    /** Last deletion-feedback summarization ts (0 = never). Stored in memory_meta. */
    lastDeletionFeedbackTs(): number;
    /** Record the timestamp of a deletion-feedback summarization run. */
    setLastDeletionFeedbackTs(ts: number): void;
    /** Count experience deletions (ledger op='delete', objectType='experience') since a given ts. */
    countDeletionsSince(ts: number): number;
    /** Get the deletion ledger blocks since a given ts (for LLM summarization input). */
    getDeletionRecordsSince(ts: number, limit?: number): Array<{
        seq: number;
        ts: number;
        objectId: string;
        reason: string;
        gist: string;
    }>;
    /** Find the active (non-deleted) experience by family name. Returns the latest revision. */
    findExperienceByFamily(family: string): ExperienceSnapshot | undefined;
    /** Archive a set of experiences by family_id (leave recall; recoverable — never hard-deleted autonomously). */
    archiveExperienceIds(ids: string[], ts: number): void;
    /** Record one recall event. */
    insertRecallEvent(event: RecallEventRow): void;
    /** Recall telemetry counters. */
    recallCounts(): {
        events: number;
        negative: number;
    };
    /** All recall events (export). */
    allRecallEvents(): RecallEventRow[];
    private rowToExperience;
    private rowToReport;
    private rowToLedger;
    private rowToDiary;
    private rowToFact;
}
//# sourceMappingURL=store.d.ts.map