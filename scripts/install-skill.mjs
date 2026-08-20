/**
 * Install the bundled memory-extraction skill into the DSH skills directory.
 *
 * daoing-dsh-memory ships the extraction skill as a standalone Markdown file
 * (skill/memory-extraction.md) rather than embedding it, so you can read and
 * hand-edit it like any other skill. Run this once after installing the
 * plugin to place it where DSH loads skills from:
 *
 *   node node_modules/daoing-dsh-memory/scripts/install-skill.mjs
 *
 * Idempotent and non-destructive: if the skill already exists in the target
 * it is left untouched (your edits are never clobbered). Pass --force to
 * overwrite it with the copy shipped in this package.
 *
 * The target directory is $DSH_HOME/skills (falls back to ~/.dsh/skills when
 * DSH_HOME is not set), which is where DSH discovers filesystem skills.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const force = process.argv.includes('--force')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const skillsDir = join(dshHome, 'skills')
const source = new URL('../skill/memory-extraction.md', import.meta.url)
const target = join(skillsDir, 'memory-extraction.md')

if (!existsSync(source)) {
  console.error('daoing-dsh-memory: bundled skill not found at', source.pathname ?? source)
  process.exit(1)
}
if (existsSync(target) && !force) {
  console.log(`skill already present at ${target} — kept as-is. Re-run with --force to overwrite.`)
  process.exit(0)
}
mkdirSync(skillsDir, { recursive: true })
copyFileSync(source, target)
console.log(`installed memory-extraction skill -> ${target}`)
