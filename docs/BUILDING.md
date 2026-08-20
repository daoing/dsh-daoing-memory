# Building & Publishing

[中文 →](./BUILDING.zh-CN.md)

How `dsh-daoing-memory` is produced, published, and listed — and the honest status of its build independence.

---

## The short version

This repository **ships its build output** (`lib/`). Installing it — from npm or from a git URL — performs **no build step**. The artifacts are produced with the DSH build toolchain and committed/published, so end users never need the monorepo.

```
source (src/)  --(DSH build toolchain)-->  lib/  --(commit / npm publish)-->  installable
```

## What is built

The plugin has two halves, both emitted into `lib/`:

- **Host half** (Node): `lib/index.js`, `lib/tools.js`, `lib/invariant.js`, plus `lib/types/**` (typed entrypoints for `/core`, `/store`, `/service`, `/types`, …) and the typert descriptors `lib/typert.host.js` / `lib/typert.remote-client.js`.
- **Client half** (browser): `lib/client.js` — a module-loader bundle for the workbench UI, plus `lib/types/client/**`.

## Reproducing the build (maintainer)

The canonical build runs inside a DSH source checkout, because the plugin's client bundle uses DSH's shared build preset and the host build uses the workspace's TypeScript project graph. In the DSH monorepo:

```sh
pnpm run build:lib        # builds host + client faces for the workspace
```

then copy the memory package's `lib/` into this repository (or point the release pipeline at it). The package's `exports`, `files`, and `dsh` manifest already describe how those artifacts are consumed.

> **Status:** a fully decoupled, from-source build inside this repo is the top
> extension direction (see STATUS). It means vendoring the DSH client-bundle
> preset and converting workspace type references to the published
> `@deepseek-ai/*` packages. Until then, rebuilding happens in a DSH checkout
> and the results are shipped here.

## Publishing to npm

Once you have an npm account / org:

```sh
# 1. ensure lib/ is current and package.json version is bumped
# 2. dry-run to see exactly what will be published
npm publish --dry-run
# 3. publish (add --access public if using a scope)
npm publish
```

The `files` field limits the tarball to `lib/`, `skill/`, `cordis.patch.yml`, `README.md`, and `LICENSE`. After publishing, `dsh plugin --profile web add dsh-daoing-memory` resolves it from the registry.

## Listing on the DSH plugin marketplace

The DSH plugin marketplace discovers plugins from GitHub repositories tagged with the **`dsh-plugin`** topic. To list this project:

1. Push this repository to GitHub (e.g. `daoing/dsh-daoing-memory`).
2. In the repo **About** settings, add the topic `dsh-plugin`.
3. Keep the `dsh.bundle.patch` declaration (that is what makes it installable as a profile layer).

After that it is discoverable via the marketplace and installable directly by git URL:

```sh
dsh plugin --profile web add github:daoing/dsh-daoing-memory
```

## Renaming note

The distributed package is named `dsh-daoing-memory`. Internally, the built artifacts carry the same identifier consistently (module-loader bundle id, typert `package` field, and RPC method prefixes), so the host and client halves agree. If you rename the package, regenerate the artifacts so every self-reference matches the new name.
