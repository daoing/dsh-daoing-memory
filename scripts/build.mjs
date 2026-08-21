/**
 * Automated build script for dsh-daoing-memory.
 *
 * Runs the full host + client build pipeline inside a DSH source checkout:
 *   1. tsc -p tsconfig.host.json   — compile host sources to lib/types
 *   2. node scripts/gen-typert.mjs — generate typert descriptors (auto namespace)
 *   3. tsdown --env.DSH_BUILD_FACE host   — bundle lib/index.js, lib/invariant.js
 *   4. tsdown --env.DSH_BUILD_FACE client — bundle lib/client.js (browser)
 *
 * Usage (from the DSH checkout root):
 *   node packages/memory/dsh-daoing-memory/scripts/build.mjs
 *
 * Prerequisites:
 *   - DSH checkout with pnpm install completed
 *   - typert generator built: pnpm exec tsc -b packages/typert/generator
 *   - dsh-daoing-memory added to root tsconfig.host.json references
 */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(__dirname, '..')
const checkoutRoot = resolve(packageDir, '..', '..', '..')

function run(cmd, label) {
  console.log(`\n▶ ${label}`)
  console.log(`  $ ${cmd}`)
  try {
    execSync(cmd, { cwd: packageDir, stdio: 'inherit', shell: true })
  } catch (e) {
    console.error(`  ✗ ${label} failed`)
    process.exit(1)
  }
}

console.log(`DSH checkout: ${checkoutRoot}`)
console.log(`Package dir:  ${packageDir}`)

// Step 1: Compile host sources
run('pnpm exec tsc -p tsconfig.host.json', 'tsc host compilation')

// Step 2: Generate typert descriptors
run(`node "${resolve(__dirname, 'gen-typert.mjs')}"`, 'typert descriptor generation')

// Step 3: Bundle host half
run('pnpm exec tsdown --env.DSH_BUILD_FACE host', 'tsdown host bundle')

// Step 4: Bundle client half
run('pnpm exec tsdown --env.DSH_BUILD_FACE client', 'tsdown client bundle')

console.log('\n✓ Build complete')
