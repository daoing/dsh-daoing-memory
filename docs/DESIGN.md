# Design of dsh-daoing-memory

[中文 →](./DESIGN.zh-CN.md)

This document explains **what the plugin is for**, **the thinking behind its structure**, and **the principles that govern it**.

---

## 1. What it is for

An LLM agent forgets everything the moment a session ends. The usual fixes — stuffing conversation into a vector store, or letting the model scribble into a key-value blob — both degrade quickly: one buries signal in noise, the other lets a single hallucination poison every future session.

`dsh-daoing-memory` exists to give a DSH agent a **persistent memory that improves with use and stays trustworthy**. Concretely it provides:

- A **diary** the agent writes during a session (raw, cheap, low-trust).
- **Semantic memory** distilled from the diary: durable *facts* about the user and *concerns* the user cares about.
- **Experiential memory**: reusable how-to knowledge with a trust lifecycle.
- **Recall** of relevant experience into future sessions.
- A **ledger** that records every mutation, so memory can be audited and rolled back.
- A **workbench** so a human can read and curate all of it.

The whole thing is one process-global SQLite store shared by every session, so memory accumulates across the agent's entire life, not per conversation.

## 2. The four verbs: 生 · 用 · 修 · 记

The design is organized around four verbs. Every capability belongs to exactly one.

| Verb | Meaning | Capabilities |
| --- | --- | --- |
| **记 Record** | Capture raw signal cheaply, before judging it. | `memory_fact` (diary append), the ledger. |
| **生 Generate** | Distill raw signal into structured memory. | `memory_extract` (facts + concerns), `memory_ingest` (external → experiences). |
| **用 Use** | Bring the right memory into the next session. | `memory_recall`, profile-snapshot injection. |
| **修 Revise** | Fix memory when reality disagrees. | `memory_report`, `memory_revise`, `memory_refine`, `memory_verify`, rollback. |

This split matters because each verb has a different trust posture: recording is cheap and permissive, generating is selective, using is read-mostly, and revising is the only path that *removes or downgrades* — so it is the most guarded.

## 3. Two memories, deliberately separate

A core decision is that **semantic** and **experiential** memory are different substances and are never merged.

**Semantic memory (facts + concerns)** describes *the user and their world.* It is declarative, slow-changing, and injected proactively. A fact belongs to one of nine user-centric categories; concerns carry a `kind` (todo / thinking / idea / question / decision / commitment / other) and a **background** scene so the agent knows *why* the user cares.

**Experiential memory** describes *what works.* Each experience is a family of revisions carrying a trust state and a usage record. Experiences are recalled on demand by relevance, not injected wholesale.

Keeping them apart means the governance fits the content: you want facts corroborated and deduplicated, but you want experiences promoted and demoted by evidence of use.

## 4. Memory must be earned

The trust model is the heart of the design.

- An experience is **born a candidate** (low trust). It does not get to be "true" by being written down.
- Each time the agent uses an experience and reports the outcome (`memory_report`), the evidence accumulates. Repeated success **promotes** it; reported failure **demotes** it.
- Promotion is therefore *earned from real use*, never asserted. A plausible-sounding but useless experience stays low-trust and eventually goes cold.
- The same evidence trail means a poisoned or wrong experience can be *demoted and rolled back* rather than silently trusted.

This is the direct answer to the "one hallucination poisons everything" failure mode: writes are cheap, but *trust is expensive and revocable*.

## 5. Facts: deduplicate and corroborate

When extraction produces a fact that matches an existing one (same category + key + value), the store does **not** add a duplicate. It increments a **corroboration** counter and merges the source diary ids. Frequently re-observed facts thus become more solid; one-offs stay light. This keeps the fact table compact and makes the profile snapshot meaningful.

## 6. Every write is auditable

All mutations append to an **append-only ledger** (`memory_ledger` to query, `memory_verify` to check integrity). Nothing is edited in place in the ledger; corrections are new entries. This gives you:

- **Attribution** — you can see which diary/session produced a memory.
- **Drift detection** — you can spot when memory is being nudged in a direction.
- **Rollback** — a bad revision can be undone because the prior state is still there.

Auditability is a first-class design goal, not an afterthought, because a self-modifying memory is only safe if its modifications can be inspected.

## 7. The human stays in the loop

Memory is a shared artifact. The browser **workbench** exposes:

- **Fact Diary** — the raw diary and the distilled facts/concerns (with filters and the concern *background* inline).
- **Experiences** — the experience library with trust state and usage.
- **Ledger** — the audit trail.
- **Human Ops** — manual promote / demote / pin / edit / delete.

Human operations are recorded in the ledger too, so human and agent edits live in one auditable history.

## 8. Recall: relevance, and optional scoping

`memory_recall` ranks experiences by **keyword/situation relevance** against the query. The library is **process-global** — by default every experience is a candidate for every session. A recall request may optionally pass a `context`; when present, candidates are restricted to experiences tagged with that context or marked global. This is *opt-in narrowing*, not a hard wall: without a context, nothing is filtered out.

## 9. Profile injection: know the user without asking

On each run the plugin builds a compact **profile snapshot** (top facts + open concerns) and injects it into the system prompt as a dedicated section. The result is that the agent *already knows* stable user facts and open loops without spending a tool call to discover them — while the full, detailed memory remains queryable on demand.

## 10. Data model (schema v5)

The store is a single SQLite database (`memory.db`) with, in essence:

- `diary` — raw entries (append-only substrate).
- `facts` — distilled user facts (category, key, value, corroboration, source diary ids).
- `concerns` — open loops (kind, status, title, **background**, context, tree parent).
- `experiences` — the experience library (family id + revision, trust state, usage, context).
- `ledger` — the append-only audit trail.
- a `schema_version` table driving **additive migrations** (v5 adds the concern `background` column).

Migrations are additive (never destructive), so upgrading the plugin never loses memory.

## 11. Anti-pollution boundaries

Several rules keep memory from being trivially poisoned:

- Writes start **low-trust**; trust is earned and revocable (§4).
- The **ledger** makes every write attributable and reversible (§6).
- **Extraction is guided by a skill** that pushes the agent toward user-perception facts and open loops, and away from speculative noise.
- **Human Ops** can override anything, and doing so is itself recorded.

## 12. What we deliberately did *not* do

- **No vector store.** Recall is keyword/situation relevance over a curated, trusted library — not similarity over an undifferentiated dump. (Embedding-assisted recall is an extension direction, not the base.)
- **No automatic deletion.** Forgetting is explicit (human or consolidation), never silent.
- **No cross-agent shared semantics.** The library is one process-global store; multi-tenant isolation is out of scope for v1.

These are conscious trade-offs favoring *trust and auditability* over raw retrieval scale. See [STATUS.md](./STATUS.md) for extension directions.
