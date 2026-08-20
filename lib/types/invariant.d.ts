/**
 * Package-owned memory invariants. Asserts the append-only ledger's owned
 * relationship — every block's hash chains to its predecessor, recomputed
 * from the block content — against the durable store at companion attach
 * time. Ledger appends happen in-process through MemoryCore, which chains
 * each new block to the live head, so a broken chain at attach time means
 * the persisted file was corrupted or tampered with externally.
 * @module daoing-dsh-memory/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "memory-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register the memory invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map