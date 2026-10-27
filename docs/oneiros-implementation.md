# Oneiros implementation note

## Existing seams and ownership

Persona currently ships data only. Its manifest distinguishes managed templates
(re-rendered) from captured files (owner-owned). PROFILE.md already separates
Identity, Voice, Interests, Values, Expertise and Boundaries. There is no mutation
API. Oneiros will add a small internal library and bundled private prompt, not a
MCP, skill, agent registration or new main-session instructions.

Memory stores immutable additions under SQLite AUTOINCREMENT IDs; timestamps
are neither unique nor insertion ordered. Its query API is timestamp-based and
limited, so memory needs a library-only bounded delta API. Use the sequence high
watermark (including deleted IDs), plus a persistent database identity to detect
replacement. No new MCP tools or duplicate evidence storage.

Scheduler already owns cron definitions, idempotent seedRecurring, durable jobs,
cheap hasWork gates and retries. Add persona.oneiros there, daily at 03:17 UTC
(the existing maintenance model uses UTC cron with minute offsets). Its handler
returns no notification, preventing a maintenance-to-memory feedback loop.
Runner already accepts cwd, args, timeout and a separate one-shot run; no runner
change is needed. Scheduler supplies the isolated execution callback to persona.
Installer dynamically resolves engine packages from the target project. Init
provisions memory; before this implementation, update re-rendered managed context
after installing.
Replace update's render step with explicit runtime reconciliation, including on
an unchanged-version retry. Never call renderPersona during update.

## Worker and application

Bundle oneiros/prompt.md with persona. Run in a temporary directory outside the
installation, with an explicit system prompt, no tools, no MCP servers, no
skills, no session persistence and no project/user settings. Preserve provider
environment configuration. Pass a bounded JSON context/evidence envelope; return
JSON proposals only. The main session receives no machinery or extra files.

For v1, only additive bullets in PROFILE.md's existing Voice, Interests and
Expertise sections are allowed. All other sections/files are protected by code,
including OWNER, SOUL, rules, identity and values. No entire-file replacement,
removal, style rewrite or guessed section creation. Proposals cite delta IDs;
inferred/imported evidence and superseded rows cannot support automatic changes.
Memory text is always untrusted data. Semantic classification remains a model
judgment, not something a schema can prove; tests verify the deterministic
boundary and the prompt contract without claiming universal injection immunity.

Validate all proposals before writing. Preserve all existing bytes and append
only bounded plain-text bullets with evidence IDs. Recheck the baseline before
application. Serialize per-install runs. Persist a write-ahead receipt containing
before/after hashes, proposed result and next cursor before atomic context
replacement; recover it before any new work. Only checkpoint after the validated
context write succeeds. A reviewed no-op checkpoints too. Conflicts fail closed.

## Initialization and upgrade

Store private state under .fortytwo/oneiros, one cursor and receipt per evidence
stream: memory keeps checkpoint.json / pending.json; the transcript stream uses
transcript-checkpoint.json / transcript-pending.json. Both init and update initialize a
missing memory cursor at the current memory high watermark, never zero by assumption;
the transcript cursor is initialized at exactly the position given (the transcript
position already consumed by migration), not necessarily the transcript head.
A new empty DB naturally starts at zero. Existing state is preserved; mismatched
DB identity fails closed. No implicit historical backfill. Seed one persistent
job using scheduler's existing seeder, after state initialization. Daemon boot
also reconciles the job only when Oneiros state exists.

Upgrade changes installed packages, machine-owned state and the jobs table only.
It does not render any persona file or add a context import. The first run uses
curated context as baseline and sees only post-initialization memory. Repeated
updates do not reset the cursor or duplicate jobs. Running services must be
restarted through the existing lifecycle mechanism to load upgraded code.

## Scope and verification plan

1. Persona: private prompt, policy/validation/application/checkpoint library,
   package entry/build, temp-directory regression tests and documentation.
2. Memory: library delta/head API, database-identity migration, real SQLite tests.
3. Scheduler: internal handler/isolation adapter, existing cron seeder integration,
   dependency pins and tests.
4. Installer: init/update reconciliation, compatibility pins, curated-workspace
   and fresh-install tests using real memory/jobs and installed package resolution.
5. Run affected suites/builds and packaging checks. No publish, tag, commit or push.

Alternative considered: arbitrary file patches would need a much larger policy
and conflict surface; a separate generated profile would add main-session context
and loading wiring. Existing PROFILE sections provide the smallest useful seam.

## Review refinements and operating limits

The exact worker flags are `--safe-mode --tools "" --strict-mcp-config
--mcp-config '{"mcpServers":{}}' --disable-slash-commands
--no-session-persistence --setting-sources "" --system-prompt <private policy>`.
Local `claude --help` confirms this contract. Safe mode preserves auth/provider
selection while disabling customizations; environment cleanup is session-only.

Recovery decision: before hash → persist proposed result then checkpoint; after
hash → checkpoint only; neither → preserve files and stop for reconciliation.
Each stream has its own receipt; every leftover receipt (memory and transcript)
is recovered before any round reads PROFILE, then one round runs per initialised
stream, memory first, each building on the profile the previous round wrote.
An initialised transcript stream with no transcript source supplied fails closed
rather than being skipped.
The receipt is durable before replacement. Stale-lock takeover is serialized by
an exclusive reaper lock and rechecks inode ownership before removing anything.
Ordinary owner editors do not participate in this lock; a last-instant edit can
race rename. Stop the runtime when editing context to exclude that race.

Memory pages use a snapshot upper watermark and `limit + 1`: when another row
exists, return only the page's last ID as cursor, otherwise the snapshot head.
Do not discard oversized entries: fail closed at a 100 KB envelope budget.
Read the live page again before apply to detect deletion/supersession during
reasoning. A page with no eligible owner-stated rows checkpoints without a model.
Eligibility also recognizes the real Telegram inbound message envelope
(source=telegram:<actor>, meta.direction=inbound, meta.kind=message); free-form
provenance remains untrusted data, including quoted instructions. Transcript
pages follow the same cursor, re-read and budget rules per stream; only rows with
channel=telegram, direction=inbound, kind=message and actor exactly `owner` are
eligible, so Telegram's OWNER_ACTOR must stay `owner`.

Non-dry-run update refuses live services before any install/reconciliation,
including unchanged-version retries. Stop/update/start uses the existing lifecycle.
Dry-run never initializes state or seeds a job. The updated installer is required:
the old project-pinned installer cannot discover newer exact compatibility pins.
These coordinated versions remain unpublished until an explicit release request.

## Verification and changed files

All twelve requested behavioral cases have deterministic regression coverage.
The model callback is controlled in tests; no live model classification or
universal resistance to semantic prompt injection is claimed. Temporary real
workspaces exercise initial install, curated upgrade, repeat update, failed
application, interruption recovery and separate-process lock contention.

| Repository | Files changed or added |
| --- | --- |
| persona | `src/oneiros.ts`, `src/policy.ts`, `src/state.ts`, `oneiros/prompt.md`, `test/oneiros.test.ts`, `test/lock.test.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `.gitignore`, `AGENTS.md`, `README.md`, this note |
| memory | `src/delta.ts`, `src/migrations/005_memory_identity.ts`, `src/migrate.ts`, `src/index.ts`, `test/delta.test.ts`, `test/migrate-concurrency.test.ts`, `package.json`, `package-lock.json`, `README.md` |
| scheduler | `src/oneiros.ts`, `src/daemon.ts`, `src/handlers/index.ts`, `src/index.ts`, `test/oneiros.test.ts`, `package.json`, `package-lock.json`, `README.md` |
| installer | `src/oneiros.ts`, `src/commands/init.ts`, `src/commands/update.ts`, `test/oneiros.test.ts`, `test/e2e.test.ts`, `test/init.test.ts`, `test/update.test.ts`, `package.json`, `package-lock.json`, `README.md` |

Runner source is unchanged. Template and manifest content is unchanged. The
memory MCP contract and policy schema majors are unchanged (additive library API).

Verification: persona 35 tests, memory 70, scheduler 54, installer 152; all builds
pass. Native SQLite tests use the installed Node 22 runtime matching the module's
ABI. Local npm archives were produced without publication, and the persona
archive loads its API/private prompt in a separate directory without source files.
Scheduler tests use locally packed persona/memory/runner dependencies. Dependency
lockfile inspection resolves the coordinated versions; registry-based installation
cannot be verified until those versions are published. The runtime's isolation
flags were checked against local `claude --help` and asserted in adapter tests.

The upgrade proof snapshots every manifest output and identity as bytes, runs
update, compares them byte-for-byte, verifies the initialized cursor equals the
historical head, appends new memory, repeats update, and confirms an unchanged
checkpoint plus exactly one active `persona.oneiros` row. Fresh `runInit` checks
a zero cursor and the persistent job. No model is spawned by init or update.

The job has kind `persona.oneiros`, payload `null`, recurrence `17 3 * * *`, status
`pending`, and run_at computed by the existing UTC recurrence function. Existing
scheduler retry limits still apply; repeated failures remain visible in the jobs
table and an update/daemon restart can re-seed a terminal recurring job.

Recovery receipts also record the other context files' hashes. An unapplied
proposal is not replayed after protected context changes. The before/after hash
rule handles the permitted profile mutation independently.

V1 throughput is deliberately bounded to one 50-entry page per scheduled run.
High-volume installations may accumulate a backlog; a later product decision can
adjust cadence or add bounded multi-page draining without changing cursor safety.
Historical backfill has no automatic path. Manual filesystem edits should be made
with the runtime stopped, and model-level semantic quality still needs evaluation
with the installation's chosen provider before enabling broader editable surfaces.

## Pre-release review: upgrade entry, migration seam, semantic fit

### 1. Installer bootstrap — accepted revision implemented

The shipped 1.0.0-9 launcher runs the project-local installer and that installer's
old exact compatibility matrix. It cannot retroactively discover this release.
The supported one-time path, from the project root after publication, is:

```sh
fortytwo stop
npx @justfortytwo/installer@1.0.0-10 update
fortytwo start
```

Update checks installation state and refuses live services before mutation. It
reads the executing installer version, compares the project-installed version,
and persists a newer executing version with the existing npm install primitive
and `--save-exact`. Equal versions skip persistence; older executing versions
fail rather than downgrade the project. Dry-run only reports the planned pin.
The exact pin, lockfile and node_modules are npm-owned. The existing launcher
therefore uses the newer CLI permanently. No re-exec, manual npm install or init is needed.

No re-exec is necessary: the external process already runs the newer modules and
compatibility matrix. Engine resolution/installation and reconciliation continue
in that process. A failure after persistence leaves the new installer available
for retry while services remain stopped. Engine rollback does not roll back the
installer. Future installer channel discovery remains a separate product decision.

Regression coverage includes orchestration ordering and a separate external CLI
tree, real npm against a local fixture registry, exact package/lock persistence,
launcher --version before/after, live-runtime refusal, dry-run, repeat update,
and byte-for-byte curated context preservation. The external CLI fixture starts
with current engine packages to isolate CLI bootstrap; the existing real-DB
upgrade test and orchestration tests cover engine advancement and reconciliation.

### 2. Persona update semantics — PASS (extensible seam, not a migration framework)

`UpdateDeps.reconcile` is already a dedicated asynchronous seam. It runs after
successful package installation/doctor checks and on unchanged-version retries;
dry-run skips it. `runUpdate` currently binds it to `reconcileOneiros`.
That function loads the newly installed persona package and calls initialize;
state creation is idempotent. The worker prompt/policy are package assets, so npm
updates them without rendering any installation context.

Future explicit machine-owned migrations belong in persona and can be invoked
from this same installer reconciliation seam. When a real migration first exists,
it should check a machine-state schema/version marker, transform only explicitly
machine-owned paths/state, write atomically, mark success last, and tolerate
repetition. General persona migrations must be independent of Oneiros's optional
memory/scheduler prerequisites. The callback can compose these separate steps.
No registry/framework is needed now. The intended rule is "no blanket template
render on update", not "persona assets/state can never migrate". Existing curated
CLAUDE/context files remain protected, even where the old render manifest calls
them managed; that label alone is not permission to overwrite them.

### 3. PROFILE semantic fit — prompt policy clarified

The actual template defines Voice as tone/formality/verbosity/language and how the
owner sounds; Interests as topics; Expertise as domains of depth. The four
review examples concern working style and decision principles, so none belongs
in those editable sections. Values explicitly covers operating principles and
is a broad semantic home, but it is protected. The captured owner-beliefs corpus
also holds operating principles and anti-patterns, outside the allowed surface.

There is no correct automatic destination for these observations in Oneiros v1.
They should remain in persistent memory; the worker should produce a no-op for
this case rather than relabel them as voice or expertise. Structural validation
currently accepts all four example sentences if proposed under Voice: it enforces
allowed headings/evidence, not semantic category fit. The private prompt now
explicitly defines each section and requires a no-op when
no section fits, with all four review examples expressly excluded from Voice and
Expertise. Evidence stays in memory. Prompt contract tests, policy-compliant
scripted no-op application, valid additions to all three sections, and rejection
of future Working Style/Decision Principles headings cover the intended contract.
These deterministic tests do not prove that a live model always classifies
correctly; semantic fit remains prompt policy, not a code-level classifier.

A dedicated Working Style or Decision Principles section remains a later
persona-model evolution with its own policy/migration design. No editable
permissions, templates or validator rules were broadened in this revision.

Incremental scope: installer update orchestration, bootstrap/update tests and
README; persona private prompt, Oneiros tests, README and this note. No runner,
memory or scheduler changes are needed for these accepted revisions.

Revision verification: persona 42 tests and installer 158 tests pass; both
TypeScript builds and git diff --check pass. The bootstrap regression uses real
npm, a local fixture registry and separate external/project CLI trees. No live
model inference or public-registry release was performed. Coordinated prerelease
can proceed after approval; commit, publish, tag and push remain unperformed.

Final coordinated verification and post-publication acceptance commands are in
[oneiros-release.md](oneiros-release.md).
