/**
 * Memory workbench plugin, browser half: mounts the generated memory Remote
 * contribution, then registers two entries that share one nav store — a
 * sidebar.footer.action entry (foot of the left column, beside Settings) and
 * a shell.overlay takeover (the monitoring pages on the right). Selecting the
 * footer entry shows the matching page; opening a session returns to the
 * native conversation view.
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
 * nav group and the overlay takeover sharing one nav store handle.
 * @param ctx - client root context.
 * @returns disposer after both entries and the Remote namespace unregister.
 */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map