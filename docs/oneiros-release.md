# Oneiros coordinated prerelease

Proposed train, verified on Node 22.22.1:

| Package | Previous | Proposed | Runtime dependency / installer compatibility |
| --- | --- | --- | --- |
| persona | 1.0.0-0 | 1.0.0-1 | No runtime dependencies |
| memory | 1.0.0-0 | 1.0.0-1 | Existing optional gate/salience peers unchanged |
| scheduler | 1.0.0-2 | 1.0.0-3 | memory 1.0.0-1, persona 1.0.0-1, runner 1.0.0-0 |
| installer | 1.0.0-9 | 1.0.0-10 | memory/persona 1.0.0-1, scheduler 1.0.0-3, telegram 1.0.0-2, gate ^0.1.0 |

Runner 1.0.0-0 and Telegram 1.0.0-2 are already published and unchanged. Gate
^0.1.0 resolved to published 0.1.1 in the archive acceptance run. Scheduler's
optional Telegram peer accepts 1.0.0-2; Telegram's optional memory peer accepts
1.0.0-1. No peer overrides or legacy-peer-deps were used.

Publish memory and persona first (either order), scheduler next, installer last.
Use a prerelease dist-tag; do not move latest as part of this train without a
separate product decision. Verify each dependency is available before publishing
its consumer. Publish the verified archive bytes: scheduler's lockfile records
persona/memory archive integrity. Repacking after changing shipped files requires
refreshing those integrity entries and repeating package verification.

## Final verification

- Persona: 42 tests; memory: 70; scheduler: 54; installer: 158. All four builds pass.
- All four npm archives inspected. Persona contains dist/oneiros.js, policy/state,
  manifest/templates and the private oneiros/prompt.md; memory contains migration
  005 and delta.js; scheduler and installer contain their Oneiros runtime adapters.
- Real npm/npx installation from those archives, served through a temporary local
  registry overlay, with unchanged dependencies downloaded from the public npm
  registry. No sibling links or replacement runtime modules in this test.
- Fresh npx installer init: one pending persona.oneiros job, null payload,
  recurrence 17 3 * * * UTC, checkpoint position 0. Repeat update preserves job ID.
- Actual published installer 1.0.0-9 init established the upgrade fixture. After
  inserting historical memory and curating all 12 manifest outputs, npx installer
  1.0.0-10 update preserved those files plus identity byte-for-byte, initialized
  checkpoint at head position 1, and created exactly one persistent Oneiros job.
  Dry-run changed neither package files nor state. Repeated local update preserved
  checkpoint, job ID and curated bytes. The existing launcher reports 1.0.0-10.
- npm ls --all succeeds in both projects. A separate clean scheduler copy passes
  npm ci, build and all 54 tests using packed dependencies and its checked lockfile.
- Persona templates and manifest unchanged from the previous commit. Runner clean.
  No Oneiros MCP, global skill or main-session agent registration added. Update
  invokes reconciliation, never init or blanket persona rendering.

The bootstrap regression test compiles the production installer entry into a
separate external tree and uses real npm --save-exact; it has no installer-spec
override. The complete archive acceptance run additionally exercises the actual
npx entry, all engine upgrades, required doctor checks and Oneiros reconciliation.
No live model inference was performed. Semantic fit remains prompt policy;
structural mutation restrictions are enforced in code.

## Post-publication acceptance

Use disposable projects and Node 22. The following upgrade check starts in the
root of a stopped, supported installation pinned to installer 1.0.0-9, with its
existing database and curated context. Keep services stopped until verification
finishes so the memory head cannot move during the assertions.

```sh
fortytwo stop
export ONEIROS_VERIFY_DIR="$(mktemp -d)"
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as memory from '@justfortytwo/memory';
import { readProjectSetting, DEFAULT_DB_PATH } from './node_modules/@justfortytwo/installer/dist/commands/init.js';
const manifest = JSON.parse(readFileSync('node_modules/@justfortytwo/persona/manifest.json'));
const files = [...manifest.files.map(f => f.output), '.fortytwo/identity.json', '.mcp.json'];
const hashes = Object.fromEntries(files.map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const h = memory.openDb(resolve(readProjectSetting('DB_PATH') ?? DEFAULT_DB_PATH));
try {
  const head = h.raw.prepare("SELECT seq FROM sqlite_sequence WHERE name='memories'").get()?.seq ?? 0;
  writeFileSync(`${process.env.ONEIROS_VERIFY_DIR}/before.json`, JSON.stringify({ hashes, head }));
} finally { await h.k.destroy(); h.raw.close(); }
JS
npx @justfortytwo/installer@1.0.0-10 update
fortytwo --version
fortytwo doctor
npm ls --all
```

No re-exec, manual npm install or init is needed after the npx update.
The version must be 1.0.0-10 and required doctor checks must pass.
Run this assertion block, run `fortytwo update` again, and run the block again:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as memory from '@justfortytwo/memory';
import { readProjectSetting, DEFAULT_DB_PATH } from './node_modules/@justfortytwo/installer/dist/commands/init.js';
const before = JSON.parse(readFileSync(`${process.env.ONEIROS_VERIFY_DIR}/before.json`));
for (const [f, digest] of Object.entries(before.hashes)) {
  assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'), digest, f);
}
const pkg = JSON.parse(readFileSync('package.json'));
assert.equal(pkg.dependencies['@justfortytwo/installer'], '1.0.0-10');
const lock = JSON.parse(readFileSync('package-lock.json'));
assert.equal(lock.packages['node_modules/@justfortytwo/installer'].version, '1.0.0-10');
const checkpoint = JSON.parse(readFileSync('.fortytwo/oneiros/checkpoint.json'));
const h = memory.openDb(resolve(readProjectSetting('DB_PATH') ?? DEFAULT_DB_PATH));
try {
  assert.deepEqual(checkpoint, memory.memoryHead(h));
  assert.equal(checkpoint.position, before.head);
  const jobs = memory.listActive(h).filter(j => j.kind === 'persona.oneiros');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].recurrence, '17 3 * * *');
  assert.equal(jobs[0].payload, null);
  const result = { checkpoint, jobId: jobs[0].id };
  const saved = `${process.env.ONEIROS_VERIFY_DIR}/after.json`;
  if (existsSync(saved)) assert.deepEqual(result, JSON.parse(readFileSync(saved)));
  else writeFileSync(saved, JSON.stringify(result));
  console.log('PASS: exact installer pin, curated bytes, historical baseline, one persistent job');
} finally { await h.k.destroy(); h.raw.close(); }
JS
```

After both assertion runs pass, `fortytwo start` resumes the upgraded runtime.
No additional init is part of this upgrade.

For fresh-install acceptance, enter a separate empty directory and run the normal
onboarding. This exact check verifies init before the repeated update:

```sh
npx @justfortytwo/installer@1.0.0-10 init
fortytwo --version
fortytwo doctor
npm ls --all
export ONEIROS_VERIFY_DIR="$(mktemp -d)"
for attempt in 1 2; do
  node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as memory from '@justfortytwo/memory';
import { readProjectSetting, DEFAULT_DB_PATH } from './node_modules/@justfortytwo/installer/dist/commands/init.js';
const h = memory.openDb(resolve(readProjectSetting('DB_PATH') ?? DEFAULT_DB_PATH));
try {
  const checkpoint = JSON.parse(readFileSync('.fortytwo/oneiros/checkpoint.json'));
  assert.deepEqual(checkpoint, memory.memoryHead(h));
  assert.equal(checkpoint.position, 0);
  const jobs = memory.listActive(h).filter(j => j.kind === 'persona.oneiros');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].recurrence, '17 3 * * *');
  assert.equal(jobs[0].payload, null);
  const result = { checkpoint, jobId: jobs[0].id };
  const saved = `${process.env.ONEIROS_VERIFY_DIR}/fresh.json`;
  if (existsSync(saved)) assert.deepEqual(result, JSON.parse(readFileSync(saved)));
  else writeFileSync(saved, JSON.stringify(result));
  const mcp = JSON.parse(readFileSync('.mcp.json'));
  assert.deepEqual(Object.keys(mcp.mcpServers), ['fortytwo-memory']);
  console.log('PASS: fresh checkpoint, one persistent job, no Oneiros MCP');
} finally { await h.k.destroy(); h.raw.close(); }
JS
  if [ "$attempt" = 1 ]; then fortytwo update; fi
done
fortytwo start
```
