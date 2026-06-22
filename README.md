# @justfortytwo/ford

The templated **identity and runtime context** for a fortytwo ("Ford") personal
assistant. This repo ships the scaffolding the installer renders into a user's
project so their assistant has a name, a voice, owner facts, house rules, and a
recallable Guide.

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
    guide/
      INDEX.md.tmpl                    # Guide index
      owner-profile.md.tmpl            # stable identity, bio anchors, positioning
      owner-beliefs.md.tmpl            # core beliefs / operating principles
      owner-voice-and-writing.md.tmpl  # tone, vocabulary, channel rules, quality test
      domain-positioning.md.tmpl       # primary venture / domain narrative
manifest.json                          # field manifest (drives `fortytwo init`)
fortytwo.compat.json                   # contract majors this persona relies on
```

## How it works

Templates use `{{placeholder}}` tokens. The CLI (`@justfortytwo/magrathea`) drives the
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
atomized owner profile lives in the Memory MCP (retrieved on demand). The Guide
files are reindexed for semantic recall on the next wake.

## What ships — and what never does

Only templates + the manifest + the compat declaration ship in this repo.

The rendered output (`context/*`, `CLAUDE.md`), `.fortytwo/identity.json`, and
any uploaded profile material are **all gitignored** in the user's project and
**never** enter this repo. No real name, email, address, timezone, channel id,
or biographical detail is committed here — every owner-specific value is a
`{{placeholder}}` resolved at install time on the user's machine.

## Field manifest

`manifest.json` is an array of field descriptors, each:

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

## Compatibility

`fortytwo.compat.json` declares the cross-component contract majors this persona
targets. The CLI reads it during `fortytwo doctor` and warns on a mismatch:

```json
{
  "guideToolContract": "^1",
  "policySchema": "^1"
}
```

- **`guideToolContract`** — the shape/set of guide MCP tools the wake routine
  and recall steps depend on.
- **`policySchema`** — the approval-gate policy / allowlist format the
  non-negotiable policy and house rules assume.

## License

MIT © 2026 Enrico Deleo

---

Created and maintained by [**Enrico Deleo**](https://enricodeleo.com).
