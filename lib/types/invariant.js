/**
 * Package-owned memory invariants. Asserts the append-only ledger's owned
 * relationship — every block's hash chains to its predecessor, recomputed
 * from the block content — against the durable store at companion attach
 * time. Ledger appends happen in-process through MemoryCore, which chains
 * each new block to the live head, so a broken chain at attach time means
 * the persisted file was corrupted or tampered with externally.
 * @module daoing-dsh-memory/invariant
 */
const PACKAGE_NAME = 'daoing-dsh-memory';
/** Cordis companion plugin name. */
export const name = 'memory-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/** Verify the ledger hash chain end to end against the live store. */
const install = Object.assign((ctx, fail) => {
    const memory = ctx.get('memory');
    if (memory === undefined) {
        fail('memory invariant: the memory service is not provided');
        return;
    }
    const result = memory.verifyLedgerIntegrity();
    if (!result.ok) {
        fail(`memory ledger hash chain broken at seq ${String(result.brokenAt ?? 0)} (checked ${String(result.checked)} blocks)`);
    }
}, { inject: ['memory'] });
/**
 * Register the memory invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map