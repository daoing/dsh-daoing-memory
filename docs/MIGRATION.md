# Data location & migration

Where `dsh-daoing-memory` keeps its data, and how to move or back it up.

[中文文档 →](./MIGRATION.zh-CN.md)

## Where the data lives

All memory data — experiences, diary, facts, concerns, use reports, recall
history, and the append-only audit ledger — is stored in a **single SQLite
file**:

```
<DSH_HOME>/storages/memory.db
```

- `DSH_HOME` defaults to `~/.dsh`, so the usual path is `~/.dsh/storages/memory.db`.
- The store uses Node's built-in `node:sqlite` — no external database server.
- A sibling directory `<DSH_HOME>/memory-workbench/` is the monitoring
  workbench's display folder; **the actual data is all in `memory.db`**.
- The path is rooted at `DSH_HOME`, not inside a profile. Profiles under the
  same `DSH_HOME` therefore share one memory library.

## Migration

### Option 1 — copy the database file (recommended, full fidelity)

1. **Stop DSH.** Do not copy while the process holds the database open —
   copying mid-write can corrupt the file.
2. Copy `<old DSH_HOME>/storages/memory.db` to
   `<new DSH_HOME>/storages/memory.db` on the target environment.
3. Start DSH.

That one file carries **everything**: experiences, diary, facts, concerns,
use reports, recall events, and the audit ledger.

**Cross-version is safe.** When the store opens it runs its schema migrations
(e.g. the v4→v5 `ALTER`), so a database written by an older plugin version is
upgraded automatically on first open by a newer version.

### Option 2 — logical export (backup / inspection)

The workbench UI has an **Export** button that downloads
`memory-export-<timestamp>.json` (backed by `exportLibrary`). It contains
experiences, use reports, diary, facts, extractions, recall events, and the
ledger.

Two honest caveats:

- The export **does not include concerns** (nor consolidation records).
- There is **no symmetric "restore whole library" import**. The `ingest` tool
  accepts *candidate experiences* only — it is not a one-click restore.

So Option 2 is good for backup, auditing, and human review — **not** for a
complete migration. For a complete move, use Option 1.

### Option 3 — relocate via config

The plugin accepts a `databasePath` config key, so you can point the database
anywhere (for example onto a synced or larger volume):

```yaml
# in the memory row's config in your cordis composition
databasePath: /your/custom/path/memory.db
```

## Summary

> Migrate = stop DSH → copy `~/.dsh/storages/memory.db` to the same path on
> the target → restart. One file, all data and audit history, automatic
> cross-version schema upgrade.
