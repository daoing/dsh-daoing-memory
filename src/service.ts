/**
 * Memory library Typert Remote service: the wire face over MemoryCore.
 * Every method takes the calling Agent first (Typert wire identity); the
 * library itself is process-global — one memory shared by every session.
 * Human operations carry an audited reason and land in the ledger.
 * @module dsh-daoing-memory/service
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
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
  GenerateSkillDraftRequest,
  HumanAddExperienceRequest,
  HumanAddFactRequest,
  HumanAckDiaryRequest,
  HumanConfirmFactRequest,
  HumanArchiveExperienceRequest,
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
  PublishSkillRequest,
  RecallExperiencesRequest,
  RecallExperiencesResult,
  RefineExperienceRequest,
  RefineExperienceResult,
  ReportUseRequest,
  ReportUseResult,
  ReviewSkillRequest,
  ReviseExperienceRequest,
  RollbackExperienceRequest,
  SkillArtifact,
  SkillForm,
  SkillStatus,
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
  /** @param llm - the DSH LLM service handle, fetched at apply() time (fiber ACTIVE). */
  /** @param defaultModel - the DSH default-model config handle, fetched at apply() time. */
  constructor(
    ctx: Context,
    private readonly core: MemoryCore,
    private readonly workbench: () => MemoryWorkbenchInfo,
    private readonly llm: { stream(options: unknown): AsyncIterable<{ type: string; text?: string; index?: number }> } | undefined,
    private readonly defaultModel: { get(): { provider: string; model: string } } | undefined,
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
  async extract(agent: Agent, request: ExtractFactsRequest): Promise<ExtractFactsResult> {
    // P1-2: lazy-trigger deletion-feedback summarization before extraction.
    // If enough deletions have accumulated and enough time has passed, run an
    // LLM summarization to update the extraction-feedback experience. This
    // ensures the feedback is fresh when the extraction prompt references it.
    await this.maybeRunDeletionFeedbackSummarization(agent)
    return this.core.extract(request, actorOf(agent), 'manual')
  }

  /**
   * Check if deletion-feedback summarization is due and run it if so.
   * Uses the agent's current model route for the LLM call.
   */
  private async maybeRunDeletionFeedbackSummarization(agent: Agent): Promise<void> {
    const check = this.core.deletionFeedbackDue()
    if (!check.due) return
    try {
      const records = this.core['store'].getDeletionRecordsSince(check.lastTs, 50)
      if (records.length === 0) return
      const summary = await this.summarizeDeletionsWithLlm(agent, records)
      if (summary.length > 0) {
        this.core.applyDeletionFeedback(summary, 'system')
      }
    } catch {
      // Summarization failure is non-fatal — extraction proceeds without updated feedback.
    }
  }

  /**
   * Call the LLM to summarize deletion records into extraction feedback rules.
   * Uses ctx.llm.stream() with the agent's current model route.
   */
  private async summarizeDeletionsWithLlm(
    agent: Agent,
    records: Array<{ seq: number; ts: number; objectId: string; reason: string; gist: string }>,
  ): Promise<string> {
    // Try session-specific model first, fall back to the default model config.
    const header = agent.session.requestHeader()?.config
    let provider = header?.provider
    let model = header?.model
    if (provider === undefined || model === undefined) {
      if (this.defaultModel !== undefined) {
        const def = this.defaultModel.get()
        provider = def.provider
        model = def.model
      }
    }
    if (provider === undefined || model === undefined) return ''

    const deletionList = records.map((r, i) =>
      `${i + 1}. [${new Date(r.ts).toLocaleDateString('zh-CN')}] 删除的经验：「${r.gist.slice(0, 80)}」\n   原因：${r.reason || '（未填写）'}`,
    ).join('\n\n')

    const systemPrompt = `你是一个记忆系统的反馈分析器。你的任务是分析用户删除记忆时填写的原因，总结出"什么类型的记忆不值得提取"的规则。

输出要求：
1. 用简洁的中文列出 3-5 条规则
2. 每条规则说明：什么类型的记忆应该避免提取，以及为什么
3. 规则要具体可操作，不要泛泛而谈
4. 如果删除原因都很相似，合并为更精炼的规则`

    const userPrompt = `以下是近期被用户删除的记忆及其删除原因：

${deletionList}

请总结成提取反馈规则。`

    const messages = [createUserMessage({
      content: [{ type: 'text', text: userPrompt }],
      source: { kind: 'plugin', plugin: 'dsh-daoing-memory' },
    })]

    let text = ''
    const options = {
      provider,
      model,
      messages,
      system: systemPrompt,
      maxTokens: 1500,
      sessionId: agent.session.id,
    }

    if (this.llm === undefined) return ''
    for await (const chunk of this.llm.stream(options)) {
      if (chunk.type === 'text-delta') text += chunk.text
    }

    return text.trim()
  }

  /**
   * Remote: manually trigger deletion-feedback summarization (for testing/debugging).
   */
  @Remote('runDeletionFeedback')
  async runDeletionFeedback(agent: Agent): Promise<{ ran: boolean; summary?: string }> {
    const check = this.core.deletionFeedbackDue()
    const records = this.core['store'].getDeletionRecordsSince(check.lastTs, 50)
    if (records.length === 0) return { ran: false }
    try {
      const summary = await this.summarizeDeletionsWithLlm(agent, records)
      if (summary.length > 0) {
        this.core.applyDeletionFeedback(summary, 'system')
        return { ran: true, summary }
      }
      return { ran: false }
    } catch (e) {
      return { ran: false, summary: String(e) }
    }
  }

  /**
   * Remote: get the current deletion-feedback experience (for debugging).
   */
  @Remote('getDeletionFeedback')
  getDeletionFeedback(agent: Agent): ExperienceSnapshot | null {
    void agent
    return this.core.getDeletionFeedback() ?? null
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

  /** Human archive (move to archived status; preserves data, removes from recall). */
  @Remote('humanArchiveExperience')
  humanArchiveExperience(agent: Agent, request: HumanArchiveExperienceRequest): { archived: true } {
    void agent
    this.core.humanArchiveExperience(request, 'human')
    return { archived: true }
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

  // ── skill artifacts (P2) ──────────────────────────────────────────────────

  /** Generate a skill draft from an experience using LLM. */
  @Remote('generateSkillDraft')
  async generateSkillDraft(agent: Agent, request: GenerateSkillDraftRequest): Promise<SkillArtifact> {
    const experience = this.core['store'].getActiveRevision(request.experienceId)
    if (experience === undefined) throw new Error(`memory: experience not found: ${request.experienceId}`)

    const content = await this.generateSkillContentWithLlm(agent, experience, request.form)
    if (content.length === 0) throw new Error('memory: LLM generated empty skill content')

    // Save draft to filesystem
    const home = process.env.DSH_HOME ?? join(process.cwd(), '.dsh')
    const draftDir = join(home, 'dsh-daoing-memory', 'skills')
    mkdirSync(draftDir, { recursive: true })
    const ext = request.form === 'skill_md' ? '.md' : '.mjs'
    const draftPath = join(draftDir, `${randomUUID()}${ext}`)
    writeFileSync(draftPath, content, 'utf8')

    return this.core.createSkillDraft(request.experienceId, request.form, content, draftPath, actorOf(agent))
  }

  /** Review (approve/reject) a skill artifact. */
  @Remote('reviewSkill')
  reviewSkill(agent: Agent, request: ReviewSkillRequest): SkillArtifact {
    return this.core.reviewSkill(request, actorOf(agent))
  }

  /** Publish an approved skill (copy to $DSH_HOME/skills/). */
  @Remote('publishSkill')
  publishSkill(agent: Agent, request: PublishSkillRequest): SkillArtifact {
    const artifact = this.core.getSkillArtifact(request.id)
    if (artifact === undefined) throw new Error(`memory: skill artifact not found: ${request.id}`)
    if (artifact.draftPath === undefined) throw new Error('memory: skill artifact has no draft path')

    const home = process.env.DSH_HOME ?? join(process.cwd(), '.dsh')
    const publishDir = join(home, 'skills')
    mkdirSync(publishDir, { recursive: true })
    const ext = artifact.form === 'skill_md' ? '.md' : '.mjs'
    const publishedPath = join(publishDir, `${artifact.id}${ext}`)

    // Copy draft to published location
    const draftContent = readFileSync(artifact.draftPath, 'utf8')
    writeFileSync(publishedPath, draftContent, 'utf8')

    return this.core.publishSkill(request, publishedPath, actorOf(agent))
  }

  /** List skill artifacts. */
  @Remote('listSkillArtifacts')
  listSkillArtifacts(agent: Agent, parentExperienceId: string, status: string): SkillArtifact[] {
    void agent
    const filter: { parentExperienceId?: string; status?: SkillStatus } = {}
    if (parentExperienceId !== '') filter.parentExperienceId = parentExperienceId
    if (status !== '') filter.status = status as SkillStatus
    return this.core.listSkillArtifacts(filter)
  }

  /** Get a single skill artifact. */
  @Remote('getSkillArtifact')
  getSkillArtifact(agent: Agent, id: string): SkillArtifact | null {
    void agent
    return this.core.getSkillArtifact(id) ?? null
  }

  /** Check if an experience is a skill conversion candidate. */
  @Remote('isSkillCandidate')
  isSkillCandidate(agent: Agent, experienceId: string): boolean {
    void agent
    return this.core.isSkillCandidate(experienceId)
  }

  /**
   * Generate skill content from an experience using LLM.
   */
  private async generateSkillContentWithLlm(
    agent: Agent,
    experience: ExperienceSnapshot,
    form: SkillForm,
  ): Promise<string> {
    // Try session-specific model first, fall back to the default model config.
    const header = agent.session.requestHeader()?.config
    let provider = header?.provider
    let model = header?.model
    if (provider === undefined || model === undefined) {
      if (this.defaultModel !== undefined) {
        const def = this.defaultModel.get()
        provider = def.provider
        model = def.model
      }
    }
    if (provider === undefined || model === undefined) return ''

    const isScript = form === 'script_mjs'
    const systemPrompt = isScript
      ? `你是一个技能脚本生成器。根据给定的经验（gist、路径步骤、判断背景、限制条件），生成一个可直接执行的 Node.js (.mjs) 脚本。

要求：
1. 脚本必须自包含，不依赖外部包（只用 Node.js 内置模块）
2. 脚本顶部用注释说明用途和使用方法
3. 脚本要有错误处理
4. 脚本要跨平台兼容（Windows/macOS/Linux）
5. 只输出脚本代码，不要其他解释`
      : `你是一个 DSH skill 文档生成器。根据给定的经验（gist、路径步骤、判断背景、限制条件），生成一个 DSH skill 格式的 Markdown 文档。

要求：
1. 使用 DSH skill 标准格式（标题、描述、触发条件、步骤）
2. 步骤要具体可操作
3. 包含适用场景和不适用场景
4. 只输出 Markdown 内容，不要其他解释`

    const userPrompt = `经验摘要：${experience.gist}

路径步骤：
${experience.path.map((s, i) => `${i + 1}. ${s.action}`).join('\n')}

判断背景：${experience.reasoning}

限制条件：
${experience.limits.map(l => `- ${l}`).join('\n')}

请生成${isScript ? '可执行脚本' : 'skill 文档'}。`

    const messages = [createUserMessage({
      content: [{ type: 'text', text: userPrompt }],
      source: { kind: 'plugin', plugin: 'dsh-daoing-memory' },
    })]

    let text = ''
    if (this.llm === undefined) return ''
    for await (const chunk of this.llm.stream({
      provider,
      model,
      messages,
      system: systemPrompt,
      maxTokens: 4000,
      sessionId: agent.session.id,
    })) {
      if (chunk.type === 'text-delta') text += chunk.text
    }

    return text.trim()
  }
}
