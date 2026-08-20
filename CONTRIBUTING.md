# Contributing

Thanks for your interest in making agent memory better. 感谢关注，欢迎一起把 agent 记忆做好。

## Ways to contribute

- **Report bugs / request features** — open an issue with a minimal reproduction and, for memory-quality issues, the relevant diary/fact/experience shape (no private data).
- **Improve the extraction skill** — `skill/memory-extraction.md` is plain Markdown; better guidance directly improves every extraction.
- **Docs & translations** — the project is bilingual (English primary, Chinese alongside); corrections and new translations are welcome.
- **Extension directions** — see `docs/STATUS.md`; embedding-assisted recall, the standalone build, and consolidation policies are high-leverage areas.

## Working with the code

- `src/` is the TypeScript source. The shipped `lib/` is produced with the DSH build toolchain (see `docs/BUILDING.md`); a fully standalone from-source build is an open extension direction.
- The data schema is additive-only. If you change the store, bump `schema_version` with a non-destructive migration and update both the schema and the migration path.
- Keep the two memories separate (semantic vs experiential) and preserve the earned-trust model; these are core invariants (see `docs/DESIGN.md`).

## Conventions

- Every write path must stay auditable — mutations append to the ledger.
- Trust is earned and revocable; do not add paths that promote memory without evidence of use.
- Human-facing surfaces (workbench) and agent-facing surfaces (tools) both go through the same service, so behavior stays consistent.

## Pull requests

1. Describe the change and why, linking any issue.
2. Keep the change scoped; update docs and `CHANGELOG.md` alongside code.
3. If the change affects the store or the wire protocol, call that out explicitly.

## License

By contributing you agree your contributions are licensed under the project's [MIT License](./LICENSE).
