# AGENTS.md — @justfortytwo/persona

Guidance for AI coding agents working in this repository.

## What this is

`@justfortytwo/persona` is the templated **identity and runtime context** for a
fortytwo personal assistant. It ships **only** Markdown templates, a field
manifest, and a compat declaration. There is no runtime code: the package is
consumed as data by the installer CLI (`@justfortytwo/installer`), which prompts
for fields, stores answers in the user's gitignored `.fortytwo/identity.json`,
and renders `templates/**/*.tmpl` into the user's gitignored `context/` and
root `CLAUDE.md`.

**Hard rule:** no real owner data ever lands here. Every owner-specific value
must be a `{{placeholder}}` resolved on the user's machine at install time.

## Layout

```
templates/
  CLAUDE.md.tmpl               # root boot pointer (rendered to the user's CLAUDE.md)
  context/
    INDEX.md.tmpl              # wake routine, boundaries, policy
    OWNER.md.tmpl, PROFILE.md.tmpl, SOUL.md.tmpl
    rules/APPROVED.md.tmpl, rules/PROPOSED.md.tmpl
    memory/*.md.tmpl           # memory corpus (INDEX + owner/domain files)
manifest.json                  # { version, manifestVersion, description, files[], fields[] }
fortytwo.compat.json           # contract majors: memoryToolContract, policySchema
test/conformance.test.ts       # the only test file; enforces the contract below
.github/workflows/ci.yml       # calls justfortytwo/.github node-ci.yml@main
```

Published files (`package.json` `files`): `templates`, `manifest.json`,
`fortytwo.compat.json`, `README.md`, `LICENSE`. Nothing else ships.

## Commands

From `package.json` (Node, ESM, npm with `package-lock.json`):

```bash
npm ci          # install dev deps (vitest, typescript, @types/node)
npm test        # vitest run — the conformance suite
```

There is no build, lint, or typecheck script, and no `tsconfig.json`; vitest
runs the TypeScript test directly. CI delegates to the shared org workflow
`justfortytwo/.github/.github/workflows/node-ci.yml@main` (leaf package, no
sibling linking).

## Contract enforced by `test/conformance.test.ts`

Do not weaken these tests to make them pass; fix the templates or manifest.

1. Every `{{token}}` used in any template has a matching `fields[].key`.
2. Every field has a non-empty `key` and `prompt`, and `type` is one of
   `string` | `text` (multi-line) | `list` (one item per line). No duplicate keys.
3. `manifest.json` and `fortytwo.compat.json` parse as JSON.
4. `manifest.files` lists **every** `.tmpl` on disk exactly once (paths relative
   to `templates/`).
5. Each `files` entry has `mode` `managed` or `captured`, and `output` equals
   `template` minus the trailing `.tmpl` (no `..` segments).
6. No forbidden personal-data substrings in `templates/` or `manifest.json`
   (the list is `FORBIDDEN` in the test; README is exempt for author credit).

## Conventions and how-to

- **Adding a template:** create `templates/<path>.tmpl`, add a `files` entry
  (`output` = path without `.tmpl`), choose a mode, and add a `fields` entry for
  any new placeholder. Run `npm test`.
- **Render modes:** `managed` = re-rendered on every `fortytwo init`/`update`
  (currently `CLAUDE.md`, `context/INDEX.md`, `context/memory/INDEX.md`).
  `captured` = written once, then owner-owned and never clobbered (everything
  else). Changing a file's mode changes user-facing upgrade behavior.
- **Placeholder names** are snake_case, matching `fields[].key` exactly
  (most are `owner_*`; also `agent_name`).
- **List fields:** the installer joins arrays with `"\n- "`, so in templates a
  list placeholder must follow a leading `- ` (e.g. `- {{owner_values}}`).
- **Captured-but-not-rendered fields:** `owner_email` and `owner_address` are
  prompted and stored in `identity.json` but intentionally have no template
  token. Do not add `{{owner_email}}`/`{{owner_address}}` to templates.
- Keep templates generic and placeholder-driven; examples in prompts must stay
  neutral (no real names, emails, places, companies).

## Gotchas

- The installer's renderer (`installer/src/render.ts`) **throws** on any
  referenced placeholder whose value is missing/null. A new token in a template
  needs a field that the user will actually have a value for (a `default`, or
  `required: true`), or rendering will fail for existing installs.
- The installer reads `manifest.json` via `@justfortytwo/persona/manifest.json`
  and templates from `<pkg>/templates`; renaming/moving these, or dropping them
  from `package.json` `files`, breaks the installer.
- `manifest.json` declares a `$schema` URL (`manifest.schema.json`) that is not
  present in this repo; do not rely on it for validation.
- Bumping a major in `fortytwo.compat.json` makes `fortytwo doctor` warn on
  mismatched installs; coordinate with the memory and gate packages.
- `CLAUDE.md`, `.wolf/`, `.claude/`, `.codegraph/` in the repo root are local
  tooling files (untracked), not package content. `templates/CLAUDE.md.tmpl` is
  the shipped boot pointer — do not confuse the two.

## Sibling repos (`../` in the `justfortytwo` workspace)

- `installer` — `@justfortytwo/installer`, the `fortytwo` CLI; depends on
  `@justfortytwo/persona` (`^0.1.0`) and renders these templates
  (`src/render.ts`, `src/commands/init.ts`, `update.ts`).
- `memory`, `gate` — providers of the memory MCP tool contract and the
  approval-gate policy schema referenced by `fortytwo.compat.json`.
- Others (`runner`, `scheduler`, `salience`, `telegram`, `marketplace`,
  `website`, `docs`) are separate packages; this repo has no code dependency on
  them.

Project name is "fortytwo"; "justfortytwo" is only the GitHub org / npm scope.

## fortytwo project context

This repository is part of **fortytwo**, a local-first personal-assistant spine built around existing agent runtimes and tool ecosystems.

The umbrella project is **fortytwo**. It is not intended to replace Claude Code, Codex, MCP servers, plugins, skills, or other agent runtimes. The project provides the durable personal-assistant infrastructure around them: memory, lifecycle, scheduling, channels, optional policy enforcement, and related supporting components.

Claude Code is currently the primary/reference runtime, but the architecture should avoid unnecessary coupling to a specific model provider. In particular, components should remain usable when Claude Code itself is configured against alternative compatible model providers.

The main bootstrap and lifecycle entry point is the **installer** repository (`justfortytwo/installer`).

### Canonical project locations

- Website: `forty-two.it`
- GitHub organization: `github.com/justfortytwo`
- Architecture/design documentation: `justfortytwo/docs`

### Repositories

The fortytwo project is intentionally split into small, focused repositories.

- **`justfortytwo/installer`**
  Main installer and lifecycle CLI (`create-fortytwo` / `fortytwo`). This is the primary bootstrap entry point for assembling a fortytwo installation.

- **`justfortytwo/runner`**
  Thin Claude Code process/session runtime. Owns process lifecycle and stream transport, including one-shot runs and persistent interactive sessions. It must not become an agent framework.

- **`justfortytwo/memory`**
  Durable semantic-memory MCP server backed by local storage and retrieval infrastructure.

- **`justfortytwo/scheduler`**
  Durable scheduling and proactive job execution. Owns *when* work should happen, not how the agent reasons about or performs that work.

- **`justfortytwo/telegram`**
  Telegram transport/channel adapter. Owns Telegram identity, pairing, message transport, attachment handling, and mapping chats to live agent sessions. It should delegate agent process lifecycle to `runner`.

- **`justfortytwo/persona`**
  Persona and context templates rendered by the installer into an individual fortytwo installation.

- **`justfortytwo/gate`**
  Optional external safety/policy enforcement layer for tool execution and approvals. Keep this separate from the agent runtime's own reasoning and permissions.

- **`justfortytwo/salience`**
  Optional model-driven salience extraction used to enrich durable memory.

- **`justfortytwo/marketplace`**
  Claude Code plugin marketplace and umbrella plugin used as a distribution surface for fortytwo components.

- **`justfortytwo/docs`**
  Cross-repository architecture, design, contracts, and project documentation.

- **`justfortytwo/website`**
  Public website for the project, served as `forty-two.it`.

- **`justfortytwo/.github`**
  GitHub organization metadata and shared organization-level project information.

### Cross-repository architecture

When changing one repository, treat the sibling repositories as parts of the same system.

The intended high-level ownership is:

```text
channels / scheduler
        |
        v
      runner
        |
        v
   agent runtime
  (Claude Code today)
        |
        +---- MCPs / plugins / skills / tools
        |
        +---- fortytwo memory

optional surrounding components:
- gate
- salience

bootstrap / distribution / documentation:
- installer
- persona
- marketplace
- docs
- website
```

A useful rule when deciding where code belongs:

> fortytwo should add continuity and infrastructure around an existing agent, not reimplement capabilities already owned by the agent runtime or its MCP/plugin ecosystem.

Examples:

- agent reasoning, planning, subagents, tools, MCP orchestration, and plugins belong to the agent runtime;
- Claude process/session lifecycle belongs to `runner`;
- durable memory belongs to `memory`;
- durable time and scheduled execution belong to `scheduler`;
- Telegram transport and Telegram identity belong to `telegram`;
- installation and lifecycle management belong to `installer`;
- browser automation should normally come from an existing MCP/plugin rather than a fortytwo-specific browser implementation.

Before introducing a new abstraction, check the relevant sibling repositories and the agent runtime's existing capabilities to avoid duplicating functionality elsewhere in the fortytwo stack.
