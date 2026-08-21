/**
 * Memory workbench plugin, browser half: mounts the generated memory Remote
 * contribution, then registers two entries — a conversation.session.header.utilities
 * entry (right of the session title, left of the Session log button) and a
 * shell.overlay takeover (the monitoring pages on the right).
 *
 * CRITICAL: the header slot has scope "session" and the overlay slot has scope
 * "root". DSH enforces "one handle, one scope" — a single EngineStoreHandle
 * cannot be mounted under both. Page selection is therefore shared through a
 * module-level observable (navStore.ts) instead of a DSH store handle. Neither
 * registration passes a `store` option, so no scope pinning occurs.
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-layout SlotMap merge (the shell.overlay entry) and
// the ui-conversation SlotMap merge (the conversation.session.header.utilities entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import memoryRemote from 'dsh-daoing-memory/remote'
import type { MemoryRemoteActions } from './actions.ts'
import { MemoryHeaderAction } from './MemoryHeaderAction.tsx'
import { MemoryWorkbench } from './Workbench.tsx'
import { selectPage } from './navStore.ts'

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
 * header entry and the overlay takeover. Page selection is shared through the
 * module-level observable in navStore.ts (not a DSH store handle) to avoid
 * the "one handle, one scope" conflict between the session-scoped header slot
 * and the root-scoped overlay slot.
 * @param ctx - client root context.
 * @returns disposer after both entries and the Remote namespace unregister.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(memoryRemote)
  const memory = ctx.get('remote.memory') as TypertClientRemote['memory'] | undefined
  if (memory === undefined) throw new Error('memory: remote namespace did not mount')

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
    humanArchiveExperience: async (session: SessionId, request) => { unwrap(await memory.humanArchiveExperience(session, request)) },
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
    generateSkillDraft: async (session: SessionId, request) => unwrap(await memory.generateSkillDraft(session, request)),
    reviewSkill: async (session: SessionId, request) => unwrap(await memory.reviewSkill(session, request)),
    publishSkill: async (session: SessionId, request) => unwrap(await memory.publishSkill(session, request)),
    listSkillArtifacts: async (session: SessionId, parentExperienceId, status) => unwrap(await memory.listSkillArtifacts(session, parentExperienceId, status)),
    isSkillCandidate: async (session: SessionId, experienceId) => unwrap(await memory.isSkillCandidate(session, experienceId)),
  }

  // Header entry: no DSH store (avoids scope conflict with the root-scoped
  // overlay). The button calls selectPage() from the module-level observable.
  // order: -10 places it before the Session log button (order 0).
  const disposeNav = ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'memory-nav',
    order: -10,
    inject: () => ({ selectPage }),
  }, MemoryHeaderAction))

  // Overlay entry: no DSH store either. The workbench reads page state from
  // the module-level observable via useCurrentPage().
  const disposeOverlay = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'memory-workbench',
    order: 100,
    inject: () => actions,
  }, MemoryWorkbench))

  return async () => {
    disposeNav()
    disposeOverlay()
    await disposeMount()
  }
}
