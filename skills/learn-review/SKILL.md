---
name: learn-review
description: Weekly review of the last 7 days of conversations and memories that proposes house rules, candidate skills and memory cleanups, and records them in context/rules/PROPOSED.md. Use for the scheduled learn-review, when the owner asks what you have learned or what should become a rule, and when the owner approves or rejects a proposal by its id.
---

<!-- Managed by fortytwo: rewritten by `fortytwo init` and `fortytwo update`.
     Do not edit here. Put personal adjustments in context/rules/APPROVED.md. -->

# Learn-review

Turn the last week into proposals the owner can accept or reject one by one.
This skill has two parts: the weekly review (propose), and what to do when the
owner later answers (approve or reject).

When the review runs from the scheduler, your final message is delivered to the
owner as it is and nobody is there to answer a question. The owner replies
later, in another session, so every proposal must be written down in
`context/rules/PROPOSED.md` first: that file is how the later session knows
what "approve P3" refers to.

## Boundaries

- Propose only. During a review you write to `context/rules/PROPOSED.md` and
  nowhere else.
- Never edit `context/rules/APPROVED.md` during a review. A rule moves there
  only in "When the owner answers" below.
- Do not install or create skills, and do not store, supersede or delete
  memories. Describe the change; the owner decides.
- Leave Voice, Interests and Expertise in `context/PROFILE.md` alone. A
  separate process maintains them. This review covers working rules, candidate
  skills and memory cleanup.
- Every proposal needs evidence you read in this run. No evidence, no proposal.

## Weekly review

1. **Window.** The last 7 days, ending now. Use the same window for every source.
2. **Read what already exists.** Read `context/rules/APPROVED.md` and
   `context/rules/PROPOSED.md` so you do not propose a rule that is already
   there, and so you know which proposal ids are taken.
3. **Conversations.** Use `transcript_search` with `since` set to the start of
   the window. Run several searches, one per signal:
   - corrections: the owner said no, not like that, I already told you, again;
   - stated rules and preferences: always, never, from now on, I prefer, stop;
   - repeated requests: the same task asked for more than once;
   - things the owner asked you not to raise again, and contacts to leave alone;
   - approvals or actions that were referred to but that you cannot find.
   Open each promising hit with `transcript_context` and note its transcript id.
4. **Memories.** Use the Memory MCP `query` with `since` set to the start of
   the window. Note memory ids. Look for duplicates, memories that contradict
   each other, and memories that point at paths or facts that are no longer true.
5. **Decide what is worth proposing.**
   - **Rule**: a correction or instruction that came up at least twice, or that
     the owner stated once as a standing rule. If an approved rule already
     covers it and was broken anyway, propose a sharper wording of that rule
     instead of a new one, and say which rule.
   - **Skill**: a multi-step task done at least twice the same way.
   - **Cleanup**: duplicate, contradictory or stale memories, by id.
   - Skip one-off remarks. Fewer, well-evidenced proposals beat a long list.
6. **Record.** Append each new proposal to `context/rules/PROPOSED.md` using
   the format below. Replace the `_(none yet)_` placeholder if it is still
   there. Do not rewrite or renumber existing entries.
7. **Report.** Send the message described under "Message".

### Entry format in PROPOSED.md

Ids are `P` plus the next free number in the file, and are never reused.

```
## P7 - rule - 2026-01-18
Rule: Reply in Italian unless the owner writes in another language.
Why: corrected twice this week.
Evidence: transcript 4812, transcript 4907, memory 311
```

The second field is `rule`, `skill` or `cleanup`. For `skill`, replace `Rule:`
with `Skill:` and one line on what it would do. For `cleanup`, use `Cleanup:`
and name the memory ids and the change.

### Message

- Plain text, readable on a phone. Language and tone follow
  `context/rules/APPROVED.md` and `context/SOUL.md`.
- One numbered line per new proposal: id, kind, and the proposal in one sentence.
- Last line: how to answer, for example "Reply with the ids to approve or
  reject, e.g. approve P7 P9, reject P8."
- If nothing is worth proposing, send one line saying so and write nothing to
  `PROPOSED.md`.
- No list of what you searched, no summary of the week.

## When the owner answers

Only an explicit answer from the owner that names the id counts. Silence, a
thumbs-up on the whole message, or "sounds good" without ids is not approval:
ask which ids.

- **Approve a rule**: add the `Rule:` text as a bullet to
  `context/rules/APPROVED.md`, then remove the entry from `PROPOSED.md`. If it
  sharpens an existing rule, replace that rule rather than adding a second one.
- **Approve a cleanup**: make exactly the memory changes the entry names, using
  `store` with `supersedes` so history is kept, then remove the entry.
- **Approve a skill**: do not create it silently. Draft it, show the draft to
  the owner, and only save it after they confirm. Then remove the entry.
- **Reject**: remove the entry from `PROPOSED.md`. Do not propose the same
  thing again unless new evidence appears.
- Confirm in one line what you changed, naming the ids.
