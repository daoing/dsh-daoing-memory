/**
 * Package-owned memory invariants. Asserts the append-only ledger's owned
 * relationship — every block's hash chains to its predecessor, recomputed
 * from the block content — against the durable store at companion attach
 * time. Ledger appends happen in-process through MemoryCore, which chains
 * each new block to the live head, so a broken chain at attach time means
 * the persisted file was corrupted or tampered with externally.
 * @module dsh-daoing-memory/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { MemoryService } from './service.ts'

const PACKAGE_NAME = 'dsh-daoing-memory'

/** Cordis companion plugin name. */
export const name = 'memory-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Verify the ledger hash chain end to end against the live store. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const memory = ctx.get('memory') as MemoryService | undefined
  if (memory === undefined) {
    fail('memory invariant: the memory service is not provided')
    return
  }
  const result = memory.verifyLedgerIntegrity()
  if (!result.ok) {
    fail(`memory ledger hash chain broken at seq ${String(result.brokenAt ?? 0)} (checked ${String(result.checked)} blocks)`)
  }
}, { inject: ['memory'] })

/**
 * Register the memory invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
