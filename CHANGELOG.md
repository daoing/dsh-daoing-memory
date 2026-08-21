# Changelog

All notable changes to `dsh-daoing-memory` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [Semantic Versioning](https://semver.org/).

## [0.1.5] - 2026

### Changed
- **Memory entry moved to session header (right of title, left of Session log).** Replaced the sidebar footer button with a text capsule in `conversation.session.header.utilities` (same visual style as Session log, no icon). The button only appears when a session is active.
- **Custom modal dialog replaces browser native prompt.** All audited operations (delete, rollback, pin, edit, etc.) now use a themed modal with textarea, Ctrl+Enter confirm, Esc cancel — no more ugly `window.prompt`. Also replaced the fact-value edit prompt with the same custom input dialog.

## [0.1.4] - 2026

### Changed
- **Automated build pipeline replaces manual typert patching.** Added `scripts/build.mjs` and `scripts/gen-typert.mjs` that run the full host+client build inside a DSH source checkout, auto-generating typert descriptors with the correct package namespace from `@Remote` decorators — no more manual copy-and-replace of namespace strings. Updated `package.json` files list to explicit paths (required by DSH's typert export validation). Registered the package in the DSH checkout's `tsconfig.host.json` project references so the typert generator discovers it.

## [0.1.3] - 2026

### Fixed
- **Remote namespace mismatch causing empty workbench data.** The bundled typert remote descriptor carried the original `@deepseek-ai/dsh-memory` package namespace instead of `dsh-daoing-memory`, so client-side Remote calls did not match the host service and returned empty statistics. Regenerated the descriptor with the correct namespace and rebuilt the client bundle.

## [0.1.2] - 2026

### Fixed
- **Restored full four-page navigation inside the workbench.** The 0.1.1 footer entry opened the overlay but only on the Experiences page, with no way to reach Fact Diary / Ledger / Human Ops. The workbench now carries its own tab bar (经验库监控 / 画像·日记 / 账本 / 人工管理) so all pages are reachable without relying on a sidebar nav group.

## [0.1.1] - 2026

### Fixed
- **Browser workbench entry now works on current DSH releases (0.1.1-rc.x).** The previous release registered the sidebar navigation group into the `sidebar.sections` slot, which no longer exists in `@deepseek-ai/dsh-client-ui-sidebar` — the entry silently never rendered. The entry now registers into `sidebar.footer.action` (a **Memory** button at the foot of the left sidebar, beside Settings) and opens the same `shell.overlay` workbench. No host-side or schema changes.

## [0.1.0] - 2026

First distributable release of the self-evolving memory plugin for DeepSeek Harness.

### Added
- **Diary** (`memory_fact`): append-only raw session notes.
- **Extraction** (`memory_extract`): distill diary into facts (9 user-centric categories) and concerns (todo / thinking / idea / question / decision / commitment / other), each concern carrying a background scene.
- **Fact dedup & corroboration**: matching facts merge into one entry with an incremented corroboration counter and merged source-diary ids.
- **Experience lifecycle**: `memory_ingest`, `memory_report`, `memory_revise`, `memory_refine`, `memory_verify`, and rollback; trust is earned by reported use.
- **Recall** (`memory_recall`): keyword/situation relevance over a process-global library with opt-in context narrowing.
- **Ledger** (`memory_ledger`, `memory_verify`): append-only audit trail with integrity checks.
- **Consolidation** (`memory_consolidate`).
- **Profile-snapshot injection**: top facts + open concerns injected into the system prompt.
- **Browser workbench**: Fact Diary, Experiences, Ledger, and Human Ops pages.
- **Human Ops**: manual promote / demote / pin / edit / delete, recorded in the ledger.
- **`memory-extraction` skill** bundled with the package.
- **Distributable packaging**: `dsh.bundle.patch` for automatic profile wiring; prebuilt host + browser artifacts; npm and git install channels.

### Schema
- SQLite schema at **v5** (additive migrations; v5 adds the concern `background` column).
