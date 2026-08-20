/**
 * Memory library Typert Remote service: the wire face over MemoryCore.
 * Every method takes the calling Agent first (Typert wire identity); the
 * library itself is process-global — one memory shared by every session.
 * Human operations carry an audited reason and land in the ledger.
 * @module dsh-daoing-memory/service
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { MemoryCore } from './core.ts';
import type { ConcernTree, ConsolidateRequest, ConsolidateResult, DiaryAppendRequest, DiaryAppendResult, DiaryEntry, ExperienceListFilter, ExperienceSnapshot, ExtractionRecord, ExtractFactsRequest, ExtractFactsResult, FactEntry, HumanAddExperienceRequest, HumanAddFactRequest, HumanAckDiaryRequest, HumanConfirmFactRequest, HumanDeleteConcernRequest, HumanDeleteExperienceRequest, HumanDeleteFactRequest, HumanEditExperienceRequest, HumanEditFactRequest, HumanPinRequest, HumanReleaseColdRequest, HumanSetConcernStatusRequest, IngestRequest, IngestResult, LedgerBlock, LedgerIntegrityResult, LedgerQueryRequest, MemoryExport, MemoryStats, MemoryWorkbenchInfo, RecallExperiencesRequest, RecallExperiencesResult, RefineExperienceRequest, RefineExperienceResult, ReportUseRequest, ReportUseResult, ReviseExperienceRequest, RollbackExperienceRequest, VerifyShadowRequest, VerifyShadowResult } from './types.ts';
/**
 * Remote face of the memory library. All methods delegate to the core; the
 * core carries the 生·用·修·记 mechanism semantics.
 */
export declare class MemoryService extends TypertRemoteService {
    private readonly core;
    private readonly workbench;
    /** @param ctx - host context. */
    /** @param core - the ctx-free memory core. */
    /** @param workbench - descriptor the browser half matches workspaces against. */
    constructor(ctx: Context, core: MemoryCore, workbench: () => MemoryWorkbenchInfo);
    /** 生: refine a completed trajectory into an experience candidate. */
    refine(agent: Agent, request: RefineExperienceRequest): RefineExperienceResult;
    /** 用: recall + adjudication + injection budget + negative channel. */
    recall(agent: Agent, request: RecallExperiencesRequest): RecallExperiencesResult;
    /** 用·验: report one use outcome with attribution (V0 verification). */
    report(agent: Agent, request: ReportUseRequest): ReportUseResult;
    /** 摄取归一: source-agnostic intake; drafts become earned candidates (006 §1). */
    ingest(agent: Agent, request: IngestRequest): IngestResult;
    /** 修: propose a revised draft for a challenged experience. */
    revise(agent: Agent, request: ReviseExperienceRequest): ExperienceSnapshot;
    /** V1 controlled re-enactment: shadow replay verification for a draft. */
    verifyShadow(agent: Agent, request: VerifyShadowRequest): VerifyShadowResult;
    /** Restore a superseded revision to live (rollback). */
    rollback(agent: Agent, request: RollbackExperienceRequest): ExperienceSnapshot;
    /** Read one experience revision (active when revision omitted). */
    get(agent: Agent, id: string, revision?: number): ExperienceSnapshot | undefined;
    /** List experience revisions by filter. */
    list(agent: Agent, filter: ExperienceListFilter): ExperienceSnapshot[];
    /** Every revision of one family (superseded index for rollback). */
    family(agent: Agent, id: string): ExperienceSnapshot[];
    /** 记: append one diary entry; signals the extraction duty when due. */
    appendDiary(agent: Agent, request: DiaryAppendRequest): DiaryAppendResult;
    /** 上升通道: apply extracted facts over the pending diary window. */
    extract(agent: Agent, request: ExtractFactsRequest): ExtractFactsResult;
    /** Diary timeline for the workbench (007 §2: server-side pagination, newest first). */
    listDiary(agent: Agent, limit: number, offset: number, onlyUnextracted: boolean): DiaryEntry[];
    /** Several diary entries by id (008 Path A: fact→diary provenance). */
    getDiaryByIds(agent: Agent, ids: string[]): DiaryEntry[];
    /** Fact versions for the workbench (008 §3: server-side pagination). */
    listFacts(agent: Agent, category: string, includeHistory: boolean, limit: number, offset: number): FactEntry[];
    /** Count facts matching the workbench filter (008 §3: pagination total). */
    listFactsCount(agent: Agent, category: string, includeHistory: boolean): number;
    /** 关心事项 trees (top-level + discussion loop) for the workbench (010 §D: filter + pagination). */
    listConcerns(agent: Agent, kind: string, status: string, limit: number, offset: number): ConcernTree[];
    /** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
    listConcernsCount(agent: Agent, kind: string, status: string): number;
    /** 010 §F: compact profile + open-concern snapshot for the AI's context (host-side). */
    profileSnapshot(): string;
    /** Extraction runs for the workbench (008 §3: server-side pagination). */
    extractionLog(agent: Agent, limit: number, offset: number): ExtractionRecord[];
    /** Total extraction runs (008 §3: pagination total). */
    extractionLogCount(agent: Agent): number;
    /** Apply a consolidation run: merge related experiences (008 §1). */
    consolidate(agent: Agent, request: ConsolidateRequest): ConsolidateResult;
    /** Whether a consolidation run is due (interval cadence; 008 §1). */
    consolidationDue(agent: Agent): {
        due: boolean;
        lastTs: number;
        newSince: number;
        hoursSince: number;
    };
    /** Ledger query (newest first, filtered). */
    ledgerQuery(agent: Agent, request: LedgerQueryRequest): LedgerBlock[];
    /** Count ledger blocks matching a filter (007 §2 pagination). */
    ledgerQueryCount(agent: Agent, request: LedgerQueryRequest): number;
    /** Verify the ledger hash chain end to end. */
    verifyLedger(agent: Agent): LedgerIntegrityResult;
    /** Aggregated library statistics. */
    stats(agent: Agent): MemoryStats;
    /** Workbench descriptor (workspace matching + config view). */
    workbenchInfo(agent: Agent): MemoryWorkbenchInfo;
    /** Full library export for experiments and migration. */
    exportLibrary(agent: Agent): MemoryExport;
    /**
     * Host-only ledger integrity check (no wire identity needed): the package
     * invariant companion asserts the hash chain through this accessor.
     * @returns the chain verification outcome.
     */
    verifyLedgerIntegrity(): LedgerIntegrityResult;
    /** Human pin/unpin. */
    humanPin(agent: Agent, request: HumanPinRequest): ExperienceSnapshot;
    /** Human delete (tombstone + ledger fingerprint). */
    humanDeleteExperience(agent: Agent, request: HumanDeleteExperienceRequest): {
        deleted: true;
    };
    /** Human edit of the active revision. */
    humanEditExperience(agent: Agent, request: HumanEditExperienceRequest): ExperienceSnapshot;
    /** Human injection in the fixed experience format. */
    humanAddExperience(agent: Agent, request: HumanAddExperienceRequest): ExperienceSnapshot;
    /** Human authority (V2): promote a candidate straight to live. */
    humanPromote(agent: Agent, id: string, reason: string): ExperienceSnapshot;
    /** Human re-release of a cold-palace revision back to candidate (006 §3.2). */
    humanReleaseCold(agent: Agent, request: HumanReleaseColdRequest): ExperienceSnapshot;
    /** Human rollback. */
    humanRollback(agent: Agent, request: RollbackExperienceRequest): ExperienceSnapshot;
    /** Human fact add. */
    humanAddFact(agent: Agent, request: HumanAddFactRequest): FactEntry;
    /** Human fact edit. */
    humanEditFact(agent: Agent, request: HumanEditFactRequest): FactEntry;
    /** Human fact delete (tombstone). */
    humanDeleteFact(agent: Agent, request: HumanDeleteFactRequest): {
        deleted: true;
    };
    /** Human fact confirmation (lock/unlock). */
    humanConfirmFact(agent: Agent, request: HumanConfirmFactRequest): FactEntry;
    /** Human acknowledgement of a pending diary entry (reviewed, no fact extracted). */
    humanAckDiary(agent: Agent, request: HumanAckDiaryRequest): DiaryEntry;
    /** Human lifecycle change of a top-level concern (007 §2.4). */
    humanSetConcernStatus(agent: Agent, request: HumanSetConcernStatusRequest): {
        ok: true;
    };
    /** Human delete of a concern subtree (007 §2.4). */
    humanDeleteConcern(agent: Agent, request: HumanDeleteConcernRequest): {
        deleted: true;
    };
}
//# sourceMappingURL=service.d.ts.map