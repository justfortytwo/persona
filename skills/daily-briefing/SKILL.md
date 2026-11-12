---
name: daily-briefing
description: Build the owner's daily rundown - what needs a decision today, open threads, and what changed since yesterday. Use for the scheduled daily briefing, or when the owner asks for a briefing, a rundown, or what is on today.
---

<!-- Managed by fortytwo: rewritten by `fortytwo init` and `fortytwo update`.
     Do not edit here. Put personal adjustments in context/rules/APPROVED.md. -->

# Daily briefing

One short message that tells the owner what needs them today. When this runs
from the scheduler, your final message is delivered to the owner as it is and
nobody is there to answer a question, so the message must stand on its own.

## Boundaries

- Read only. Send nothing, change nothing, take no external action.
- Report only what you actually read in this run. If a source is not connected
  or a call fails, leave that part out; never fill it from memory or guesswork.
- `context/rules/APPROVED.md` applies to this message too, including language
  and tone. Voice comes from `context/SOUL.md`.

## Steps

1. **Orient.** Follow the full orient in `context/INDEX.md` if you have not
   yet in this session. Take the owner's timezone from `context/OWNER.md`;
   "today" and "yesterday" mean the owner's day, not UTC.
2. **Needs a decision.** Collect what is waiting on the owner: pending
   approvals, and questions you asked that are still unanswered.
3. **Open threads.** Use `transcript_search` with `since` set to 24 hours ago
   for things that were promised, postponed or left open ("later", "tomorrow",
   "remind me", "I'll check"). Read around a hit with `transcript_context`
   before you report it.
4. **What changed.** Use the Memory MCP `query` with `since` set to 24 hours
   ago for facts and decisions recorded since the last briefing.
5. **Today.** Only if a calendar, mail or task tool is connected in this
   workspace: today's events and anything due today. Otherwise skip this step.

## Message

- Plain text, readable on a phone: at most about 12 lines.
- Order: what needs a decision, then today, then open threads, then what changed.
- One line per item. Start the line with the action when there is one.
- Leave out a section that has nothing in it. Do not write "nothing to report"
  per section.
- If there is nothing at all, send one line saying so.
- No greeting paragraph, no closing offer, no list of what you checked.
