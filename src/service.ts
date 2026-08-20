/**
 * Memory library Typert Remote service: the wire face over MemoryCore.
 * Every method takes the calling Agent first (Typert wire identity); the
 * library itself is process-global — one memory shared by every session.
 * Human operations carry an audited reason and land in the ledger.
 * @module dsh-daoing-memory/service
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { MemoryCore } from './core.ts'
import type {
  ConcernTree,
  ConsolidateRequest,
  ConsolidateResult,
  DiaryAppendRequest,
  DiaryAppendResult,
  DiaryEntry,
  ExperienceListFilter,
  ExperienceSnapshot,
  ExtractionRecord,
  ExtractFactsRequest,
  ExtractFactsResult,
  FactEntry,
  HumanAddExperienceRequest,
  HumanAddFactRequest,
  HumanAckDiaryRequest,
  HumanConfirmFactRequest,
  HumanDeleteConcernRequest,
  HumanDeleteExperienceRequest,
  HumanDeleteFactRequest,
  HumanEditExperienceRequest,
  HumanEditFactRequest,
  HumanPinRequest,
  HumanReleaseColdRequest,
  HumanSetConcernStatusRequest,
  IngestRequest,
  IngestResult,
  LedgerBlock,
  LedgerIntegrityResult,
  LedgerQueryRequest,
  MemoryExport,
  MemoryStats,
  MemoryWorkbenchInfo,
  RecallExperiencesRequest,
  RecallExperiencesResult,
  RefineExperienceRequest,
  RefineExperienceResult,
  ReportUseRequest,
  ReportUseResult,
  ReviseExperienceRequest,
  RollbackExperienceRequest,
  VerifyShadowRequest,
  VerifyShadowResult,
} from './types.ts'

/** Derive the ledger actor label from the wire identity. */
function actorOf(agent: Agent): string {
  const sessionId = (agent as unknown as { session?: { id?: string } }).session?.id
  return sessionId === undefined ? 'agent' : `agent:${sessionId}`
}

/**
 * Remote face of the memory library. All methods delegate to the core; the
 * core carries the 生·用·修·记 mechanism semantics.
 */
export class MemoryService extends TypertRemoteService {
  /** @param ctx - host context. */
  /** @param core - the ctx-free memory core. */
  /** @param workbench - descriptor the browser half matches workspaces against. */
  constructor(
    ctx: Context,
    private readonly core: MemoryCore,
    private readonly workbench: () => MemoryWorkbenchInfo,
  ) {
    super(ctx, 'memory')
  }

  /** 生: refine a completed trajectory into an experience candidate. */
  @Remote('refine')
  refine(agent: Agent, request: RefineExperienceRequest): RefineExperienceResult {
    return this.core.refine(request, actorOf(agent))
  }

  /** 用: recall + adjudication + injection budget + negative channel. */
  @Remote('recall')
  recall(agent: Agent, request: RecallExperiencesRequest): RecallExperiencesResult {
    return this.core.recall(request, actorOf(agent))
  }

  /** 用·验: report one use outcome with attribution (V0 verification). */
  @Remote('report')
  report(agent: Agent, request: ReportUseRequest): ReportUseResult {
    return this.core.report(request, actorOf(agent))
  }

  /** 摄取归一: source-agnostic intake; drafts become earned candidates (006 §1). */
  @Remote('ingest')
  ingest(agent: Agent, request: IngestRequest): IngestResult {
    return this.core.ingest(request, actorOf(agent))
  }

  /** 修: propose a revised draft for a challenged experience. */
  @Remote('revise')
  revise(agent: Agent, request: ReviseExperienceRequest): ExperienceSnapshot {
    return this.core.revise(request, actorOf(agent))
  }

  /** V1 controlled re-enactment: shadow replay verification for a draft. */
  @Remote('verifyShadow')
  verifyShadow(agent: Agent, request: VerifyShadowRequest): VerifyShadowResult {
    return this.core.verifyShadow(request, actorOf(agent))
  }

  /** Restore a superseded revision to live (rollback). */
  @Remote('rollback')
  rollback(agent: Agent, request: RollbackExperienceRequest): ExperienceSnapshot {
    return this.core.rollback(request, actorOf(agent))
  }

  /** Read one experience revision (active when revision omitted). */
  @Remote('get')
  get(agent: Agent, id: string, revision?: number): ExperienceSnapshot | undefined {
    void agent
    return this.core.get(id, revision)
  }

  /** List experience revisions by filter. */
  @Remote('list')
  list(agent: Agent, filter: ExperienceListFilter): ExperienceSnapshot[] {
    void agent
    return this.core.list(filter)
  }

  /** Every revision of one family (superseded index for rollback). */
  @Remote('family')
  family(agent: Agent, id: string): ExperienceSnapshot[] {
    void agent
    return this.core.family(id)
  }

  /** 记: append one diary entry; signals the extraction duty when due. */
  @Remote('appendDiary')
  appendDiary(agent: Agent, request: DiaryAppendRequest): DiaryAppendResult {
    return this.core.appendDiary(request, actorOf(agent))
  }

  /** 上升通道: apply extracted facts over the pending diary window. */
  @Remote('extract')
  extract(agent: Agent, request: ExtractFactsRequest): ExtractFactsResult {
    return this.core.extract(request, actorOf(agent), 'manual')
  }

  /** Diary timeline for the workbench (007 §2: server-side pagination, newest first). */
  @Remote('listDiary')
  listDiary(agent: Agent, limit: number, offset: number, onlyUnextracted: boolean): DiaryEntry[] {
    void agent
    return this.core.listDiary(limit, offset, onlyUnextracted)
  }

  /** Several diary entries by id (008 Path A: fact→diary provenance). */
  @Remote('getDiaryByIds')
  getDiaryByIds(agent: Agent, ids: string[]): DiaryEntry[] {
    void agent
    return this.core.getDiaryByIds(ids)
  }

  /** Fact versions for the workbench (008 §3: server-side pagination). */
  @Remote('listFacts')
  listFacts(agent: Agent, category: string, includeHistory: boolean, limit: number, offset: number): FactEntry[] {
    void agent
    return this.core.listFacts(category === '' ? undefined : category, includeHistory, limit, offset)
  }

  /** Count facts matching the workbench filter (008 §3: pagination total). */
  @Remote('listFactsCount')
  listFactsCount(agent: Agent, category: string, includeHistory: boolean): number {
    void agent
    return this.core.listFactsCount(category === '' ? undefined : category, includeHistory)
  }

  /** 关心事项 trees (top-level + discussion loop) for the workbench (010 §D: filter + pagination). */
  @Remote('listConcerns')
  listConcerns(agent: Agent, kind: string, status: string, limit: number, offset: number): ConcernTree[] {
    void agent
    return this.core.listConcerns(kind === '' ? undefined : kind, status === '' ? undefined : status, limit, offset)
  }

  /** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
  @Remote('listConcernsCount')
  listConcernsCount(agent: Agent, kind: string, status: string): number {
    void agent
    return this.core.listConcernsCount(kind === '' ? undefined : kind, status === '' ? undefined : status)
  }

  /** 010 §F: compact profile + open-concern snapshot for the AI's context (host-side). */
  profileSnapshot(): string {
    return this.core.profileSnapshot()
  }

  /** Extraction runs for the workbench (008 §3: server-side pagination). */
  @Remote('extractionLog')
  extractionLog(agent: Agent, limit: number, offset: number): ExtractionRecord[] {
    void agent
    return this.core.extractionLog(limit, offset)
  }

  /** Total extraction runs (008 §3: pagination total). */
  @Remote('extractionLogCount')
  extractionLogCount(agent: Agent): number {
    void agent
    return this.core.extractionLogCount()
  }

  /** Apply a consolidation run: merge related experiences (008 §1). */
  @Remote('consolidate')
  consolidate(agent: Agent, request: ConsolidateRequest): ConsolidateResult {
    void agent
    return this.core.consolidate(request, 'agent')
  }

  /** Whether a consolidation run is due (interval cadence; 008 §1). */
  @Remote('consolidationDue')
  consolidationDue(agent: Agent): { due: boolean; lastTs: number; newSince: number; hoursSince: number } {
    void agent
    return this.core.consolidationDue()
  }

  /** Ledger query (newest first, filtered). */
  @Remote('ledgerQuery')
  ledgerQuery(agent: Agent, request: LedgerQueryRequest): LedgerBlock[] {
    void agent
    return this.core.ledgerQuery(request)
  }

  /** Count ledger blocks matching a filter (007 §2 pagination). */
  @Remote('ledgerQueryCount')
  ledgerQueryCount(agent: Agent, request: LedgerQueryRequest): number {
    void agent
    return this.core.ledgerQueryCount(request)
  }

  /** Verify the ledger hash chain end to end. */
  @Remote('verifyLedger')
  verifyLedger(agent: Agent): LedgerIntegrityResult {
    void agent
    return this.core.verifyLedger()
  }

  /** Aggregated library statistics. */
  @Remote('stats')
  stats(agent: Agent): MemoryStats {
    void agent
    return this.core.stats()
  }

  /** Workbench descriptor (workspace matching + config view). */
  @Remote('workbenchInfo')
  workbenchInfo(agent: Agent): MemoryWorkbenchInfo {
    void agent
    return this.workbench()
  }

  /** Full library export for experiments and migration. */
  @Remote('exportLibrary')
  exportLibrary(agent: Agent): MemoryExport {
    void agent
    return this.core.exportLibrary()
  }

  /**
   * Host-only ledger integrity check (no wire identity needed): the package
   * invariant companion asserts the hash chain through this accessor.
   * @returns the chain verification outcome.
   */
  verifyLedgerIntegrity(): LedgerIntegrityResult {
    return this.core.verifyLedger()
  }

  // ── human operations (all ledgered with the audited reason) ───────────────

  /** Human pin/unpin. */
  @Remote('humanPin')
  humanPin(agent: Agent, request: HumanPinRequest): ExperienceSnapshot {
    void agent
    return this.core.humanPin(request, 'human')
  }

  /** Human delete (tombstone + ledger fingerprint). */
  @Remote('humanDeleteExperience')
  humanDeleteExperience(agent: Agent, request: HumanDeleteExperienceRequest): { deleted: true } {
    void agent
    this.core.humanDeleteExperience(request, 'human')
    return { deleted: true }
  }

  /** Human edit of the active revision. */
  @Remote('humanEditExperience')
  humanEditExperience(agent: Agent, request: HumanEditExperienceRequest): ExperienceSnapshot {
    void agent
    return this.core.humanEditExperience(request, 'human')
  }

  /** Human injection in the fixed experience format. */
  @Remote('humanAddExperience')
  humanAddExperience(agent: Agent, request: HumanAddExperienceRequest): ExperienceSnapshot {
    void agent
    return this.core.humanAddExperience(request, 'human')
  }

  /** Human authority (V2): promote a candidate straight to live. */
  @Remote('humanPromote')
  humanPromote(agent: Agent, id: string, reason: string): ExperienceSnapshot {
    void agent
    return this.core.humanPromote(id, reason, 'human')
  }

  /** Human re-release of a cold-palace revision back to candidate (006 §3.2). */
  @Remote('humanReleaseCold')
  humanReleaseCold(agent: Agent, request: HumanReleaseColdRequest): ExperienceSnapshot {
    void agent
    return this.core.humanReleaseCold(request, 'human')
  }

  /** Human rollback. */
  @Remote('humanRollback')
  humanRollback(agent: Agent, request: RollbackExperienceRequest): ExperienceSnapshot {
    void agent
    return this.core.humanRollback(request, 'human')
  }

  /** Human fact add. */
  @Remote('humanAddFact')
  humanAddFact(agent: Agent, request: HumanAddFactRequest): FactEntry {
    void agent
    return this.core.humanAddFact(request, 'human')
  }

  /** Human fact edit. */
  @Remote('humanEditFact')
  humanEditFact(agent: Agent, request: HumanEditFactRequest): FactEntry {
    void agent
    return this.core.humanEditFact(request, 'human')
  }

  /** Human fact delete (tombstone). */
  @Remote('humanDeleteFact')
  humanDeleteFact(agent: Agent, request: HumanDeleteFactRequest): { deleted: true } {
    void agent
    this.core.humanDeleteFact(request, 'human')
    return { deleted: true }
  }

  /** Human fact confirmation (lock/unlock). */
  @Remote('humanConfirmFact')
  humanConfirmFact(agent: Agent, request: HumanConfirmFactRequest): FactEntry {
    void agent
    return this.core.humanConfirmFact(request, 'human')
  }

  /** Human acknowledgement of a pending diary entry (reviewed, no fact extracted). */
  @Remote('humanAckDiary')
  humanAckDiary(agent: Agent, request: HumanAckDiaryRequest): DiaryEntry {
    void agent
    return this.core.humanAckDiary(request, 'human')
  }

  /** Human lifecycle change of a top-level concern (007 §2.4). */
  @Remote('humanSetConcernStatus')
  humanSetConcernStatus(agent: Agent, request: HumanSetConcernStatusRequest): { ok: true } {
    void agent
    this.core.humanSetConcernStatus(request, 'human')
    return { ok: true }
  }

  /** Human delete of a concern subtree (007 §2.4). */
  @Remote('humanDeleteConcern')
  humanDeleteConcern(agent: Agent, request: HumanDeleteConcernRequest): { deleted: true } {
    void agent
    this.core.humanDeleteConcern(request, 'human')
    return { deleted: true }
  }
}
