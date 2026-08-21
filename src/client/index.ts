/**
 * Memory workbench plugin, browser half: mounts the generated memory Remote
 * contribution, then registers two entries that share one nav store — a
 * sidebar.footer.action entry (foot of the left column, beside Settings) and
 * a shell.overlay takeover (the monitoring pages on the right). Selecting the
 * footer entry shows the matching page; opening a session returns to the
 * native conversation view.
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-layout SlotMap merge (the shell.overlay entry) and
// the ui-sidebar SlotMap merge (the sidebar.footer.action entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import memoryRemote from 'dsh-daoing-memory/remote'
import type { MemoryRemoteActions } from './actions.ts'
import { MemoryFooterAction } from './MemoryFooterAction.tsx'
import { MemoryWorkbench } from './Workbench.tsx'
import { createMemoryNavStore } from './navStore.ts'

/**
 * Required services: slot seat, session list, and the Remote carrier. The
 * `remote.memory` namespace is NOT an inject dependency: this plugin mounts
 * that contribution itself inside apply — waiting on it here would deadlock
 * the fiber (a plugin cannot wait on its own provision).
 */
export const inject = ['slots', 'sessions', 'remote']

/** Fold the RemoteResult envelope; carrier failures surface as thrown errors the pages catch. */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(result.error.message)
}

/**
 * Client plugin body: mount the memory Remote contribution, then register the
 * nav group and the overlay takeover sharing one nav store handle.
 * @param ctx - client root context.
 * @returns disposer after both entries and the Remote namespace unregister.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(memoryRemote)
  // $mount registers a standalone `remote.memory` service; read it through the
  // strict global store (ctx.get) — the ctx property proxy would demand an
  // inject declaration, and injecting a service this plugin itself provides
  // deadlocks the fiber.
  const memory = ctx.get('remote.memory') as TypertClientRemote['memory'] | undefined
  if (memory === undefined) throw new Error('memory: remote namespace did not mount')

  // Every generated method takes the session id first (wire transform of the
  // host Agent parameter); the workbench binds it once the current session is
  // known, so pages keep calling the session-free face.
  const actions: MemoryRemoteActions = {
    workbenchInfo: async (session: SessionId) => unwrap(await memory.workbenchInfo(session)),
    stats: async (session: SessionId) => unwrap(await memory.stats(session)),
    listExperiences: async (session: SessionId, filter) => unwrap(await memory.list(session, filter)),
    family: async (session: SessionId, id) => unwrap(await memory.family(session, id)),
    listDiary: async (session: SessionId, limit, offset, onlyUnextracted) => unwrap(await memory.listDiary(session, limit, offset, onlyUnextracted)),
    getDiaryByIds: async (session: SessionId, ids) => unwrap(await memory.getDiaryByIds(session, ids)),
    listFacts: async (session: SessionId, category, includeHistory, limit, offset) => unwrap(await memory.listFacts(session, category, includeHistory, limit, offset)),
    listFactsCount: async (session: SessionId, category, includeHistory) => unwrap(await memory.listFactsCount(session, category, includeHistory)),
    listConcerns: async (session: SessionId, kind, status, limit, offset) => unwrap(await memory.listConcerns(session, kind, status, limit, offset)),
    listConcernsCount: async (session: SessionId, kind, status) => unwrap(await memory.listConcernsCount(session, kind, status)),
    extractionLog: async (session: SessionId, limit, offset) => unwrap(await memory.extractionLog(session, limit, offset)),
    extractionLogCount: async (session: SessionId) => unwrap(await memory.extractionLogCount(session)),
    consolidate: async (session: SessionId, request) => unwrap(await memory.consolidate(session, request)),
    consolidationDue: async (session: SessionId) => unwrap(await memory.consolidationDue(session)),
    ledgerQuery: async (session: SessionId, request) => unwrap(await memory.ledgerQuery(session, request)),
    ledgerQueryCount: async (session: SessionId, request) => unwrap(await memory.ledgerQueryCount(session, request)),
    verifyLedger: async (session: SessionId) => unwrap(await memory.verifyLedger(session)),
    exportLibrary: async (session: SessionId) => unwrap(await memory.exportLibrary(session)),
    humanPin: async (session: SessionId, request) => unwrap(await memory.humanPin(session, request)),
    humanDeleteExperience: async (session: SessionId, request) => { unwrap(await memory.humanDeleteExperience(session, request)) },
    humanEditExperience: async (session: SessionId, request) => unwrap(await memory.humanEditExperience(session, request)),
    humanAddExperience: async (session: SessionId, request) => unwrap(await memory.humanAddExperience(session, request)),
    humanPromote: async (session: SessionId, id, reason) => unwrap(await memory.humanPromote(session, id, reason)),
    humanRollback: async (session: SessionId, request) => unwrap(await memory.humanRollback(session, request)),
    humanAddFact: async (session: SessionId, request) => unwrap(await memory.humanAddFact(session, request)),
    humanEditFact: async (session: SessionId, request) => unwrap(await memory.humanEditFact(session, request)),
    humanDeleteFact: async (session: SessionId, request) => { unwrap(await memory.humanDeleteFact(session, request)) },
    humanConfirmFact: async (session: SessionId, request) => unwrap(await memory.humanConfirmFact(session, request)),
    humanAckDiary: async (session: SessionId, request) => unwrap(await memory.humanAckDiary(session, request)),
    humanSetConcernStatus: async (session: SessionId, request) => { unwrap(await memory.humanSetConcernStatus(session, request)) },
    humanDeleteConcern: async (session: SessionId, request) => { unwrap(await memory.humanDeleteConcern(session, request)) },
    humanReleaseCold: async (session: SessionId, request) => unwrap(await memory.humanReleaseCold(session, request)),
    ingest: async (session: SessionId, request) => unwrap(await memory.ingest(session, request)),
  }

  // One nav store shared by both registrations: the footer entry writes the
  // selection, the overlay reads it. Both slots belong to other packages
  // (ui-sidebar / ui-layout), so register through slots.inject — it waits for
  // the declaration and removes the contribution when it collapses.
  const navStore = createMemoryNavStore()
  const disposeNav = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'memory-nav',
    order: 100,
    store: navStore,
  }, MemoryFooterAction))
  const disposeOverlay = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'memory-workbench',
    order: 100,
    store: navStore,
    inject: () => actions,
  }, MemoryWorkbench))

  return async () => {
    disposeNav()
    disposeOverlay()
    await disposeMount()
  }
}
