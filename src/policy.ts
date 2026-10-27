// Explicit v1 mutation surface: additive plain-text bullets in existing sections.
import type { Cursor } from './state.js';
export interface Evidence { id: number; content: string; source: string | null; observed: string | null; superseded_by: number | null; meta?: string }
// Mirrors memory's owner source and Telegram's existing inbound message envelope.
// These labels are eligibility hints, never authentication or instructions.
export function eligibleEvidence(row: Evidence): boolean {
  if (row.superseded_by !== null || row.observed !== 'stated') return false;
  if (row.source === 'owner') return true;
  try {
    const meta = JSON.parse(row.meta ?? '{}');
    return typeof meta.actor === 'string' && row.source === `telegram:${meta.actor}` && meta.direction === 'inbound' && meta.kind === 'message';
  } catch { return false; }
}
export interface TranscriptEvidenceRow { id: number; channel: string; direction: string; actor: string; kind: string; content: string; thread_id: string | null }
// Transcript rows are eligible only as the owner's inbound Telegram messages.
// Assistant replies and scheduler rows never are. These labels are eligibility
// hints, never authentication or instructions.
export function eligibleTranscriptRow(row: TranscriptEvidenceRow): boolean {
  return row.channel === 'telegram' && row.direction === 'inbound' && row.kind === 'message' && row.actor === 'owner';
}
// Maps a transcript row onto the memory evidence shape so the worker prompt and
// applyProposal stay unchanged; ineligible rows are marked internal, which
// eligibleEvidence always rejects.
export function transcriptToEvidence(row: TranscriptEvidenceRow): Evidence {
  return { id: row.id, content: row.content, source: `${row.channel}:${row.actor}`, observed: eligibleTranscriptRow(row) ? 'stated' : 'internal', superseded_by: null, meta: JSON.stringify({ actor: row.actor, direction: row.direction, kind: row.kind }) };
}
export const editableSections = ['Voice', 'Interests', 'Expertise'] as const;
export function applyProposal(profile: string, proposal: unknown, entries: Evidence[], cursor: Cursor): string {
  const p = proposal as { additions: Array<{ section: string; text: string; evidence: number[]; kind: string }> };
  if (!p || Object.keys(p).join() !== 'additions' || !Array.isArray(p.additions) || p.additions.length > 5) throw new Error('Expected only bounded additions');
  let result = profile;
  const newline = profile.includes('\r\n') ? '\r\n' : '\n';
  for (const a of p.additions) {
    if (!a || Object.keys(a).sort().join() !== 'evidence,kind,section,text' || !editableSections.includes(a.section as typeof editableSections[number])) throw new Error('Protected section or unsupported patch');
    if (!['fact', 'preference'].includes(a.kind) || typeof a.text !== 'string' || !a.text.trim() || a.text !== a.text.trim() || a.text.length > 300 || /[\r\n\x00-\x1f<>`]/.test(a.text)) throw new Error('Expected short plain-text fact or preference');
    if (!Array.isArray(a.evidence) || !a.evidence.length || a.evidence.length > 10 || new Set(a.evidence).size !== a.evidence.length) throw new Error('Evidence required');
    for (const id of a.evidence) {
      const row = entries.find(e => e.id === id);
      if (!row || !eligibleEvidence(row)) throw new Error('Unsupported evidence: requires owner-stated live memory');
    }
    const heading = `## ${a.section}`;
    const lines = [...result.matchAll(/^## [^\r\n]+$/gm)];
    const matches = lines.filter(m => m[0] === heading);
    if (matches.length !== 1) throw new Error('Missing or ambiguous editable section');
    const match = matches[0]!;
    const start = match.index! + heading.length;
    const end = lines.find(m => m.index! > match.index!)?.index ?? result.length;
    if (result.slice(start, end).includes(a.text)) continue;
    const marker = `<!-- oneiros:${cursor.database}:${[...a.evidence].sort((a,b) => a-b).join(',')} -->`;
    const prefix = result.slice(0, end);
    result = prefix + (prefix.endsWith(newline + newline) ? '' : newline) + `- ${a.text} ${marker}${newline}${newline}` + result.slice(end);
  }
  return result;
}
