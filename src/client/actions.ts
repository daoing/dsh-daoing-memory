/**
 * The injected business face of the memory workbench entry: plain data
 * callbacks over the memory Remote namespace. Live framework data (sessions,
 * workspaces) arrives through the standard props shares instead.
 *
 * Two contracts live here. `MemoryWorkbenchActions` is the page-facing face:
 * every callback is already bound to the current session. `MemoryRemoteActions`
 * is the slot-injected face: the generated memory Remote requires the session
 * id as the first wire argument (the host resolves it back to the Agent), so
 * each callback takes it explicitly and `bindMemoryActions` curries it away
 * once the workbench knows the current session.
 */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ConcernTree,
  ConsolidateRequest,
  ConsolidateResult,
  DiaryEntry,
  ExperienceListFilter,
  ExperienceSnapshot,
  ExtractionRecord,
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
  RollbackExperienceRequest,
} from '../types.ts'

/** Callbacks the workbench pages call; each one lands in the audited ledger. */
export interface MemoryWorkbenchActions {
  /** The workbench descriptor (workspace matching + config view). */
  workbenchInfo: () => Promise<MemoryWorkbenchInfo>
  /** Aggregated library statistics. */
  stats: () => Promise<MemoryStats>
  /** Experience revisions by filter. */
  listExperiences: (filter: ExperienceListFilter) => Promise<ExperienceSnapshot[]>
  /** Every revision of one family (superseded index for rollback). */
  family: (id: string) => Promise<ExperienceSnapshot[]>
  /** Diary timeline (007 §2: server-side pagination, newest first). */
  listDiary: (limit: number, offset: number, onlyUnextracted: boolean) => Promise<DiaryEntry[]>
  /** Several diary entries by id (008 Path A: fact→diary provenance). */
  getDiaryByIds: (ids: string[]) => Promise<DiaryEntry[]>
  /** Fact versions (008 §3: server-side pagination). */
  listFacts: (category: string, includeHistory: boolean, limit: number, offset: number) => Promise<FactEntry[]>
  /** Count facts matching the filter (008 §3: pagination total). */
  listFactsCount: (category: string, includeHistory: boolean) => Promise<number>
  /** 关心事项 trees (top-level + discussion loop) (010 §D: filter + pagination). */
  listConcerns: (kind: string, status: string, limit: number, offset: number) => Promise<ConcernTree[]>
  /** Count top-level concerns matching the filter (010 §D: pagination total). */
  listConcernsCount: (kind: string, status: string) => Promise<number>
  /** Extraction runs (008 §3: server-side pagination). */
  extractionLog: (limit: number, offset: number) => Promise<ExtractionRecord[]>
  /** Total extraction runs (008 §3: pagination total). */
  extractionLogCount: () => Promise<number>
  /** Apply a consolidation run: merge related experiences (008 §1). */
  consolidate: (request: ConsolidateRequest) => Promise<ConsolidateResult>
  /** Whether a consolidation run is due (008 §1). */
  consolidationDue: () => Promise<{ due: boolean; lastTs: number; newSince: number; hoursSince: number }>
  /** Ledger query (newest first). */
  ledgerQuery: (request: LedgerQueryRequest) => Promise<LedgerBlock[]>
  /** Count ledger blocks matching a filter (007 §2 pagination). */
  ledgerQueryCount: (request: LedgerQueryRequest) => Promise<number>
  /** Verify the ledger hash chain. */
  verifyLedger: () => Promise<LedgerIntegrityResult>
  /** Full library export (JSON download for experiments/migration). */
  exportLibrary: () => Promise<MemoryExport>
  /** Human pin/unpin. */
  humanPin: (request: HumanPinRequest) => Promise<ExperienceSnapshot>
  /** Human delete (tombstone + ledger fingerprint). */
  humanDeleteExperience: (request: HumanDeleteExperienceRequest) => Promise<void>
  /** Human edit of the active revision. */
  humanEditExperience: (request: HumanEditExperienceRequest) => Promise<ExperienceSnapshot>
  /** Human injection in the fixed experience format. */
  humanAddExperience: (request: HumanAddExperienceRequest) => Promise<ExperienceSnapshot>
  /** Human authority (V2): promote a candidate straight to live. */
  humanPromote: (id: string, reason: string) => Promise<ExperienceSnapshot>
  /** Human rollback to a superseded revision. */
  humanRollback: (request: RollbackExperienceRequest) => Promise<ExperienceSnapshot>
  /** Human fact add. */
  humanAddFact: (request: HumanAddFactRequest) => Promise<FactEntry>
  /** Human fact edit. */
  humanEditFact: (request: HumanEditFactRequest) => Promise<FactEntry>
  /** Human fact delete (tombstone). */
  humanDeleteFact: (request: HumanDeleteFactRequest) => Promise<void>
  /** Human fact confirmation (lock/unlock). */
  humanConfirmFact: (request: HumanConfirmFactRequest) => Promise<FactEntry>
  /** Human acknowledgement of a pending diary entry (reviewed, no fact extracted). */
  humanAckDiary: (request: HumanAckDiaryRequest) => Promise<DiaryEntry>
  /** Human lifecycle change of a top-level concern (007 §2.4). */
  humanSetConcernStatus: (request: HumanSetConcernStatusRequest) => Promise<void>
  /** Human delete of a concern subtree (007 §2.4). */
  humanDeleteConcern: (request: HumanDeleteConcernRequest) => Promise<void>
  /** Human re-release of a cold-palace revision back to candidate (006 §3.2). */
  humanReleaseCold: (request: HumanReleaseColdRequest) => Promise<ExperienceSnapshot>
  /** 摄取归一: submit extracted candidates with provenance (006 §1). */
  ingest: (request: IngestRequest) => Promise<IngestResult>
}

/** The slot-injected face: every callback carries the session id first. */
export interface MemoryRemoteActions {
  /** The workbench descriptor (workspace matching + config view). */
  workbenchInfo: (session: SessionId) => Promise<MemoryWorkbenchInfo>
  /** Aggregated library statistics. */
  stats: (session: SessionId) => Promise<MemoryStats>
  /** Experience revisions by filter. */
  listExperiences: (session: SessionId, filter: ExperienceListFilter) => Promise<ExperienceSnapshot[]>
  /** Every revision of one family (superseded index for rollback). */
  family: (session: SessionId, id: string) => Promise<ExperienceSnapshot[]>
  /** Diary timeline (007 §2: server-side pagination, newest first). */
  listDiary: (session: SessionId, limit: number, offset: number, onlyUnextracted: boolean) => Promise<DiaryEntry[]>
  /** Several diary entries by id (008 Path A: fact→diary provenance). */
  getDiaryByIds: (session: SessionId, ids: string[]) => Promise<DiaryEntry[]>
  /** Fact versions (008 §3: server-side pagination). */
  listFacts: (session: SessionId, category: string, includeHistory: boolean, limit: number, offset: number) => Promise<FactEntry[]>
  /** Count facts matching the filter (008 §3: pagination total). */
  listFactsCount: (session: SessionId, category: string, includeHistory: boolean) => Promise<number>
  /** 关心事项 trees (top-level + discussion loop) (010 §D: filter + pagination). */
  listConcerns: (session: SessionId, kind: string, status: string, limit: number, offset: number) => Promise<ConcernTree[]>
  /** Count top-level concerns matching the filter (010 §D: pagination total). */
  listConcernsCount: (session: SessionId, kind: string, status: string) => Promise<number>
  /** Extraction runs (008 §3: server-side pagination). */
  extractionLog: (session: SessionId, limit: number, offset: number) => Promise<ExtractionRecord[]>
  /** Total extraction runs (008 §3: pagination total). */
  extractionLogCount: (session: SessionId) => Promise<number>
  /** Apply a consolidation run: merge related experiences (008 §1). */
  consolidate: (session: SessionId, request: ConsolidateRequest) => Promise<ConsolidateResult>
  /** Whether a consolidation run is due (008 §1). */
  consolidationDue: (session: SessionId) => Promise<{ due: boolean; lastTs: number; newSince: number; hoursSince: number }>
  /** Ledger query (newest first). */
  ledgerQuery: (session: SessionId, request: LedgerQueryRequest) => Promise<LedgerBlock[]>
  /** Count ledger blocks matching a filter (007 §2 pagination). */
  ledgerQueryCount: (session: SessionId, request: LedgerQueryRequest) => Promise<number>
  /** Verify the ledger hash chain. */
  verifyLedger: (session: SessionId) => Promise<LedgerIntegrityResult>
  /** Full library export (JSON download for experiments/migration). */
  exportLibrary: (session: SessionId) => Promise<MemoryExport>
  /** Human pin/unpin. */
  humanPin: (session: SessionId, request: HumanPinRequest) => Promise<ExperienceSnapshot>
  /** Human delete (tombstone + ledger fingerprint). */
  humanDeleteExperience: (session: SessionId, request: HumanDeleteExperienceRequest) => Promise<void>
  /** Human edit of the active revision. */
  humanEditExperience: (session: SessionId, request: HumanEditExperienceRequest) => Promise<ExperienceSnapshot>
  /** Human injection in the fixed experience format. */
  humanAddExperience: (session: SessionId, request: HumanAddExperienceRequest) => Promise<ExperienceSnapshot>
  /** Human authority (V2): promote a candidate straight to live. */
  humanPromote: (session: SessionId, id: string, reason: string) => Promise<ExperienceSnapshot>
  /** Human rollback to a superseded revision. */
  humanRollback: (session: SessionId, request: RollbackExperienceRequest) => Promise<ExperienceSnapshot>
  /** Human fact add. */
  humanAddFact: (session: SessionId, request: HumanAddFactRequest) => Promise<FactEntry>
  /** Human fact edit. */
  humanEditFact: (session: SessionId, request: HumanEditFactRequest) => Promise<FactEntry>
  /** Human fact delete (tombstone). */
  humanDeleteFact: (session: SessionId, request: HumanDeleteFactRequest) => Promise<void>
  /** Human fact confirmation (lock/unlock). */
  humanConfirmFact: (session: SessionId, request: HumanConfirmFactRequest) => Promise<FactEntry>
  /** Human acknowledgement of a pending diary entry (reviewed, no fact extracted). */
  humanAckDiary: (session: SessionId, request: HumanAckDiaryRequest) => Promise<DiaryEntry>
  /** Human lifecycle change of a top-level concern (007 §2.4). */
  humanSetConcernStatus: (session: SessionId, request: HumanSetConcernStatusRequest) => Promise<void>
  /** Human delete of a concern subtree (007 §2.4). */
  humanDeleteConcern: (session: SessionId, request: HumanDeleteConcernRequest) => Promise<void>
  /** Human re-release of a cold-palace revision back to candidate (006 §3.2). */
  humanReleaseCold: (session: SessionId, request: HumanReleaseColdRequest) => Promise<ExperienceSnapshot>
  /** 摄取归一: submit extracted candidates with provenance (006 §1). */
  ingest: (session: SessionId, request: IngestRequest) => Promise<IngestResult>
}

/** Curry the session id away so the pages keep calling the bound face. */
export function bindMemoryActions(remote: MemoryRemoteActions, session: SessionId): MemoryWorkbenchActions {
  return {
    workbenchInfo: () => remote.workbenchInfo(session),
    stats: () => remote.stats(session),
    listExperiences: (filter) => remote.listExperiences(session, filter),
    family: (id) => remote.family(session, id),
    listDiary: (limit, offset, onlyUnextracted) => remote.listDiary(session, limit, offset, onlyUnextracted),
    getDiaryByIds: (ids) => remote.getDiaryByIds(session, ids),
    listFacts: (category, includeHistory, limit, offset) => remote.listFacts(session, category, includeHistory, limit, offset),
    listFactsCount: (category, includeHistory) => remote.listFactsCount(session, category, includeHistory),
    listConcerns: (kind, status, limit, offset) => remote.listConcerns(session, kind, status, limit, offset),
    listConcernsCount: (kind, status) => remote.listConcernsCount(session, kind, status),
    extractionLog: (limit, offset) => remote.extractionLog(session, limit, offset),
    extractionLogCount: () => remote.extractionLogCount(session),
    consolidate: (request) => remote.consolidate(session, request),
    consolidationDue: () => remote.consolidationDue(session),
    ledgerQuery: (request) => remote.ledgerQuery(session, request),
    ledgerQueryCount: (request) => remote.ledgerQueryCount(session, request),
    verifyLedger: () => remote.verifyLedger(session),
    exportLibrary: () => remote.exportLibrary(session),
    humanPin: (request) => remote.humanPin(session, request),
    humanDeleteExperience: (request) => remote.humanDeleteExperience(session, request),
    humanEditExperience: (request) => remote.humanEditExperience(session, request),
    humanAddExperience: (request) => remote.humanAddExperience(session, request),
    humanPromote: (id, reason) => remote.humanPromote(session, id, reason),
    humanRollback: (request) => remote.humanRollback(session, request),
    humanAddFact: (request) => remote.humanAddFact(session, request),
    humanEditFact: (request) => remote.humanEditFact(session, request),
    humanDeleteFact: (request) => remote.humanDeleteFact(session, request),
    humanConfirmFact: (request) => remote.humanConfirmFact(session, request),
    humanAckDiary: (request) => remote.humanAckDiary(session, request),
    humanSetConcernStatus: (request) => remote.humanSetConcernStatus(session, request),
    humanDeleteConcern: (request) => remote.humanDeleteConcern(session, request),
    humanReleaseCold: (request) => remote.humanReleaseCold(session, request),
    ingest: (request) => remote.ingest(session, request),
  }
}
