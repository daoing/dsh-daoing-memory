/**
 * Model-facing tools over the memory library: the agent drives its own
 * 生·用·修·记 loop through these tools.
 *
 * - memory_recall:  用 — before a task: recall + adjudication + budget.
 * - memory_refine:  生 — after a complex task: refine into a candidate.
 * - memory_report:  用·验 — report one outcome with attribution.
 * - memory_revise:  修 — propose a revision for a challenged experience.
 * - memory_verify:  修 — shadow-replay verification of a draft (V1).
 * - memory_fact:    记 — append a diary entry (event layer).
 * - memory_extract: 记 — propose extracted profile facts (upward channel).
 * - memory_human_inject: 特殊通道 — direct human experience injection (source=human, ledger-audited).
 * - memory_ledger:  账本 — query the audit ledger.
 *
 * @module dsh-daoing-memory/tools
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "memory-tools";
export declare const inject: string[];
/**
 * Host plugin body: register the memory tools and the 生·用·修·记 protocol
 * section. Mounted by each agent preset that should see the tools.
 * @param ctx - host context inside the agent realm.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=tools.d.ts.map