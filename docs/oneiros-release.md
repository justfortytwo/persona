# Oneiros coordinated prerelease

Proposed train, verified on Node 22.22.1:

| Package | Previous | Proposed | Runtime dependency / installer compatibility |
| --- | --- | --- | --- |
| persona | 1.0.0-0 | 1.0.0-2 | No runtime dependencies |
| memory | 1.0.0-0 | 1.0.0-2 | Existing optional gate/salience peers unchanged |
| scheduler | 1.0.0-2 | 1.0.0-3 | memory 1.0.0-2, persona 1.0.0-2, runner 1.0.0-0 |
| installer | 1.0.0-9 | 1.0.0-10 | memory 1.0.0-2, persona 1.0.0-2, scheduler 1.0.0-3, telegram 1.0.0-2, gate ^0.1.0 |

Runner 1.0.0-0 and Telegram 1.0.0-2 are already published and unchanged. Gate
^0.1.0 resolved to published 0.1.1 in the archive acceptance run. Scheduler's
optional Telegram peer accepts 1.0.0-2; Telegram's optional memory peer accepts
1.0.0-2. No peer overrides or legacy-peer-deps were used.

Memory 1.0.0-2 is already published (npm tag `next`; `latest` unchanged).
Persona 1.0.0-2 is also published; its registry integrity matches the tested
archive exactly. Publish scheduler next and installer last.
Use the `prerelease` dist-tag for the remaining packages; do not move latest as part of this train without a
separate product decision. Verify each dependency is available before publishing
its consumer. Publish the verified archive bytes: scheduler's lockfile records
persona/memory archive integrity. Repacking after changing shipped files requires
refreshing those integrity entries and repeating package verification.

Versions are already committed. When using release-it, pass `--no-increment`
and `--npm.tag=prerelease`; use `--npm.publishPath` with the verified archive
to preserve its bytes. Preview with `--dry-run` before releasing. Do not use
the superseded scheduler/installer archives built against memory or persona 1.0.0-1.

## Final verification

After persona was published as 1.0.0-2, the remaining pins, scheduler lockfile,
bootstrap fixture and live acceptance were aligned again. Persona (42), scheduler
(54) and installer (158) tests and all three builds passed. Clean scheduler npm
ci/build/test and both archive installation flows passed. The local persona
archive used in verification matches npm
`sha512-0mXG/Gf8oIDlAm34PE03/GDP3gYh3w73333OWlX4jIPs745trcoZ5TqCno2N5kOZFhlgp+8WnyUBFX67sjXz1A==`.
The current verified archive directory is `/tmp/oneiros-release-both-2/`.

After memory was published as 1.0.0-2, scheduler and installer were repacked
against that exact version. Their builds and 54/158 tests passed again. Fresh
init and the curated 1.0.0-9 upgrade were repeated with the actual published
memory package and the remaining verified archives; both passed. A clean
scheduler npm ci/build/test also passed with the published memory integrity.
The live harness now expects memory 1.0.0-2; pin its new docs commit from the
release report before running it. No runtime source or persona templates changed.

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
existing database and curated context. This fixture must have historical memory
(head > 0 and at least one retained memory row) and at least one **genuinely
hand-curated** output under context/: meaningful owner wording that differs from
rendering the installed template with identity.json. Edit the disposable owner's
OWNER or PROFILE text before this check; preserve PROFILE's section headings.
A pristine/default render or a whitespace-only edit is insufficient. The check
below compares against the pure template renderer; it never renders to disk.
Keep services stopped until verification finishes so the head cannot move.

Run shell blocks in Bash or zsh. `fortytwo stop` returns 0 when already stopped;
keep that command unmasked (no `|| true`), so actual stop failures still abort.
Stop externally managed services through their service manager too.

```sh
set -euo pipefail
fortytwo stop
ONEIROS_VERIFY_DIR="$(mktemp -d)"
export ONEIROS_VERIFY_DIR
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as memory from '@justfortytwo/memory';
import { readProjectSetting, DEFAULT_DB_PATH } from './node_modules/@justfortytwo/installer/dist/commands/init.js';
import { renderTemplate } from './node_modules/@justfortytwo/installer/dist/render.js';
const manifest = JSON.parse(readFileSync('node_modules/@justfortytwo/persona/manifest.json'));
const identity = JSON.parse(readFileSync('.fortytwo/identity.json'));
const normalize = text => text.replace(/\s+/g, ' ').trim();
const curated = manifest.files.filter(f => f.output.startsWith('context/')).filter(f => {
  const actual = readFileSync(f.output, 'utf8');
  const template = readFileSync(`node_modules/@justfortytwo/persona/templates/${f.template}`, 'utf8');
  return normalize(actual).length > 0 && normalize(actual) !== normalize(renderTemplate(template, identity.answers));
}).map(f => f.output);
assert(curated.length > 0, 'Fixture needs meaningful hand-curated context, not a default render');
console.log('Review these genuinely curated outputs before proceeding:', curated);
const files = [...manifest.files.map(f => f.output), '.fortytwo/identity.json', '.mcp.json'];
const hashes = Object.fromEntries(files.map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const h = memory.openDb(resolve(readProjectSetting('DB_PATH') ?? DEFAULT_DB_PATH));
try {
  const head = h.raw.prepare("SELECT seq FROM sqlite_sequence WHERE name='memories'").get()?.seq ?? 0;
  assert(head > 0, 'Historical-memory coverage requires head > 0 before upgrade');
  assert(h.raw.prepare('SELECT count(*) AS n FROM memories').get().n > 0, 'Retain historical evidence in the fixture');
  writeFileSync(`${process.env.ONEIROS_VERIFY_DIR}/before.json`, JSON.stringify({ hashes, head, curated }));
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
set -euo pipefail
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as memory from '@justfortytwo/memory';
import { readProjectSetting, DEFAULT_DB_PATH } from './node_modules/@justfortytwo/installer/dist/commands/init.js';
const before = JSON.parse(readFileSync(`${process.env.ONEIROS_VERIFY_DIR}/before.json`));
assert(before.head > 0, 'Missing nonempty historical baseline');
assert(before.curated?.length > 0, 'Missing curated fixture baseline');
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

After both assertion runs pass, keep this disposable project stopped for the
separate LIVE ONEIROS dogfood below. `fortytwo start` may resume it after dogfood;
no additional init is part of this upgrade. Packaging acceptance alone does not
claim that a model ran.

For fresh-install acceptance, enter a separate empty directory and run the normal
onboarding. This exact check verifies init before the repeated update:

```sh
set -euo pipefail
npx @justfortytwo/installer@1.0.0-10 init
fortytwo --version
fortytwo doctor
npm ls --all
ONEIROS_VERIFY_DIR="$(mktemp -d)"
export ONEIROS_VERIFY_DIR
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

## Post-publication LIVE ONEIROS dogfood (separate acceptance)

This is a paid/live model run, **not** the packaging test above. Execute only
after the train is published, from the successfully upgraded disposable project.
Keep its `ONEIROS_VERIFY_DIR` (before.json and after.json) from upgrade acceptance.
Use the actual authenticated Claude CLI and the same configured provider/model
selection as normal Rita. Export provider settings into this shell as in normal
operation; the harness neither replaces credentials nor selects a test model.
The configured memory embedder must also be available. No mocked model callback,
fake CLI, FakeEmbedder, local registry overlay or linked packages are accepted.

Set `ONEIROS_DOCS_ROOT` to the exact **clean docs-only commit** recorded in the
release report, and export that report's full hash as `ONEIROS_DOCS_COMMIT`.
Do not derive the expected hash from the checkout's current HEAD. The separate
persona package release commit is
`77fa620a95801794cf141a50c96a2f329bdb6587`; its runtime source matches the reviewed Oneiros implementation. The
preflight requires the pinned docs commit to descend from that runtime commit
with no changes outside docs/. A commit cannot embed its own hash, so the final
release report is the authoritative external docs pin. The harness is read from
that immutable Git object, not an unchecked working-tree file.

Set `ONEIROS_RITA_ROOT` to the separate normal Rita project. Stop/quiesce normal Rita through its normal service
manager and close its interactive Claude sessions **before** taking snapshots;
leave all other Claude clients idle during the run. This test never starts or
resumes Rita. If session state lives outside the standard Claude configuration
and Rita state directories, set `ONEIROS_EXTRA_SESSION_PATHS` to a JSON array of
those absolute paths. Missing custom paths invalidate the session-preservation
claim. Normal Rita must already have persisted session state; include its actual
transcript/bridge-state path if customized. Standalone auth-refresh and telemetry
files are not compared. Shared configuration files (including .claude.json) are
compared conservatively: any change fails the automatic check and needs inspection;
do not dismiss a session/configuration change as harmless telemetry.

The docs-only [oneiros-live.mjs](oneiros-live.mjs) harness resolves packages from
the disposable project's node_modules and checks their versions and lockfile
integrities against public npm. It is excluded from package archives and is not
a new public CLI. Its exact existing seams are:

1. `memory.store` adds one new owner/stated observation: “My enduring interests
   include observational astronomy, especially stellar evolution.” This is an
   Interests fact about the disposable fixture owner. PROFILE must retain its
   real `## Interests` heading. Do not inject synthetic evidence into real Rita.
2. `memory.setRecurrence` makes the **existing** persona.oneiros job due.
   `scheduler.tick` uses its existing injectable clock to select only this job,
   before other pending jobs (including store's reembed job). Other jobs are not
   modified; the recurring job is rescheduled against current wall time.
3. The real `makeOneirosHandler → isolatedWorker → createRunner → native spawn`
   path calls the configured Claude provider. The callback observes and forwards
   the real result; it never manufactures a proposal. The sole extra CLI argument
   is `--debug-file` for diagnostics. Production isolation arguments are asserted
   exactly, including empty tools/MCP, safe mode, disabled skills, empty setting
   sources, no resume and no session persistence.

Run this block in the **upgraded disposable project**, not the persona checkout:

```sh
set -euo pipefail
umask 077
: "${ONEIROS_DOCS_ROOT:?Set this to the clean pinned persona docs checkout}"
: "${ONEIROS_DOCS_COMMIT:?Set the full docs-only commit hash from the release report}"
export ONEIROS_DOCS_ROOT ONEIROS_DOCS_COMMIT
test "$(git -C "$ONEIROS_DOCS_ROOT" rev-parse HEAD)" = "$ONEIROS_DOCS_COMMIT"
test -z "$(git -C "$ONEIROS_DOCS_ROOT" status --porcelain --untracked-files=all)"
git -C "$ONEIROS_DOCS_ROOT" merge-base --is-ancestor 77fa620a95801794cf141a50c96a2f329bdb6587 "$ONEIROS_DOCS_COMMIT"
git -C "$ONEIROS_DOCS_ROOT" diff --exit-code 77fa620a95801794cf141a50c96a2f329bdb6587 "$ONEIROS_DOCS_COMMIT" -- . ':(exclude)docs/**'
git -C "$ONEIROS_DOCS_ROOT" cat-file -e "$ONEIROS_DOCS_COMMIT:docs/oneiros-live.mjs"
: "${ONEIROS_RITA_ROOT:?Set this to the separate, stopped normal Rita project}"
: "${ONEIROS_VERIFY_DIR:?Keep this from the successful upgrade acceptance}"
fortytwo stop
"${CLAUDE_BIN:-claude}" --version
npm ls --all
git -C "$ONEIROS_DOCS_ROOT" show "$ONEIROS_DOCS_COMMIT:docs/oneiros-live.mjs" | node --input-type=module
```

The harness fails if the worker is skipped, authentication/provider execution
fails, the subprocess does not exit successfully, a proposal is invalid, or the
checkpoint does not advance beyond the prior value to the newly stored evidence.
It also asserts the original recurring job remains pending with the same ID,
protected context and normal session/configuration snapshots are unchanged, the
temporary worker cwd is removed, and the scheduler notification callback was
never called. No Telegram sender is constructed, and no journal notification may
advance memory's head. This proves silence of the maintenance path, not Telegram
delivery. Only the test observation, its normal reembed job, Oneiros state/job,
and an allowed additive PROFILE patch may change in the disposable project.

**Automatic success is `LIVE_EXECUTED_REVIEW_REQUIRED`, not a final dogfood pass.**
Complete the following evidence review; keep these files private because the
request, provider result and debug trace can contain context or provider details:

| Evidence in `$ONEIROS_VERIFY_DIR/live/` | Required review |
| --- | --- |
| `launch.json`, `claude-debug.log` | Confirm the real executable/process and effective safe mode. No user/project MCP connections, skill/agent/plugin loading, CLAUDE.md discovery, session resume, or tool execution may occur. Disabled/skipped discovery log lines are expected. Provider auth/model settings are allowed. Admin policy still applies; if the trace shows unexpected customization/tool exposure, fail isolation. Flags alone are launch-contract evidence, not proof of the CLI honoring them. If this CLI's diagnostics do not establish effective isolation, leave the test inconclusive. |
| `provider-result.json`, `report.json` | Confirm a real successful provider response, exactly one spawned worker, advancing checkpoint, same job ID, zero notifications, and unchanged protected/session snapshots. Timeout/error/absent response is a wiring/provider failure, never a no-op. |
| `worker-input.json`, `proposal.json`, `profile-comparison.json` | Review semantic fit and evidence. Applied text must be a minimal additive Interests refinement supported by the new memory ID. The exact saved proposal is also replayed through the shipped deterministic validator and compared with PROFILE. |
| `protected-before.json`, `protected-after.json` | Must match, including protected persona files, project configuration, normal Rita context/bridge state and Claude session stores. The test does not inspect an actively running session's in-memory state; quiescence is a required precondition. |

For `ADDITIVE_PATCH_REVIEW_REQUIRED`, approve only a supported semantic refinement.
For `MODEL_NO_OP_REVIEW_REQUIRED`, inspect the actual proposal and baseline:
`{"additions":[]}` can be a legitimate conservative decision, or the validated
proposal can already exist in the baseline. Record why keeping context unchanged
is reasonable. If the model unexpectedly declines this suitable new evidence
without a defensible reason, record a model-quality concern rather than calling
it an installation failure or silently marking dogfood passed. Do not demand a
mutation merely to make the test green.

Record the human outcome as **PASS—additive patch**, **PASS—legitimate no-op**,
**FAIL**, or **INCONCLUSIVE**, with the reviewed evidence. A packaging pass never
substitutes for this live result. On failure, keep the disposable project stopped
and retain artifacts/checkpoint for diagnosis; do not reset checkpoints or rerun
init to hide a failed attempt. No live-provider pass is claimed by this document.
