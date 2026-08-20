# FAQ

[中文 →](./FAQ.zh-CN.md)

**Where is my memory stored?**
In a single SQLite database, `memory.db`, under your DSH storage directory (created on first write). It is shared by every session.

**Does uninstalling delete my memory?**
No. `dsh plugin remove` removes the plugin code and its profile rows, but leaves `memory.db` in place. Reinstalling picks the memory back up.

**How do I wipe all memory?**
Stop DSH, then delete `memory.db` from the DSH storage directory. This is the only destructive reset; it cannot be undone.

**Why are there two install channels?**
`dsh plugin add <name>` resolves from npm (convenient once published); `dsh plugin add github:owner/repo` installs straight from source (useful before publishing, or to pin a branch/commit). Both produce the same result.

**Does this conflict with an in-box memory plugin?**
Profile patches are last-write-wins per row id. Installing `daoing-dsh-memory` re-points the `memory` / `memory-tools` rows to this implementation rather than duplicating them. See INSTALL, Environment 2.

**How does recall decide what is relevant?**
By keyword/situation matching against the query. The library is process-global, so every experience is a candidate unless you pass an explicit `context` to narrow it.

**Is a vector/embedding index used?**
Not in v1. Recall is keyword/situation relevance over a curated, trusted library. Embedding-assisted recall is a planned extension (see STATUS).

**Can I hand-edit the extraction skill?**
Yes — it ships as a plain Markdown file. Run `install-skill.mjs` to place it, then edit the copy in your skills directory. Re-running with `--force` overwrites your edits with the packaged version, so edit the placed copy, not the source.

**Are schema upgrades safe?**
Yes. Migrations are additive only (never destructive), driven by a `schema_version` table. Upgrading the plugin never loses memory.

**Can humans and the agent both edit memory?**
Yes. The agent uses the `memory_*` tools; you use the workbench's Human Ops. Both are recorded in the same append-only ledger.

**Which profiles does it work with?**
Any DSH profile that loads plugins; the examples use `web`. Substitute your profile name in the `dsh plugin --profile <name>` commands.
