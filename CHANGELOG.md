# Changelog

All notable changes to `daoing-dsh-memory` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [Semantic Versioning](https://semver.org/).

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
