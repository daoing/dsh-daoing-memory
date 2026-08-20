# daoing-dsh-memory

> Self-evolving memory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) — earned experiences, diary/fact semantic memory, concern tracking, and an append-only audit ledger.

[中文文档 →](./README.zh-CN.md)

An agent without memory starts from zero every session. `daoing-dsh-memory` gives a DSH agent a **persistent, self-improving memory** that it *earns* through use: it keeps a diary, distills durable facts and open concerns about the user, accumulates verified experiences, recalls what is relevant, revises what turned out wrong, and records every change in an auditable ledger.

The design follows four verbs — **生 · 用 · 修 · 记** (*Generate · Use · Revise · Record*).

---

## Why

Most "memory" bolt-ons either dump raw conversation into a vector store, or let the model write anything it likes into a key-value blob. Both fail in practice: the first buries signal in noise, the second lets a single hallucination poison every future session.

`daoing-dsh-memory` takes a different stance:

- **Memory must be earned.** An experience starts as a low-trust *candidate* and is promoted only after it is corroborated by real use. Nothing reaches high trust by fiat.
- **Two distinct memories.** *Semantic* memory (durable facts about the user + open concerns they care about) is separated from *experiential* memory (how-to knowledge with a lifecycle). They are written, recalled, and governed differently.
- **Every write is auditable.** An append-only ledger records each mutation, so memory drift or poisoning can be detected, attributed, and rolled back.
- **The human stays in the loop.** A browser workbench lets you read, correct, promote, and delete memories — memory is a shared artifact, not a black box.

## Features

| Area | What you get |
| --- | --- |
| **Diary (记)** | `memory_fact` — append raw session notes; the substrate everything else is distilled from. |
| **Extraction (生)** | `memory_extract` — distill diary entries into durable **facts** (9 user-centric categories, deduplicated & corroborated) and **concerns** (todo / thinking / idea / question / decision / commitment, each with a background scene). |
| **Experience lifecycle (生·用·修)** | `memory_ingest`, `memory_report`, `memory_revise`, `memory_refine`, `memory_verify` — experiences are born as candidates, earn trust through reported use, get revised when wrong, and roll back cleanly. |
| **Recall (用)** | `memory_recall` — keyword/situation relevance over the shared experience library, with optional context scoping. |
| **Audit** | `memory_ledger`, `memory_verify` — query the append-only ledger and verify integrity. |
| **Consolidation** | `memory_consolidate` — periodic compaction/housekeeping of the store. |
| **Profile injection** | A compact profile snapshot (top facts + open concerns) is injected into the system prompt, so the agent *knows the user* without being asked. |
| **Workbench UI** | A browser panel (Fact Diary / Experiences / Ledger / Human Ops) to inspect and curate memory by hand. |
| **Extraction skill** | A bundled `memory-extraction` skill that teaches the agent *when and how* to extract high-quality memory. |

## Install

Two DSH environments are supported — a **source checkout** of DSH and an **officially installed** DSH — and two install channels (npm package name, or a git/GitHub URL). See **[docs/INSTALL.md](./docs/INSTALL.md)** for the full matrix including uninstall and skill placement.

Quick start for an officially installed DSH:

```sh
# from npm (once published)
dsh plugin --profile web add daoing-dsh-memory

# or straight from GitHub
dsh plugin --profile web add github:daoing/daoing-dsh-memory

# place the extraction skill where DSH loads skills from
node node_modules/daoing-dsh-memory/scripts/install-skill.mjs
```

Then restart DSH. The memory tools become available to your agent, the profile snapshot starts being injected, and a **Memory** section appears in the web sidebar.

## Usage

Once installed, the agent gains the `memory_*` tools. Typical flow:

1. During a session the agent appends raw notes with `memory_fact`.
2. At a natural pause it runs `memory_extract` to distill facts + concerns (guided by the `memory-extraction` skill).
3. In later sessions `memory_recall` surfaces relevant experiences; a compact profile snapshot is already present in the system prompt.
4. When an experience is confirmed useful the agent calls `memory_report`; when it is wrong, `memory_revise`.
5. You can inspect and curate everything in the **Memory** workbench.

See **[docs/INSTALL.md](./docs/INSTALL.md)** for usage details and **[docs/STATUS.md](./docs/STATUS.md)** for what is implemented today.

## Design

The architecture, the trust/earning model, the data schema, and the anti-pollution boundaries are documented in **[docs/DESIGN.md](./docs/DESIGN.md)**. Current implementation status and extension directions live in **[docs/STATUS.md](./docs/STATUS.md)**.

## Project layout

```
daoing-dsh-memory/
├── lib/                    # prebuilt artifacts (host + browser bundle + typert)
├── src/                    # TypeScript source (for reference & iteration)
├── skill/                  # bundled memory-extraction skill (standalone .md)
├── cordis.patch.yml        # profile patch that wires the plugin into DSH
├── scripts/                # prepare + install-skill helpers
└── docs/                   # INSTALL · DESIGN · STATUS · BUILDING · FAQ
```

## Building & publishing

This repository ships its build output (`lib/`) so that installing it never requires the DSH monorepo toolchain. See **[docs/BUILDING.md](./docs/BUILDING.md)** for how the package is produced, published to npm, and listed on the DSH plugin marketplace.

## License

[MIT](./LICENSE) © daoing
