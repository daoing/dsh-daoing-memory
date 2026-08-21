/**
 * Memory library host plugin: the self-evolving memory layer (生·用·修·记 +
 * diary/fact semantic memory). One process-global library shared by every
 * session, backed by a local SQLite file. Registers `ctx.memory`
 * (MemoryService). The monitoring UI is an independent left-sidebar nav group
 * (browser half), not a workspace; this host half performs no workspace
 * adoption.
 * @module dsh-daoing-memory
 */

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_CORE_CONFIG, MemoryCore, type MemoryCoreConfig } from './core.ts'
import { MemoryService } from './service.ts'
import { MemoryStore } from './store.ts'
import type { MemoryWorkbenchInfo } from './types.ts'

export type * from './types.ts'
export { MemoryCore, DEFAULT_CORE_CONFIG } from './core.ts'
export type { MemoryCoreConfig } from './core.ts'
export { MemoryService } from './service.ts'
export { MemoryStore, MEMORY_SCHEMA_VERSION } from './store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The memory library service (self-evolving memory). */
    memory: MemoryService
  }
}

/** Plugin config: every deployment-varying tunable lives here (cordis.yml). */
export interface Config {
  /** SQLite database file path (default: $DSH_HOME/storages/memory.db). */
  databasePath?: string
  /** Monitoring workspace folder (default: $DSH_HOME/memory-workbench). */
  /** Library display folder shown in the workbench info payload (no workspace is adopted). */
  workspacePath?: string
  /** Library display title shown in the workbench info payload. */
  workspaceTitle?: string
  /** Diary entries that trigger one extraction run. */
  diaryExtractEvery?: number
  /** Minimum hours between extraction runs. */
  diaryExtractIntervalHours?: number
  /** Default recall candidate count. */
  recallTopK?: number
  /** Injection budget in estimated tokens. */
  injectionBudgetTokens?: number
  /** Consecutive experience-attributed failures that quarantine a live experience. */
  challengeConsecutiveFails?: number
  /** Window size for the failure-rate challenge rule. */
  challengeWindow?: number
  /** Failure rate within the window that challenges a live experience. */
  challengeWindowFailRate?: number
  /** Live-revision cap per family tag (capacity budget). */
  familyLiveCap?: number
  /** Complexity gate: token threshold. */
  complexityTokenGate?: number
  /** Complexity gate: step threshold. */
  complexityStepGate?: number
  /** Information-gain gate: overlap at/above this rejects a near-duplicate. */
  duplicateOverlapGate?: number
  /** Minimum relevance score for injection. */
  recallFloorScore?: number
  /** Shadow replay agreement required to adopt a draft. */
  shadowPassRate?: number
  /** Minimum hours between deletion-feedback LLM summarization runs. */
  deletionFeedbackIntervalHours?: number
  /** Minimum new deletions since last run to trigger summarization. */
  deletionFeedbackMinDeletions?: number
}

/** Resolve the plugin config with explicit defaults; unknown keys fail loud. */
export function resolveConfig(config: Config): Required<Omit<Config, 'databasePath' | 'workspacePath'>> & {
  databasePath: string
  workspacePath: string
} {
  const home = process.env.DSH_HOME ?? join(process.cwd(), '.dsh')
  const known: readonly (keyof Config)[] = [
    'databasePath', 'workspacePath', 'workspaceTitle', 'diaryExtractEvery',
    'diaryExtractIntervalHours', 'recallTopK', 'injectionBudgetTokens',
    'challengeConsecutiveFails', 'challengeWindow', 'challengeWindowFailRate',
    'familyLiveCap', 'complexityTokenGate', 'complexityStepGate',
    'duplicateOverlapGate', 'recallFloorScore', 'shadowPassRate',
    'deletionFeedbackIntervalHours', 'deletionFeedbackMinDeletions',
  ]
  const unknown = Object.keys(config).filter(key => !(known as readonly string[]).includes(key))
  if (unknown.length > 0) {
    throw new Error(`memory: unknown config key(s) ${unknown.join(', ')}`)
  }
  const databasePath = resolve(config.databasePath ?? join(home, 'storages', 'memory.db'))
  const workspacePath = resolve(config.workspacePath ?? join(home, 'memory-workbench'))
  return {
    databasePath,
    workspacePath,
    workspaceTitle: config.workspaceTitle ?? '记忆监控',
    diaryExtractEvery: config.diaryExtractEvery ?? DEFAULT_CORE_CONFIG.diaryExtractEvery,
    diaryExtractIntervalHours: config.diaryExtractIntervalHours ?? DEFAULT_CORE_CONFIG.diaryExtractIntervalHours,
    recallTopK: config.recallTopK ?? DEFAULT_CORE_CONFIG.recallTopK,
    injectionBudgetTokens: config.injectionBudgetTokens ?? DEFAULT_CORE_CONFIG.injectionBudgetTokens,
    challengeConsecutiveFails: config.challengeConsecutiveFails ?? DEFAULT_CORE_CONFIG.challengeConsecutiveFails,
    challengeWindow: config.challengeWindow ?? DEFAULT_CORE_CONFIG.challengeWindow,
    challengeWindowFailRate: config.challengeWindowFailRate ?? DEFAULT_CORE_CONFIG.challengeWindowFailRate,
    familyLiveCap: config.familyLiveCap ?? DEFAULT_CORE_CONFIG.familyLiveCap,
    complexityTokenGate: config.complexityTokenGate ?? DEFAULT_CORE_CONFIG.complexityTokenGate,
    complexityStepGate: config.complexityStepGate ?? DEFAULT_CORE_CONFIG.complexityStepGate,
    duplicateOverlapGate: config.duplicateOverlapGate ?? DEFAULT_CORE_CONFIG.duplicateOverlapGate,
    recallFloorScore: config.recallFloorScore ?? DEFAULT_CORE_CONFIG.recallFloorScore,
    shadowPassRate: config.shadowPassRate ?? DEFAULT_CORE_CONFIG.shadowPassRate,
    deletionFeedbackIntervalHours: config.deletionFeedbackIntervalHours ?? DEFAULT_CORE_CONFIG.deletionFeedbackIntervalHours,
    deletionFeedbackMinDeletions: config.deletionFeedbackMinDeletions ?? DEFAULT_CORE_CONFIG.deletionFeedbackMinDeletions,
  }
}

/**
 * Host plugin body: open the SQLite store, provide `ctx.memory`, and adopt
 * the monitoring workspace directory once a workspace registry is available.
 * @param ctx - host context.
 * @param config - plugin config (see {@link Config}).
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  const coreConfig: MemoryCoreConfig = {
    ...DEFAULT_CORE_CONFIG,
    diaryExtractEvery: resolved.diaryExtractEvery,
    diaryExtractIntervalHours: resolved.diaryExtractIntervalHours,
    recallTopK: resolved.recallTopK,
    injectionBudgetTokens: resolved.injectionBudgetTokens,
    challengeConsecutiveFails: resolved.challengeConsecutiveFails,
    challengeWindow: resolved.challengeWindow,
    challengeWindowFailRate: resolved.challengeWindowFailRate,
    familyLiveCap: resolved.familyLiveCap,
    complexityTokenGate: resolved.complexityTokenGate,
    complexityStepGate: resolved.complexityStepGate,
    duplicateOverlapGate: resolved.duplicateOverlapGate,
    recallFloorScore: resolved.recallFloorScore,
    shadowPassRate: resolved.shadowPassRate,
    deletionFeedbackIntervalHours: resolved.deletionFeedbackIntervalHours,
    deletionFeedbackMinDeletions: resolved.deletionFeedbackMinDeletions,
  }

  mkdirSync(join(resolved.databasePath, '..'), { recursive: true })
  const db = new DatabaseSync(resolved.databasePath)
  const store = new MemoryStore(db)
  const core = new MemoryCore(store, coreConfig)

  const workbenchInfo = (): MemoryWorkbenchInfo => ({
    workspacePath: resolved.workspacePath,
    workspaceTitle: resolved.workspaceTitle,
    databasePath: resolved.databasePath,
    diaryExtractEvery: resolved.diaryExtractEvery,
    injectionBudgetTokens: resolved.injectionBudgetTokens,
  })
  // Fetch the LLM service handle now, while this fiber is ACTIVE. Accessing
  // ctx.llm in a Remote call context fails ("cannot get property llm without
  // inject"), so we capture a stable reference here instead.
  const llm = ctx.get('llm') as { stream(options: unknown): AsyncIterable<{ type: string; text?: string; index?: number }> } | undefined
  const defaultModel = ctx.get('agentDefaultModel') as { currentSelection(): { provider: string; model: string } } | undefined
  new MemoryService(ctx, core, workbenchInfo, llm, defaultModel)

  ctx.effect(() => () => {
    try { db.close() } catch { /* already closed */ }
  }, 'memory: SQLite store lifetime')
}
