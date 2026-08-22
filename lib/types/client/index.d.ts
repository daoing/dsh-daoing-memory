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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Required services: slot seat, session list, and the Remote carrier. The
 * `remote.memory` namespace is NOT an inject dependency: this plugin mounts
 * that contribution itself inside apply — waiting on it here would deadlock
 * the fiber (a plugin cannot wait on its own provision).
 */
export declare const inject: string[];
/**
 * Client plugin body: mount the memory Remote contribution, then register the
 * header entry and the overlay takeover. Page selection is shared through the
 * module-level observable in navStore.ts (not a DSH store handle) to avoid
 * the "one handle, one scope" conflict between the session-scoped header slot
 * and the root-scoped overlay slot.
 * @param ctx - client root context.
 * @returns disposer after both entries and the Remote namespace unregister.
 */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map