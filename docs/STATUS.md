# Status & Roadmap

[中文 →](./STATUS.zh-CN.md)

A reorganized development diary: **what is implemented today, what is not, and where this can grow.** Version 0.1.0, schema v5.

---

## Iteration history (condensed)

The design was worked out over a series of numbered design notes (001–010 in the original `memory-arch` series) plus external architecture reviews:

- **001–003** — design decisions, evidence/experiment, and the service roadmap that settled the two-memory model and the earned-trust lifecycle.
- **004** — first implementation status: diary + store + service + the initial tool surface.
- **005** — the consolidated *final design* around **生·用·修·记**, which the implementation follows.
- **006–010** — incremental rounds adding: experience lifecycle hardening, the ledger, the workbench UI, **round-2** (fact dedup + corroboration, concern **background**, the `thinking` kind, and profile-snapshot injection), landing at **schema v5**.

## ✅ Implemented

**Core store & lifecycle**
- Process-global SQLite store (`memory.db`) shared by all sessions; additive schema migrations (now **v5**).
- **Diary**: append-only raw entries (`memory_fact`).
- **Extraction**: `memory_extract` distills diary into **facts** and **concerns**.
- **Experience lifecycle**: `memory_ingest`, `memory_report`, `memory_revise`, `memory_refine`, `memory_verify`, rollback; trust is earned by reported use, promoted/demoted by evidence.
- **Recall**: `memory_recall` — keyword/situation relevance over the global library, with opt-in `context` narrowing.
- **Ledger**: append-only audit trail (`memory_ledger`, `memory_verify`).
- **Consolidation**: `memory_consolidate` for periodic housekeeping.

**Semantic memory (facts & concerns)**
- Nine user-centric fact categories.
- **Fact dedup**: same category+key+value merges into one entry with an incremented corroboration counter and merged source-diary ids.
- Concern kinds: todo / **thinking** / idea / question / decision / commitment / other.
- Concern **background** scene (schema v5) so the agent knows why a concern matters.
- Concern status + tree structure; filtered listing and counts.

**Integration & surface**
- **Profile-snapshot injection**: top facts + open concerns injected into the system prompt as a dedicated section.
- **Browser workbench**: Fact Diary, Experiences, Ledger, and Human Ops pages with filters and paging.
- **Human Ops**: manual promote / demote / pin / edit / delete, recorded in the ledger.
- **Remote API**: a typert remote surface so the browser half talks to the host store.
- **`memory-extraction` skill**: bundled guidance teaching the agent when/how to extract well.

**Packaging (this repo)**
- Distributable package `daoing-dsh-memory` with a `dsh.bundle.patch` for automatic profile wiring.
- Prebuilt host + browser artifacts shipped in `lib/` (install performs no build).
- One-command skill placement helper (`scripts/install-skill.mjs`).

## 🚧 Not implemented (yet)

- **Embedding-assisted recall.** Recall is keyword/situation relevance only; there is no vector index.
- **Cross-agent / multi-tenant isolation.** The store is one process-global library.
- **Automatic forgetting.** Decay/forgetting is explicit (human or consolidation), not policy-driven.
- **Concern auto-resolution.** Concerns don't yet close themselves when the underlying todo/question is settled.
- **Semantic dedup for experiences.** Fact dedup exists; near-duplicate experiences are not merged automatically.
- **Fully decoupled standalone build.** Artifacts are produced with the DSH build toolchain and shipped prebuilt; the repo does not yet rebuild from source on its own (see BUILDING).

## 🧭 Extension directions

Ordered roughly by leverage:

1. **Embedding-assisted recall** — augment (not replace) keyword relevance with a vector index for fuzzy matching, keeping the trusted-library governance.
2. **Fully standalone build** — vendor the build tooling so the package rebuilds from source without the DSH monorepo, enabling true independent iteration.
3. **Consolidation policies** — decay, cold storage, and compaction heuristics for long-lived memory.
4. **Concern lifecycle automation** — detect when a concern's loop is closed and propose resolution.
5. **Experience semantic dedup** — merge near-duplicate experience families.
6. **Multi-tenant scoping** — per-user or per-agent isolation on top of the global store.
7. **Marketplace maturity** — publish to npm, list on the DSH plugin marketplace, CI build/release.
8. **i18n & more fact categories** — broaden the user-centric taxonomy.

## Versioning

- **0.1.0** — first distributable release (this repo). Schema v5.

See [CHANGELOG.md](../CHANGELOG.md) for release notes.
