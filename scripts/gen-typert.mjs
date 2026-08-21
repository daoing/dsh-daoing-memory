/**
 * Standalone typert descriptor generator for dsh-daoing-memory.
 * Directly invokes WorkspaceTypertGenerator to produce typert.host.js and
 * typert.remote-client.js from the compiled lib/types artifacts.
 * Run from the DSH checkout root: node packages/memory/dsh-daoing-memory/scripts/gen-typert.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '../../../typert/generator/lib/types/workspace.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(__dirname, '..')
const workspaceRoot = resolve(packageDir, '..', '..', '..')
const outputDir = join(packageDir, 'lib')

console.log(`workspace root: ${workspaceRoot}`)
console.log(`package dir: ${packageDir}`)

const generator = new WorkspaceTypertGenerator(workspaceRoot)
const allPackages = generator.discover(['host'])
console.log(`discovered ${allPackages.length} package(s): ${allPackages.map(c => c.package).join(', ')}`)

const targetPackages = allPackages.filter(c => c.package === 'dsh-daoing-memory').map(c => c.package)
if (targetPackages.length === 0) {
  console.error('dsh-daoing-memory not discovered — check package.json exports for ./remote or ./typert')
  process.exit(1)
}

const artifacts = generator.generate(targetPackages, ['host'])
console.log(`generated ${artifacts.length} artifact(s)`)

mkdirSync(outputDir, { recursive: true })
for (const artifact of artifacts) {
  console.log(`  ${artifact.package} face=${artifact.face} js=${artifact.js.length}B dts=${artifact.dts.length}B`)
  writeFileSync(join(outputDir, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(join(outputDir, `typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote) {
    console.log(`    remote js=${artifact.remote.js.length}B dts=${artifact.remote.dts.length}B`)
    writeFileSync(join(outputDir, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(outputDir, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(outputDir, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}

// Verify namespace
const remoteFile = join(outputDir, 'typert.remote-client.js')
const content = readFileSync(remoteFile, 'utf8')
const pkgMatch = content.match(/package:\s*"([^"]+)"/)
console.log(`\nverification:`)
console.log(`  package field: ${pkgMatch ? pkgMatch[1] : 'NOT FOUND'}`)
console.log(`  dsh-daoing-memory refs: ${(content.match(/dsh-daoing-memory/g) || []).length}`)
console.log(`  @deepseek-ai/dsh-memory refs: ${(content.match(/@deepseek-ai\/dsh-memory/g) || []).length}`)
