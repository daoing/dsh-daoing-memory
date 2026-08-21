# Installing dsh-daoing-memory

[中文 →](./INSTALL.zh-CN.md)

This guide covers **two DSH environments** (an officially installed DSH, and a DSH run from a source checkout) and **two install channels** (an npm package name, or a git/GitHub URL), plus uninstall and skill placement.

> **TL;DR** — `dsh plugin --profile web add <spec>`, then place the skill, then restart DSH.

---

## Prerequisites

- A working DSH. Either:
  - **Official install** — you started DSH with the official command and it manages profiles for you, or
  - **Source checkout** — you cloned the DSH monorepo and run it from source.
- `pnpm` on your `PATH` (the `dsh plugin` command is a thin forwarder over pnpm).
- A profile to install into. The web GUI uses the **`web`** profile; substitute another profile name if you use one.

The plugin declares `@deepseek-ai/*` framework packages as **peer dependencies**. You do not install them yourself — they are provided by the DSH you install into. The package ships its **prebuilt output** (`lib/`), so installing it performs **no build step**.

## Install channels

### Channel A — from npm (package name)

```sh
dsh plugin --profile web add dsh-daoing-memory
```

This resolves the package from the npm registry. Use this once the package is published.

### Channel B — from GitHub (git URL)

```sh
dsh plugin --profile web add github:daoing/dsh-daoing-memory
```

Equivalent forms also work: `git+https://github.com/daoing/dsh-daoing-memory.git`, optionally pinned with `#<branch|tag|commit>`.

Because this package ships prebuilt `lib/` and declares **no install-time build scripts**, a git install does not need to compile anything — pnpm simply materializes the files. (Many git-hosted DSH plugins build via a `prepare` script and then require an `allowBuilds` entry in the profile's `pnpm-workspace.yaml`; this package deliberately avoids that friction.)

## Environment 1 — Officially installed DSH

This is the common case: you installed DSH with the official command and run the web GUI.

**Install**

```sh
dsh plugin --profile web add dsh-daoing-memory        # from npm
# or
dsh plugin --profile web add github:daoing/dsh-daoing-memory   # from GitHub
```

The CLI adds the package to the `web` profile and, because the package declares `dsh.bundle.patch`, automatically appends it to the profile's bundle stack (`dsh.profile.bundles`). No manual wiring is needed.

**Place the extraction skill**

```sh
node node_modules/dsh-daoing-memory/scripts/install-skill.mjs
```

This copies `skill/memory-extraction.md` into your skills directory (`$DSH_HOME/skills`, falling back to `~/.dsh/skills`). It never overwrites an existing file; add `--force` to replace it. You may instead copy the file by hand — any location DSH scans for skills works.

**Restart DSH.** The memory tools, the profile-snapshot prompt injection, and the Memory workbench all activate on the next start.

**Uninstall**

```sh
# optionally remove the skill first
rm "$DSH_HOME/skills/memory-extraction.md"      # or ~/.dsh/skills/...
dsh plugin --profile web remove dsh-daoing-memory
```

Removing the package also removes its rows from the profile bundle stack automatically. Your stored memory (the SQLite database under your DSH storage) is **not** deleted by uninstall — see the FAQ if you want to wipe it.

## Environment 2 — DSH run from a source checkout

Here you cloned the DSH monorepo and run it from source (e.g. via the CLI's `web` command with a custom `DSH_HOME`).

**Install** — the same `dsh plugin` command works against your source profile:

```sh
dsh plugin --profile web add github:daoing/dsh-daoing-memory
```

> **Note on the in-box memory rows.** The source monorepo's base bundle already ships memory rows (`id: memory`, `id: memory-tools`). Profile patches are *last-write-wins per row id*, so installing `dsh-daoing-memory` **re-points** those existing rows to the `dsh-daoing-memory` implementation rather than duplicating them. If you instead want to run it side by side for comparison, rename the rows in your local `cordis.patch.yml`.

If you are *developing* the plugin and want live source iteration, you can install your local checkout by path instead:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-daoing-memory
```

(For deep monorepo development you may prefer to keep the package inside the DSH workspace; see `docs/BUILDING.md`.)

**Place the skill** and **restart** exactly as in Environment 1.

**Uninstall**

```sh
dsh plugin --profile web remove dsh-daoing-memory
```

## Verifying the install

After restarting DSH:

1. **Tools** — in a session, the agent can call `memory_fact`, `memory_extract`, `memory_recall`, etc. Ask it to "append a memory diary note" and check it succeeds.
2. **Profile injection** — the system prompt gains a compact memory/profile section once facts/concerns exist.
3. **Workbench** — the web left sidebar shows a **Memory** button at its foot (beside Settings); clicking it opens the workbench (Fact Diary / Experiences / Ledger / Human Ops).
4. **Database** — a `memory.db` appears under your DSH storage directory on first write.

If the Memory button is missing, the plugin likely did not join the bundle stack — see Troubleshooting.

## Troubleshooting

- **`dsh plugin` says the package "declares no dsh.bundle"** — you installed something that is not this plugin (or a stale build). Ensure you are installing `dsh-daoing-memory` and that its `package.json` declares `dsh.bundle.patch`.
- **Memory button missing after restart** — check the profile's bundle list includes `dsh-daoing-memory` (the CLI reconciles it on install). Restart DSH fully. (On DSH 0.1.1-rc.x the entry registers into `sidebar.footer.action`; on very old DSH releases the button may not appear.)
- **Row conflict in a source checkout** — the install re-points the in-box `memory` rows (by design). See the note in Environment 2.
- **A *different* git plugin asks for `allowBuilds`** — that plugin builds on install; add the key pnpm prints to the profile's `pnpm-workspace.yaml`. This package does not require it.
- **Skill not picked up** — confirm `memory-extraction.md` landed in the directory DSH scans for skills (`$DSH_HOME/skills`) and restart.

See also [FAQ.md](./FAQ.md), [BUILDING.md](./BUILDING.md), and [MIGRATION.md](./MIGRATION.md) (data location & migration).
