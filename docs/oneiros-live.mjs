// Documentation-only post-publication acceptance harness. Run via stdin from
// the disposable project so imports resolve its published packages, not this repo.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as memory from '@justfortytwo/memory';
import { tick, makeOneirosHandler, recurrenceNext } from '@justfortytwo/scheduler';
import { createRunner } from '@justfortytwo/runner';
import { workerPrompt } from '@justfortytwo/persona';
// Existing shipped internal seams; no new public CLI or package export.
import { isolatedWorker } from './node_modules/@justfortytwo/scheduler/dist/oneiros.js';
import { applyProposal } from './node_modules/@justfortytwo/persona/dist/policy.js';
import { readProjectSetting, DEFAULT_DB_PATH } from './node_modules/@justfortytwo/installer/dist/commands/init.js';
import { liveRuntime, isPidAlive } from './node_modules/@justfortytwo/installer/dist/runtime.js';

// The release report supplies this external immutable docs pin. Check it before
// inspecting project state or contacting the package registry/provider.
const runtimeCommit = '59fdb0f9a5552075540d80a2325cbcca8cc3d94d';
const docsRoot = process.env.ONEIROS_DOCS_ROOT;
const docsCommit = process.env.ONEIROS_DOCS_COMMIT;
assert(docsRoot && /^[0-9a-f]{40}$/.test(docsCommit ?? ''), 'Set the clean docs root and full release-report docs hash');
const git = (...args) => execFileSync('git', ['-C', docsRoot, ...args], { encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), docsCommit, 'Docs HEAD differs from the release pin');
assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Docs checkout must be clean');
git('merge-base', '--is-ancestor', runtimeCommit, docsCommit);
git('diff', '--exit-code', runtimeCommit, docsCommit, '--', '.', ':(exclude)docs/**');
git('cat-file', '-e', `${docsCommit}:docs/oneiros-live.mjs`);

const root = realpathSync(process.cwd());
assert(process.env.ONEIROS_RITA_ROOT, 'Set ONEIROS_RITA_ROOT to the normal, idle Rita project');
assert(process.env.ONEIROS_VERIFY_DIR, 'Keep ONEIROS_VERIFY_DIR from upgrade acceptance');
const rita = realpathSync(process.env.ONEIROS_RITA_ROOT);
assert(existsSync(join(rita, '.fortytwo/identity.json')), 'Normal Rita must be an existing installation');
assert(root !== rita && !root.startsWith(rita + '/') && !rita.startsWith(root + '/'), 'Use separate, non-nested projects');
const audit = join(process.env.ONEIROS_VERIFY_DIR, 'live');
assert(!existsSync(audit), 'Use one live attempt per acceptance baseline; inspect failures before retrying');
assert(!liveRuntime(root) && !liveRuntime(rita), 'Both runtimes must be stopped; close interactive Rita sessions too');
const dbPath = resolve(readProjectSetting('DB_PATH') ?? DEFAULT_DB_PATH);
const heartbeat = join(resolve(dbPath, '..'), 'scheduler.heartbeat');
if (existsSync(heartbeat)) {
  const beat = JSON.parse(readFileSync(heartbeat));
  assert(!(Date.now() - Date.parse(beat.ts) <= 90_000 && isPidAlive(beat.pid)), 'Stop the external scheduler');
}
assert(!existsSync('.fortytwo/oneiros/pending.json'), 'Resolve pending recovery before dogfood');
const baseline = JSON.parse(readFileSync(join(process.env.ONEIROS_VERIFY_DIR, 'before.json')));
const accepted = JSON.parse(readFileSync(join(process.env.ONEIROS_VERIFY_DIR, 'after.json')));
assert(baseline.head > 0 && baseline.curated?.length > 0, 'Complete strengthened upgrade acceptance first');

// Require actual published versions/integrities, not links, local tarballs or a
// local registry overlay. Network errors fail before adding evidence.
const versions = { persona: '1.0.0-1', memory: '1.0.0-2', scheduler: '1.0.0-3', installer: '1.0.0-10', runner: '1.0.0-0' };
const lock = JSON.parse(readFileSync('package-lock.json'));
for (const [name, version] of Object.entries(versions)) {
  const path = `node_modules/@justfortytwo/${name}`;
  assert.equal(realpathSync(path), join(root, path), `${name}: linked package tree refused`);
  assert.equal(JSON.parse(readFileSync(`${path}/package.json`)).version, version);
  const response = await fetch(`https://registry.npmjs.org/@justfortytwo%2f${name}/${version}`);
  assert(response.ok, `${name}@${version} must already be published`);
  const published = await response.json();
  assert.equal(lock.packages[path].integrity, published.dist.integrity, `${name}: published integrity mismatch`);
  assert.equal(lock.packages[path].resolved, published.dist.tarball, `${name}: use the public npm release`);
}
const bin = process.env.CLAUDE_BIN ?? 'claude';
const help = execFileSync(bin, ['--help'], { encoding: 'utf8' });
assert(help.includes('--safe-mode') && help.includes('--debug-file'), 'Configured Claude CLI must support isolation and diagnostics');
mkdirSync(audit, { mode: 0o700 });
const save = (file, data) => writeFileSync(join(audit, file), JSON.stringify(data, null, 2), { mode: 0o600 });
const hash = data => createHash('sha256').update(data).digest('hex');
const checkpoint = () => JSON.parse(readFileSync('.fortytwo/oneiros/checkpoint.json'));
const manifest = JSON.parse(readFileSync('node_modules/@justfortytwo/persona/manifest.json'));
const profilePath = 'context/PROFILE.md';
const profileBefore = readFileSync(profilePath, 'utf8');
assert(/^## Interests\r?$/m.test(profileBefore), 'Preserve real PROFILE section headings in the curated fixture');
for (const [file, digest] of Object.entries(baseline.hashes)) assert.equal(hash(readFileSync(file)), digest, file);

// Hash supported session/configuration surfaces, including normal Rita's context
// and Telegram bridge state, without writing to them. Keep every client idle.
const claudeConfig = resolve(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'));
const sessionPaths = [
  claudeConfig + '.json',
  ...['projects', 'sessions', 'session-env', 'history.jsonl', 'todos', 'tasks', 'settings.json', 'settings.local.json', 'agents', 'skills', 'plugins/installed_plugins.json'].map(p => join(claudeConfig, p)),
  ...['context', 'CLAUDE.md', '.claude', '.mcp.json', 'state', '.fortytwo'].map(p => join(rita, p)),
  ...['.claude', '.mcp.json', 'state', '.fortytwo/identity.json', 'package.json', 'package-lock.json'].map(p => join(root, p)),
  resolve(rita, readProjectSetting('TELEGRAM_BINDINGS_DB', rita) ?? 'state/telegram-bindings.db'),
  ...JSON.parse(process.env.ONEIROS_EXTRA_SESSION_PATHS ?? '[]').map(p => resolve(p)),
  ...manifest.files.filter(f => f.output !== profilePath).map(f => resolve(f.output)),
];
function snapshot() {
  const out = {};
  function visit(path, ancestors = []) {
    if (!existsSync(path)) { out[path] = 'absent'; return; }
    const real = realpathSync(path);
    assert(!ancestors.includes(real), `Session snapshot symlink cycle: ${path}`);
    const stat = lstatSync(real);
    if (stat.isDirectory()) {
      out[path] = `directory:${real}`;
      for (const name of readdirSync(real).sort()) visit(join(path, name), [...ancestors, real]);
    } else if (stat.isFile()) out[path] = hash(readFileSync(real));
    else throw new Error(`Unsupported session-state file: ${path}`);
  }
  for (const path of sessionPaths) visit(path);
  return out;
}
const untouched = snapshot();
save('protected-before.json', untouched);
const h = memory.openDb(dbPath);
const report = { provenance: { runtimeCommit, docsCommit }, status: 'NOT_COMPLETED', spawns: [], notifications: 0, failures: [] };
let input, proposal, providerResult;
try {
  const previous = checkpoint();
  assert.deepEqual(previous, accepted.checkpoint);
  assert.deepEqual(previous, memory.memoryHead(h), 'Begin with no unreviewed delta');
  const active = memory.listActive(h);
  assert(active.every(j => j.status === 'pending'), 'No jobs may be running');
  const jobs = active.filter(j => j.kind === 'persona.oneiros');
  assert.equal(jobs.length, 1); assert.equal(jobs[0].id, accepted.jobId);
  const job = jobs[0];
  const embedEnv = { ...process.env };
  for (const key of ['EMBED_PROVIDER', 'EMBED_MODEL', 'EMBED_BASE_URL', 'EMBED_API_KEY', 'OLLAMA_BASE_URL']) embedEnv[key] ??= readProjectSetting(key);
  assert(embedEnv.EMBED_MODEL, 'Use the configured real embedder, not FakeEmbedder');
  const evidence = 'My enduring interests include observational astronomy, especially stellar evolution.';
  const id = await memory.store(h, memory.embedderFromEnv(embedEnv), { content: evidence, source: 'owner', observed: 'stated', tags: ['oneiros-dogfood'] });
  assert(id > previous.position);
  const head = memory.memoryHead(h);
  const entries = memory.memoryDelta(h, previous).entries;
  assert.deepEqual(entries.map(e => e.id), [id]);
  report.evidenceId = id; report.previous = previous;

  // store also enqueues reembed_memory. Use tick's existing injectable clock to
  // claim only Oneiros, earlier than every other pending job, without editing
  // those jobs. Reschedule Oneiros relative to wall time after this test tick.
  const others = memory.listActive(h).filter(j => j.id !== job.id);
  const dispatchTime = new Date(Math.min(Date.now(), ...others.map(j => Date.parse(j.run_at))) - 1000).toISOString();
  memory.setRecurrence(h, job.id, job.recurrence, dispatchTime);
  const trace = join(audit, 'claude-debug.log');
  const runner = createRunner({ spawn: (command, args, options) => {
    const expected = ['-p', '--output-format', 'json', '--safe-mode', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-session-persistence', '--setting-sources', '', '--system-prompt', workerPrompt, '--debug-file', trace, JSON.stringify(input)];
    assert.equal(command, bin); assert.deepEqual(args, expected);
    save('launch.json', { command, args, cwd: options.cwd, shell: options.shell });
    assert.equal(options.shell, false);
    const cwd = realpathSync(options.cwd);
    assert(cwd !== root && cwd !== rita && !cwd.startsWith(root + '/') && !cwd.startsWith(rita + '/'));
    assert.deepEqual(readdirSync(cwd), []);
    assert.equal(options.env.CLAUDE_CODE_SESSION_ID, undefined);
    assert.equal(options.env.CLAUDECODE, undefined);
    // Observe and forward to the real OS spawn. No mocked process/model result.
    const child = spawn(command, args, options);
    const record = { cwd, pid: null, exit: null, spawned: false };
    report.spawns.push(record);
    child.once('spawn', () => { record.spawned = true; record.pid = child.pid; });
    child.once('close', code => { record.exit = code; });
    return child;
  } });
  const handler = makeOneirosHandler(root, h, async value => {
    input = value; save('worker-input.json', input);
    proposal = await isolatedWorker(input, async options => {
      // Only added option is diagnostic logging; provider/auth/model selection
      // and the production isolation flags remain unchanged.
      providerResult = await runner.run({ ...options, args: [...options.args, '--debug-file', trace] });
      save('provider-result.json', providerResult);
      return providerResult;
    });
    save('proposal.json', proposal);
    return proposal;
  });
  await tick({
    claimDue: now => h.raw.transaction(() => {
      const claimed = memory.claimDue(h, now);
      assert.deepEqual(claimed.map(j => j.id), [job.id]);
      return claimed;
    })(),
    complete: (id, opts) => memory.complete(h, id, opts),
    fail: (id, error, opts) => { report.failures.push(error); memory.fail(h, id, error, opts); },
    registry: { get: kind => kind === 'persona.oneiros' ? handler : undefined },
    recurrenceNext: cron => recurrenceNext(cron, new Date().toISOString()),
    enqueueRun: fn => fn(),
    notify: async () => { report.notifications++; throw new Error('Maintenance attempted a notification'); },
  }, dispatchTime);
  assert.deepEqual(report.failures, []);
  assert.equal(report.spawns.length, 1); assert(report.spawns[0].spawned);
  assert.equal(report.spawns[0].exit, 0); assert(!existsSync(report.spawns[0].cwd));
  assert.equal(providerResult.ok, true); assert(providerResult.raw, 'Keep actual provider response evidence');
  assert.deepEqual(providerResult.raw.permission_denials ?? [], [], 'Unexpected tool permission request');
  assert(existsSync(trace), 'Keep CLI diagnostics for isolation review');
  assert.equal(report.notifications, 0);
  assert.deepEqual(checkpoint(), head); assert(checkpoint().position > previous.position);
  assert.deepEqual(memory.memoryHead(h), head, 'No maintenance notification was journaled');
  const remaining = memory.listActive(h).filter(j => j.kind === 'persona.oneiros');
  assert.equal(remaining.length, 1); assert.equal(remaining[0].id, job.id);
  assert.equal(remaining[0].recurrence, job.recurrence); assert.equal(remaining[0].status, 'pending');
  assert.equal(remaining[0].last_error, null);
  assert.deepEqual(memory.listActive(h).filter(j => j.id !== job.id), others);
  const profileAfter = readFileSync(profilePath, 'utf8');
  assert.equal(profileAfter, applyProposal(profileBefore, proposal, entries, head));
  save('profile-comparison.json', { before: profileBefore, after: profileAfter });
  report.checkpoint = checkpoint(); report.jobId = job.id;
  report.outcome = profileBefore === profileAfter ? 'MODEL_NO_OP_REVIEW_REQUIRED' : 'ADDITIVE_PATCH_REVIEW_REQUIRED';
  report.status = 'LIVE_EXECUTED_REVIEW_REQUIRED';
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  try {
    const after = snapshot(); save('protected-after.json', after);
    assert.deepEqual(after, untouched, 'Protected context or normal session state changed');
    report.protectedAndSessionStateUnchanged = true;
  } finally {
    save('report.json', report);
    await h.k.destroy(); h.raw.close();
  }
}
console.log(`${report.status}: ${report.outcome}. Review private evidence in ${audit}`);
