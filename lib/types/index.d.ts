/**
 * Memory library host plugin: the self-evolving memory layer (生·用·修·记 +
 * diary/fact semantic memory). One process-global library shared by every
 * session, backed by a local SQLite file. Registers `ctx.memory`
 * (MemoryService). The monitoring UI is an independent left-sidebar nav group
 * (browser half), not a workspace; this host half performs no workspace
 * adoption.
 * @module dsh-daoing-memory
 */
import type { Context } from '@deepseek-ai/cordis';
import { MemoryService } from './service.ts';
export type * from './types.ts';
export { MemoryCore, DEFAULT_CORE_CONFIG } from './core.ts';
export type { MemoryCoreConfig } from './core.ts';
export { MemoryService } from './service.ts';
export { MemoryStore, MEMORY_SCHEMA_VERSION } from './store.ts';
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The memory library service (self-evolving memory). */
        memory: MemoryService;
    }
}
/** Plugin config: every deployment-varying tunable lives here (cordis.yml). */
export interface Config {
    /** SQLite database file path (default: $DSH_HOME/storages/memory.db). */
    databasePath?: string;
    /** Monitoring workspace folder (default: $DSH_HOME/memory-workbench). */
    /** Library display folder shown in the workbench info payload (no workspace is adopted). */
    workspacePath?: string;
    /** Library display title shown in the workbench info payload. */
    workspaceTitle?: string;
    /** Diary entries that trigger one extraction run. */
    diaryExtractEvery?: number;
    /** Minimum hours between extraction runs. */
    diaryExtractIntervalHours?: number;
    /** Default recall candidate count. */
    recallTopK?: number;
    /** Injection budget in estimated tokens. */
    injectionBudgetTokens?: number;
    /** Consecutive experience-attributed failures that quarantine a live experience. */
    challengeConsecutiveFails?: number;
    /** Window size for the failure-rate challenge rule. */
    challengeWindow?: number;
    /** Failure rate within the window that challenges a live experience. */
    challengeWindowFailRate?: number;
    /** Live-revision cap per family tag (capacity budget). */
    familyLiveCap?: number;
    /** Complexity gate: token threshold. */
    complexityTokenGate?: number;
    /** Complexity gate: step threshold. */
    complexityStepGate?: number;
    /** Information-gain gate: overlap at/above this rejects a near-duplicate. */
    duplicateOverlapGate?: number;
    /** Minimum relevance score for injection. */
    recallFloorScore?: number;
    /** Shadow replay agreement required to adopt a draft. */
    shadowPassRate?: number;
    /** Minimum hours between deletion-feedback LLM summarization runs. */
    deletionFeedbackIntervalHours?: number;
    /** Minimum new deletions since last run to trigger summarization. */
    deletionFeedbackMinDeletions?: number;
}
/** Resolve the plugin config with explicit defaults; unknown keys fail loud. */
export declare function resolveConfig(config: Config): Required<Omit<Config, 'databasePath' | 'workspacePath'>> & {
    databasePath: string;
    workspacePath: string;
};
/**
 * Host plugin body: open the SQLite store, provide `ctx.memory`, and adopt
 * the monitoring workspace directory once a workspace registry is available.
 * @param ctx - host context.
 * @param config - plugin config (see {@link Config}).
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map