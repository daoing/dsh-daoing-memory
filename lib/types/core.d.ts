/**
 * Memory core: the 生·用·修·记 mechanisms over the durable store. Pure and
 * ctx-free. Implements 005's P0/P1 semantics:
 *
 * - 生 refine: complexity gate + information-gain gate + mandatory evidence
 *   pointers; positive and negative candidates symmetric.
 * - 用 recall: recall → adjudication (limits vs situation conflicts,
 *   direct/reference/clue/not-applicable) → injection budget → explicit
 *   negative channel.
 * - 用·验 report: Beta posterior (alpha+1)/(alpha+beta+2) with recency
 *   weighting; four-way attribution with objective-evidence priority and
 *   no-count on insufficient signal; idempotent reports.
 * - 修 revise: challenged quarantine (immediately out of recall), draft
 *   proposal, adoption only after one successful use or shadow replay,
 *   superseded read-only index with rollback.
 * - 记 diary/facts: append-only diary, cadence-driven extraction with source
 *   pointers, bi-temporal facts with conflict arbitration and human gates.
 * - Ledger: append-only hash-chained event sourcing for every mutation,
 *   including every human operation.
 *
 * @module dsh-daoing-memory/core
 */
import type { ConcernTree, ConsolidateRequest, ConsolidateResult, DiaryAppendRequest, DiaryAppendResult, DiaryEntry, ExperienceListFilter, ExperienceSnapshot, ExperienceStatus, ExtractionRecord, ExtractFactsRequest, ExtractFactsResult, FactEntry, EvolveExperienceRequest, HumanAddExperienceRequest, HumanAddFactRequest, HumanAckDiaryRequest, HumanArchiveExperienceRequest, HumanConfirmFactRequest, HumanDeleteConcernRequest, HumanDeleteExperienceRequest, HumanDeleteFactRequest, HumanEditExperienceRequest, HumanEditFactRequest, HumanPinRequest, HumanSetConcernStatusRequest, HumanReleaseColdRequest, IngestRequest, IngestResult, LedgerIntegrityResult, LedgerQueryRequest, MemoryExport, MemoryStats, RecallExperiencesRequest, RecallExperiencesResult, RefineExperienceRequest, RefineExperienceResult, ReportUseRequest, ReportUseResult, ReviseExperienceRequest, RollbackExperienceRequest, VerifyShadowRequest, VerifyShadowResult, SkillArtifact, SkillForm, SkillStatus, ReviewSkillRequest, PublishSkillRequest } from './types.ts';
import { MemoryStore } from './store.ts';
/** Tunable mechanism parameters, all overridable from the plugin config. */
export interface MemoryCoreConfig {
    /** Diary entries that trigger one extraction run. */
    diaryExtractEvery: number;
    /** Minimum hours between extraction runs. */
    diaryExtractIntervalHours: number;
    /** Default recall candidate count. */
    recallTopK: number;
    /** Injection budget in estimated tokens (≈5% of a typical context). */
    injectionBudgetTokens: number;
    /** Consecutive experience-attributed failures that quarantine a live experience. */
    challengeConsecutiveFails: number;
    /** Window size for the failure-rate challenge rule. */
    challengeWindow: number;
    /** Failure rate within the window that challenges a live experience. */
    challengeWindowFailRate: number;
    /** Live-revision cap per family tag (capacity budget). */
    familyLiveCap: number;
    /** Complexity gate: token threshold. */
    complexityTokenGate: number;
    /** Complexity gate: step threshold. */
    complexityStepGate: number;
    /** Information-gain gate: overlap at/above this rejects a near-duplicate. */
    duplicateOverlapGate: number;
    /** Minimum relevance score for injection. */
    recallFloorScore: number;
    /** Shadow replay agreement required to adopt a draft. */
    shadowPassRate: number;
    /** Trust floor for human-injected experiences (Beta alpha/beta). */
    humanFloorAlpha: number;
    /** Trust floor for human-injected experiences (Beta alpha/beta). */
    humanFloorBeta: number;
    /** Trust floor kept for pinned experiences. */
    pinnedTrustFloor: number;
    /** Candidate probe channel: max trials offered per recall (006 §3.1). */
    candidateTrialTopK: number;
    /** Candidate probe channel: minimum relevance to offer a trial (006 §3.1). */
    candidateTrialFloorScore: number;
    /** Consolidation: minimum NEW experiences since the last consolidation before one is due (008 §1). */
    consolidateEveryNew: number;
    /** Consolidation: minimum HOURS elapsed since the last consolidation (interval, not a fixed clock point) (008 §1). */
    consolidateIntervalHours: number;
    /** Deletion-feedback summarization: minimum HOURS between LLM summarization runs. */
    deletionFeedbackIntervalHours: number;
    /** Deletion-feedback summarization: minimum new deletions since last run to trigger. */
    deletionFeedbackMinDeletions: number;
}
/** The mechanism defaults (005 mapping documented in the README). */
export declare const DEFAULT_CORE_CONFIG: MemoryCoreConfig;
/** One actor label for the ledger. */
export type MemoryActor = string;
/** The memory core: stateless over the injected store. */
export declare class MemoryCore {
    private readonly store;
    readonly config: MemoryCoreConfig;
    /** @param store - the durable SQLite store. */
    /** @param config - resolved mechanism parameters. */
    constructor(store: MemoryStore, config: MemoryCoreConfig);
    private ledger;
    /** 生: refine one completed trajectory into a candidate (dual gate). */
    refine(request: RefineExperienceRequest, actor: MemoryActor, opts?: {
        dedup?: boolean;
    }): RefineExperienceResult;
    /**
     * 摄取归一: source-agnostic intake. Every extracted draft becomes an earned
     * candidate carrying provenance (sourceType + sourceRef), the source-authority
     * prior, and the declared context scope. Candidates never recall until verified.
     */
    ingest(request: IngestRequest, actor: MemoryActor, opts?: {
        dedup?: boolean;
    }): IngestResult;
    /** 用: recall → scope → adjudicate → budget → inject, plus the candidate probe channel. */
    recall(request: RecallExperiencesRequest, actor: MemoryActor): RecallExperiencesResult;
    /** 用·验: one use outcome → Beta update, attribution, quarantine, gates. */
    report(request: ReportUseRequest, actor: MemoryActor): ReportUseResult;
    /** Windowed challenge rule: consecutive fails or window failure rate. */
    private shouldChallenge;
    /** Close the parent revision as superseded after a draft adoption. */
    private supersedeParent;
    /** Capacity budget: archive the lowest economic value when a family overflows. */
    private enforceFamilyCap;
    /** 修: propose a revised draft for a challenged experience. */
    revise(request: ReviseExperienceRequest, actor: MemoryActor): ExperienceSnapshot;
    /** V1 controlled re-enactment: replay historical samples against a draft. */
    verifyShadow(request: VerifyShadowRequest, actor: MemoryActor): VerifyShadowResult;
    /** Roll the family back to a superseded revision. */
    rollback(request: RollbackExperienceRequest, actor: MemoryActor): ExperienceSnapshot;
    /** One experience revision. */
    get(id: string, revision?: number): ExperienceSnapshot | undefined;
    /** Experience revisions by filter. */
    list(filter: ExperienceListFilter): ExperienceSnapshot[];
    /** Every revision of one family (the rollback picker's data). */
    family(id: string): ExperienceSnapshot[];
    /** 记: append one diary entry; signals when the extraction cadence is due. */
    appendDiary(request: DiaryAppendRequest, actor: MemoryActor): DiaryAppendResult;
    /** 上升通道: apply extracted facts over the pending diary window. */
    extract(request: ExtractFactsRequest, actor: MemoryActor, trigger?: 'cadence' | 'manual'): ExtractFactsResult;
    /** Validate one proposal's shape and source pointers. */
    private validateProposal;
    /** Diary entries for the workbench timeline. */
    listDiary(limit: number, offset: number, onlyUnextracted: boolean): DiaryEntry[];
    /** Several diary entries by id (008 Path A: fact→diary provenance). */
    getDiaryByIds(ids: string[]): DiaryEntry[];
    /** Fact versions for the workbench (008 §3: server-side pagination). */
    listFacts(category: string | undefined, includeHistory: boolean, limit: number, offset: number): FactEntry[];
    /** Count of facts matching the workbench filter (008 §3: pagination total). */
    listFactsCount(category: string | undefined, includeHistory: boolean): number;
    /** 关心事项 (007 §2 / 010 §D): top-level concerns + loop, kind/status filter + pagination. */
    listConcerns(kind: string | undefined, status: string | undefined, limit?: number, offset?: number): ConcernTree[];
    /** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
    listConcernsCount(kind: string | undefined, status: string | undefined): number;
    /**
     * 010 §F: a compact runtime snapshot for the AI's context — the profile (the
     * AI's perception of the user) plus still-open concern memos it may remind
     * the user about. Empty string when there is nothing yet.
     */
    profileSnapshot(): string;
    /** Extraction runs, newest first (008 §3: server-side pagination). */
    extractionLog(limit: number, offset: number): ExtractionRecord[];
    /** Total extraction runs (008 §3: pagination total). */
    extractionLogCount(): number;
    /**
     * Whether a consolidation run is due. The period is measured as a DURATION
     * since the last consolidation (interval), not a fixed clock time: a run is
     * due once (a) enough NEW experiences have accumulated since the last run
     * AND (b) enough hours have elapsed since it.
     */
    consolidationDue(): {
        due: boolean;
        lastTs: number;
        newSince: number;
        hoursSince: number;
    };
    /**
     * Apply a consolidation run: for each merge, create one consolidated
     * experience and archive the sources (they leave recall but stay recoverable
     * — consolidation never hard-deletes). Every step is ledgered.
     */
    consolidate(request: ConsolidateRequest, actor: string): ConsolidateResult;
    /** Family id for the auto-generated extraction-feedback experience. */
    static readonly DELETION_FEEDBACK_FAMILY = "extraction-feedback";
    /**
     * Check whether a deletion-feedback summarization run is due.
     * Conditions: enough new deletions since last run AND enough time elapsed.
     * @returns { due, lastTs, newDeletions, hoursSince }
     */
    deletionFeedbackDue(): {
        due: boolean;
        lastTs: number;
        newDeletions: number;
        hoursSince: number;
    };
    /**
     * Apply an LLM-generated deletion-feedback summary as an extraction-feedback
     * experience. If one already exists, it is revised in place (new revision);
     * otherwise a new candidate experience is created.
     * @param summary - the LLM-generated summary text (gist + reasoning).
     * @param actor - who triggered the summarization ('system').
     * @returns the upserted experience snapshot.
     */
    applyDeletionFeedback(summary: string, actor: string): ExperienceSnapshot;
    /**
     * Get the current extraction-feedback experience (if any) for injection into
     * the extraction prompt.
     */
    getDeletionFeedback(): ExperienceSnapshot | undefined;
    /**
     * Create a skill artifact draft from LLM-generated content.
     * @param experienceId - parent experience family_id.
     * @param form - output form (skill_md or script_mjs).
     * @param content - the LLM-generated skill/script content.
     * @param draftPath - file path where the draft is saved.
     * @param actor - who triggered the generation.
     * @returns the created skill artifact.
     */
    createSkillDraft(experienceId: string, form: SkillForm, content: string, draftPath: string, actor: string): SkillArtifact;
    /**
     * Review a skill artifact: approve or reject.
     */
    reviewSkill(request: ReviewSkillRequest, actor: string): SkillArtifact;
    /**
     * Publish a skill artifact: copy draft to $DSH_HOME/skills/ and mark as published.
     * The actual file copy is done by the service layer; this method updates the DB record.
     */
    publishSkill(request: PublishSkillRequest, publishedPath: string, actor: string): SkillArtifact;
    /** List skill artifacts, optionally filtered. */
    listSkillArtifacts(filter?: {
        parentExperienceId?: string;
        status?: SkillStatus;
    }): SkillArtifact[];
    /** Get a single skill artifact. */
    getSkillArtifact(id: string): SkillArtifact | undefined;
    /**
     * Check if an experience is a candidate for skill conversion.
     * Criteria: live status, enough recall events, complex path (≥3 steps).
     */
    isSkillCandidate(experienceId: string): boolean;
    /** Human pin/unpin: pinned cards keep the trust floor and escape budgets. */
    humanPin(request: HumanPinRequest, actor: MemoryActor): ExperienceSnapshot;
    /** Human delete: tombstone the family; the ledger keeps the fingerprint. */
    humanDeleteExperience(request: HumanDeleteExperienceRequest, actor: MemoryActor): void;
    /**
     * Human archive: move an experience to archived status. Unlike delete, the
     * data is preserved (recoverable via deep lookup) but removed from active
     * recall. This is the only way to retire system-managed experiences
     * (e.g. extraction-feedback).
     */
    humanArchiveExperience(request: HumanArchiveExperienceRequest, actor: MemoryActor): void;
    /** Human edit: rewrite fields of the active revision in place. */
    humanEditExperience(request: HumanEditExperienceRequest, actor: MemoryActor): ExperienceSnapshot;
    /** Human injection: fixed format, source=human, trust floor, directly live. */
    humanAddExperience(request: HumanAddExperienceRequest, actor: MemoryActor): ExperienceSnapshot;
    /** Human authority (V2): promote a candidate straight to live. */
    humanPromote(id: string, reason: string, actor: MemoryActor): ExperienceSnapshot;
    /** Human re-release (006 §3.2): move a cold-palace revision back to candidate. */
    humanReleaseCold(request: HumanReleaseColdRequest, actor: MemoryActor): ExperienceSnapshot;
    /** Record a corroboration ledger event for a rejected near-duplicate.
     *  The LLM semantic-dedup path routes a DUPLICATE verdict here so the
     *  ledger stays consistent with the mechanical-gate path (refine/ingest). */
    markCorroborate(nearId: string, actor: MemoryActor, req: {
        family: string;
        gist: string;
    }, via: string, score: number): void;
    /** Near-duplicate candidate set for the LLM semantic-dedup prefilter. The
     *  service layer asks here for the mechanical word-overlap top-K before it
     *  runs the LLM verdict; the coarse hit is only a candidate pool, not a gate. */
    nearDuplicateCandidates(gist: string, situation: string[], statuses: ExperienceStatus[], topK: number): {
        snapshot: ExperienceSnapshot;
        score: number;
    }[];
    /** Human-approved self-growth: merge new evidence into a live, human-approved
     *  experience as an incremental new revision (revision+1, parent superseded).
     *  Only approvedBy='human' + status='live' may evolve; agent/system-approved
     *  and non-live (challenged/cold/archived) are rejected. */
    evolve(request: EvolveExperienceRequest, actor: MemoryActor): ExperienceSnapshot;
    /** Human acknowledgement of a pending diary entry: reviewed, no fact extracted. */
    humanAckDiary(request: HumanAckDiaryRequest, actor: MemoryActor): DiaryEntry;
    /** Human lifecycle change of a top-level concern (007 §2.4, audited). */
    humanSetConcernStatus(request: HumanSetConcernStatusRequest, actor: MemoryActor): void;
    /** Human delete of a concern subtree (007 §2.4, tombstone, audited). */
    humanDeleteConcern(request: HumanDeleteConcernRequest, actor: MemoryActor): void;
    /** Human fact add: origin=human, locked by default. */
    humanAddFact(request: HumanAddFactRequest, actor: MemoryActor): FactEntry;
    /** Human fact edit: supersedes the current version with a locked one. */
    humanEditFact(request: HumanEditFactRequest, actor: MemoryActor): FactEntry;
    /** Human fact delete: tombstone the current version. */
    humanDeleteFact(request: HumanDeleteFactRequest, actor: MemoryActor): void;
    /** Human fact confirmation: lock or unlock the current version. */
    humanConfirmFact(request: HumanConfirmFactRequest, actor: MemoryActor): FactEntry;
    /** Human rollback (same gate, human actor). */
    humanRollback(request: RollbackExperienceRequest, actor: MemoryActor): ExperienceSnapshot;
    /** Aggregated library statistics. */
    stats(): MemoryStats;
    /** Verify the ledger hash chain end to end. */
    verifyLedger(): LedgerIntegrityResult;
    /** Ledger query for the workbench and the model tool. */
    ledgerQuery(request: LedgerQueryRequest): ReturnType<MemoryStore['ledgerQuery']>;
    /** Count ledger blocks matching a filter (007 §2 pagination). */
    ledgerQueryCount(request: LedgerQueryRequest): number;
    /** Full library export (experiments + migration). */
    exportLibrary(): MemoryExport;
}
//# sourceMappingURL=core.d.ts.map