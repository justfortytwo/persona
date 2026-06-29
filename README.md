# @justfortytwo/persona

The templated **identity and runtime context** for a fortytwo personal
assistant. This repo ships the scaffolding the installer renders into a user's
project so their assistant has a name, a voice, owner facts, house rules, and a
recallable memory corpus.

This is **not** an npm runtime package. It ships **only templates and a field
manifest** — never any owner's real data.

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
3. Rendering is **idempotent**: re-running `fortytwo init` or `fortytwo update`
   re-renders from `identity.json`, so template improvements land without
   clobbering the captured values.

The concise, always-loaded summary lives in `OWNER.md` / `PROFILE.md`; the deep,
atomized owner profile lives in the Memory MCP (retrieved on demand). The memory
corpus files are reindexed for semantic recall on the next wake.

## What ships — and what never does

Only templates + the manifest + the compat declaration ship in this repo.

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

`type` is one of `string`, `text` (multi-line), or `list` (one item per line).
Every `{{placeholder}}` used anywhere under `templates/` has a matching entry.

### The `files` map: `managed` vs `captured`

The `files` array tells the CLI which template renders to which output, and how
that output is treated on a re-run. This is load-bearing for à-la-carte users
who keep editing their context after install:

```json
{ "template": "context/OWNER.md.tmpl", "output": "context/OWNER.md", "mode": "captured" }
```

- **`managed`** — re-rendered from `identity.json` on **every** `fortytwo init`
  / `fortytwo update`, so template improvements always land. Used for files you
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

## License

MIT © 2026 Enrico Deleo

---

Created and maintained by [**Enrico Deleo**](https://enricodeleo.com).
