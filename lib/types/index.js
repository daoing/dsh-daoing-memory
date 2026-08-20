/**
 * Memory library host plugin: the self-evolving memory layer (生·用·修·记 +
 * diary/fact semantic memory). One process-global library shared by every
 * session, backed by a local SQLite file. Registers `ctx.memory`
 * (MemoryService). The monitoring UI is an independent left-sidebar nav group
 * (browser half), not a workspace; this host half performs no workspace
 * adoption.
 * @module dsh-daoing-memory
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CORE_CONFIG, MemoryCore } from "./core.js";
import { MemoryService } from "./service.js";
import { MemoryStore } from "./store.js";
export { MemoryCore, DEFAULT_CORE_CONFIG } from "./core.js";
export { MemoryService } from "./service.js";
export { MemoryStore, MEMORY_SCHEMA_VERSION } from "./store.js";
/** Resolve the plugin config with explicit defaults; unknown keys fail loud. */
export function resolveConfig(config) {
    const home = process.env.DSH_HOME ?? join(process.cwd(), '.dsh');
    const known = [
        'databasePath', 'workspacePath', 'workspaceTitle', 'diaryExtractEvery',
        'diaryExtractIntervalHours', 'recallTopK', 'injectionBudgetTokens',
        'challengeConsecutiveFails', 'challengeWindow', 'challengeWindowFailRate',
        'familyLiveCap', 'complexityTokenGate', 'complexityStepGate',
        'duplicateOverlapGate', 'recallFloorScore', 'shadowPassRate',
    ];
    const unknown = Object.keys(config).filter(key => !known.includes(key));
    if (unknown.length > 0) {
        throw new Error(`memory: unknown config key(s) ${unknown.join(', ')}`);
    }
    const databasePath = resolve(config.databasePath ?? join(home, 'storages', 'memory.db'));
    const workspacePath = resolve(config.workspacePath ?? join(home, 'memory-workbench'));
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
    };
}
/**
 * Host plugin body: open the SQLite store, provide `ctx.memory`, and adopt
 * the monitoring workspace directory once a workspace registry is available.
 * @param ctx - host context.
 * @param config - plugin config (see {@link Config}).
 */
export function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    const coreConfig = {
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
    };
    mkdirSync(join(resolved.databasePath, '..'), { recursive: true });
    const db = new DatabaseSync(resolved.databasePath);
    const store = new MemoryStore(db);
    const core = new MemoryCore(store, coreConfig);
    const workbenchInfo = () => ({
        workspacePath: resolved.workspacePath,
        workspaceTitle: resolved.workspaceTitle,
        databasePath: resolved.databasePath,
        diaryExtractEvery: resolved.diaryExtractEvery,
        injectionBudgetTokens: resolved.injectionBudgetTokens,
    });
    new MemoryService(ctx, core, workbenchInfo);
    ctx.effect(() => () => {
        try {
            db.close();
        }
        catch { /* already closed */ }
    }, 'memory: SQLite store lifetime');
}
//# sourceMappingURL=index.js.map