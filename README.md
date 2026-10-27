# @justfortytwo/persona

The templated **identity and runtime context** for a fortytwo personal
assistant. This repo ships the scaffolding the installer renders into a user's
project so their assistant has a name, a voice, owner facts, house rules, and a
recallable memory corpus.

It ships templates, a field manifest and the internal **Oneiros** consolidation
library/prompt. It never ships an owner's real data.

## What's in here

```
templates/
  CLAUDE.md.tmpl                       # root boot pointer
  context/
    INDEX.md.tmpl                      # wake routine + boundaries + policy
    OWNER.md.tmpl                      # owner facts (name, languages, timezone, locale)
    PROFILE.md.tmpl                    # concise, always-loaded owner profile
    SOUL.md.tmpl                       # assistant character and voice
    rules/
      APPROVED.md.tmpl                 # binding house rules
      PROPOSED.md.tmpl                 # pending rule ideas (not binding)
    memory/
      INDEX.md.tmpl                    # memory corpus index
      owner-profile.md.tmpl            # stable identity, bio anchors, positioning
      owner-beliefs.md.tmpl            # core beliefs / operating principles
      owner-voice-and-writing.md.tmpl  # tone, vocabulary, channel rules, quality test
      domain-positioning.md.tmpl       # primary venture / domain narrative
manifest.json                          # field manifest (drives `fortytwo init`)
fortytwo.compat.json                   # contract majors this persona relies on
```

## How it works

Templates use `{{placeholder}}` tokens. The CLI (`@justfortytwo/installer`) drives the
flow:

1. **`fortytwo init`** prompts for each field in `manifest.json` (or accepts
   flags / env for non-interactive installs) and writes the answers to a
   **gitignored `.fortytwo/identity.json`** — the single source of truth.
2. The CLI **renders** every `templates/**/*.tmpl` against
   `.fortytwo/identity.json`, replacing each token, and writes the result into
   the user's **gitignored `context/`** (and `CLAUDE.md` at the project root).
3. Re-running `fortytwo init` re-renders managed templates and preserves existing
   captured files. `fortytwo update` reconciles machine-owned runtime assets only;
   it does not re-render context.

The concise, always-loaded summary lives in `OWNER.md` / `PROFILE.md`; the deep,
atomized owner profile lives in the Memory MCP (retrieved on demand). The memory
corpus files are reindexed for semantic recall on the next wake.

## What ships — and what never does

Templates, manifest, compatibility declaration, compiled Oneiros library and
private worker prompt ship in the package.

The rendered output (`context/*`, `CLAUDE.md`), `.fortytwo/identity.json`, and
any uploaded profile material are **all gitignored** in the user's project and
**never** enter this repo. No real name, email, address, timezone, channel id,
or biographical detail is committed here — every owner-specific value is a
`{{placeholder}}` resolved at install time on the user's machine.

## Field manifest

`manifest.json` is an **object**, not a bare array. Its top level carries
`version`, `manifestVersion`, and a `description`, plus two arrays: a `files`
map (template → output → render mode) and a `fields` list of descriptors.

Each entry in `fields` looks like:

```json
{
  "key": "owner_name",
  "prompt": "Your full name (how the assistant refers to you)",
  "type": "string",
  "required": true,
  "default": null
}
```

`type` is one of `string`, `text` (multi-line), or `list` (an array of items; the installer asks for them one at a time, blank entry to finish).
Every `{{placeholder}}` used anywhere under `templates/` has a matching entry.

### The `files` map: `managed` vs `captured`

The `files` array tells the CLI which template renders to which output, and how
that output is treated on a re-run. This is load-bearing for à-la-carte users
who keep editing their context after install:

```json
{ "template": "context/OWNER.md.tmpl", "output": "context/OWNER.md", "mode": "captured" }
```

- **`managed`** — re-rendered from `identity.json` on **every** `fortytwo init`
  invocation. Update preserves these files too. Used for files you
  are not meant to hand-edit: `CLAUDE.md`, the `context/INDEX.md` files.
- **`captured`** — rendered **once** on first install, then **owner-owned** and
  never clobbered by a later `update`. Used for everything you will live in and
  tune by hand: `OWNER.md`, `PROFILE.md`, `SOUL.md`, the `rules/` files, and the
  whole memory corpus.

The `output` path is always the `template` path minus the trailing `.tmpl`.

### Owner facts that are captured but never rendered

A few fields exist purely for the owner record. `owner_email` and
`owner_address` are prompted at init and stored in `.fortytwo/identity.json`
(for the owner record and the Memory MCP) but are **intentionally not** rendered
into any template — no `{{owner_email}}` / `{{owner_address}}` token exists. So
if you wonder why init asks for an email and a location that never show up in
`context/`, that is by design: they stay in your gitignored identity file.

## Compatibility

`fortytwo.compat.json` declares the cross-component contract majors this persona
targets. The CLI reads it during `fortytwo doctor` and warns on a mismatch:

```json
{
  "memoryToolContract": "^1",
  "policySchema": "^1"
}
```

- **`memoryToolContract`** — the shape/set of memory MCP tools the wake routine
  and recall steps depend on.
- **`policySchema`** — the approval-gate policy / allowlist format the
  non-negotiable policy and house rules assume.

## Oneiros

Oneiros is internal background maintenance. Scheduler owns the daily
`persona.oneiros` job (`17 3 * * *`, UTC); runner executes a separate tool-free
session. The private prompt is bundled at `oneiros/prompt.md`. Nothing is installed
in `.claude/agents`, no skill/MCP is registered, and no main-session context is added.

Persona exports `initialize(root, head, stream?)`, `readCheckpoint(root, stream?)`,
`hasWork(root, memory, transcript?)` and `refine({ root, memory, transcript?, worker })`.
Oneiros reads two evidence streams, each with its own cursor: memory and the
chat transcript (`TranscriptSource`, the same `head`/`delta` shape). `refine`
runs one round per initialised stream, memory first, sequentially under one
lock; a stream without a checkpoint is skipped and any error aborts the call.
An initialised transcript stream (its checkpoint or receipt exists) with no
transcript source supplied fails closed in both `hasWork` and `refine`
("transcript stream initialised but transcript source unavailable") instead of
silently skipping; memory-only installs are unaffected.
Each round reads PROFILE as the previous round wrote it. Transcript rows are
mapped by `transcriptToEvidence`; only owner inbound Telegram messages
(`eligibleTranscriptRow`: channel `telegram`, direction `inbound`, kind
`message` and actor exactly `owner`) are eligible, never assistant or scheduler
rows. Telegram's `OWNER_ACTOR` must therefore stay `owner` for its messages to
count as Oneiros evidence. The row's own `meta` contributes only `source_kind`
and `telegram.has_forward` to the evidence meta the worker sees, as provenance
context; it never changes eligibility, and malformed meta is ignored.
The worker receives a JSON baseline and bounded
delta, and returns `{ "additions": [] }` or evidence-backed additions.
Code permits only new plain-text bullets in existing PROFILE Voice, Interests
and Expertise sections. It protects all other files/sections, validates evidence
IDs, rejects inferred/imported/superseded evidence and preserves existing bytes.
Eligible memory evidence is live and `observed: "stated"`, with either
`source: "owner"` or Telegram's inbound-message provenance
(`source: "telegram:<actor>"`, inbound message meta). Transcript evidence is
stricter: the actor must be exactly `owner` (see above). Outbound assistant
messages are excluded.
Free-form provenance is not authentication: the prompt must still distinguish
statements from quoted commands and speculation. The model's semantic judgment
is not a security guarantee; the deterministic mutation boundary is enforced.

A cursor is `{ database, position }`: a persistent memory DB identity and its
AUTOINCREMENT insertion high watermark, including deleted IDs. Memory supplies
bounded ascending pages; persona checkpoints only the reviewed page. No-op
reviews also advance. New memory arriving during a run remains for a later run.

State is private under `.fortytwo/oneiros/`: `checkpoint.json` and an
interrupted-write `pending.json` for memory, `transcript-checkpoint.json` and
`transcript-pending.json` for the transcript, plus transient PID locks. All
leftover receipts are recovered before any round edits PROFILE.
`initialize(root, cursor, 'transcript')` writes exactly the given cursor, so a
migration can start the transcript at the position already consumed. Writes use fsync plus atomic
rename. Recovery applies a validated receipt only if the context still matches
its before/after hash; otherwise it stops for manual reconciliation. Retrying
cannot apply the same receipt twice. Do not edit these files while a run is active.
An editor that ignores the lock can still race the final filesystem rename;
changes observed before the write are rejected. Coordinate manual edits by
stopping the runtime. Oversized input (>100 KB) fails closed without checkpointing.

Fresh init initializes at the current memory head (zero for an empty database)
and seeds one persistent job without new onboarding questions. Updating an older
installation does the same only when state is missing, skipping historical
memory. Repeated updates preserve the checkpoint and job identity. No historical
backfill is performed, and no context is rendered during update.

The coordinated versions are persona `1.0.0-1`, memory `1.0.0-1`, scheduler
`1.0.0-3` and installer `1.0.0-10`; runner `1.0.0-0` already has the needed API.
From the project root, existing `1.0.0-9` installations use this one-time bootstrap
after publication: `fortytwo stop`,
`npx @justfortytwo/installer@1.0.0-10 update`, `fortytwo start`. The invoked
installer persists its newer exact version into the project before updating
engines; subsequent `fortytwo` commands use that version. No re-exec, manual npm install or init is needed. Update refuses a live supervisor or live
scheduler heartbeat so an old daemon cannot consume the new job. The worker
requires a Claude CLI supporting `--safe-mode`; unsupported flags fail the job
without changing context/checkpoint. Provider and authentication configuration
are preserved. No live model call is required by the test suite.

```sh
npm test
npm run build
```

See [the implementation note](docs/oneiros-implementation.md) for boundaries and
migration rationale.

## License

MIT © 2026 Enrico Deleo

---

Created and maintained by [**Enrico Deleo**](https://enricodeleo.com).

Oneiros requires semantic fit: Voice covers expression/tone/communication,
Interests covers topics, and Expertise covers knowledge/depth. Working-style
and decision-principle observations without an allowed semantic home remain in
memory; they do not become Voice or Expertise bullets. Dedicated sections are
a future persona-model evolution. Semantic classification is model policy; the
deterministic validator continues to enforce the narrow structural surface.
