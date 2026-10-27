// Internal persona consolidation API. Scheduling and worker execution are injected.
import { existsSync, readFileSync } from 'node:fs';
import { applyProposal, editableSections, eligibleEvidence, eligibleTranscriptRow, transcriptToEvidence, type Evidence, type TranscriptEvidenceRow } from './policy.js';
import { atomic, checkpointPath, compatible, hash, lock, pendingPath, profilePath, readCursor, recover, safePath, streamLabel, validateCursor, type Cursor, type Stream } from './state.js';
export type { Cursor, Evidence, Stream, TranscriptEvidenceRow };
export { eligibleTranscriptRow, transcriptToEvidence };
export const workerPrompt = readFileSync(new URL('../oneiros/prompt.md', import.meta.url), 'utf8');
export interface Delta { cursor: Cursor; entries: Evidence[] }
export interface Memory { head(): Cursor; delta(cursor: Cursor): Delta }
export interface TranscriptSource { head(): Cursor; delta(cursor: Cursor): { cursor: Cursor; entries: TranscriptEvidenceRow[] } }
export interface WorkerInput { profile: string; context?: Record<string, string>; eligibleEvidenceIds?: number[]; editableSections: readonly string[]; entries: Evidence[] }
type Worker = (input: WorkerInput) => Promise<unknown>;
// Both streams are refined through the memory evidence shape.
const asEvidence = (transcript: TranscriptSource): Memory => ({
  head: () => transcript.head(),
  delta: cursor => { const d = transcript.delta(cursor); return { cursor: d.cursor, entries: d.entries.map(transcriptToEvidence) }; },
});
export function readCheckpoint(root: string, stream: Stream = 'memory'): Cursor | null { return readCursor(root, stream); }
export function initialize(root: string, head: Cursor, stream: Stream = 'memory'): void {
  validateCursor(head, stream); const release = lock(root);
  try {
    const previous = readCursor(root, stream);
    if (previous) { compatible(previous, head, stream); return; }
    // Writes exactly the given cursor: transcript migration passes the position
    // already consumed, which need not be the transcript head.
    atomic(checkpointPath(root, stream), JSON.stringify(head));
  } finally { release(); }
}
function streamHasWork(root: string, stream: Stream, source: { head(): Cursor }): boolean {
  const c = readCursor(root, stream); if (!c) return false;
  const head = source.head(); compatible(c, head, stream);
  return existsSync(pendingPath(root, stream)) || head.position > c.position;
}
// An initialised transcript stream whose source is missing (package absent,
// failed import) must not be silently skipped: its evidence would never be
// consolidated and nothing would say so. Memory-only installs have no
// transcript checkpoint or receipt and are unaffected.
function requireTranscriptSource(root: string, transcript: TranscriptSource | undefined): void {
  if (transcript) return;
  if (readCursor(root, 'transcript') !== null || existsSync(pendingPath(root, 'transcript'))) {
    throw new Error('Oneiros transcript stream initialised but transcript source unavailable; install or repair @justfortytwo/transcript');
  }
}
export function hasWork(root: string, memory: Memory, transcript?: TranscriptSource): boolean {
  requireTranscriptSource(root, transcript);
  // Both streams are checked so an incompatible cursor always fails closed.
  const fromMemory = streamHasWork(root, 'memory', memory);
  const fromTranscript = transcript ? streamHasWork(root, 'transcript', transcript) : false;
  return fromMemory || fromTranscript;
}
export async function refine(opts: { root: string; memory: Memory; transcript?: TranscriptSource; worker: Worker }): Promise<void> {
  const { root, worker } = opts; const release = lock(root);
  try {
    requireTranscriptSource(root, opts.transcript);
    const streams: Array<[Stream, Memory]> = [['memory', opts.memory]];
    if (opts.transcript) streams.push(['transcript', asEvidence(opts.transcript)]);
    const active = streams.filter(([stream]) => readCursor(root, stream) !== null);
    if (!active.length) throw new Error('Oneiros has not been initialized');
    // Every leftover receipt is settled before any round reads the shared profile,
    // so one stream's new edit cannot strand the other stream's receipt.
    for (const [stream, source] of active) { compatible(readCursor(root, stream)!, source.head(), stream); recover(root, stream); }
    for (const [stream, source] of active) await round(root, stream, source, worker);
  } finally { release(); }
}
async function round(root: string, stream: Stream, source: Memory, worker: Worker): Promise<void> {
  const cursor = readCursor(root, stream)!;
  const delta = source.delta(cursor); compatible(cursor, delta.cursor, stream);
  if (delta.cursor.position === cursor.position) return;
  if (delta.entries.some((e, i) => !Number.isSafeInteger(e.id) || e.id <= cursor.position || e.id > delta.cursor.position || (i > 0 && e.id <= delta.entries[i-1]!.id))) throw new Error(`Invalid ${stream} delta`);
  // Read after any earlier round, so each round builds on the profile as written.
  const path = safePath(root, profilePath); const before = readFileSync(path, 'utf8');
  // The actual manifest bounds what is read; no arbitrary worker-selected paths.
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8')) as { files: Array<{output:string}> };
  const context: Record<string,string> = {};
  for (const file of manifest.files) {
    const contextPath = safePath(root,file.output);
    if (existsSync(contextPath)) context[file.output] = readFileSync(contextPath,'utf8');
  }
  const eligibleEvidenceIds = delta.entries.filter(eligibleEvidence).map(e => e.id);
  const input = { profile: before, context, editableSections, entries: delta.entries, eligibleEvidenceIds };
  // Oversized evidence fails closed, never silently skipped.
  if (eligibleEvidenceIds.length && Buffer.byteLength(JSON.stringify(input)) > 100_000) throw new Error('Oneiros context exceeds input budget');
  const proposal = eligibleEvidenceIds.length ? await worker(input) : { additions: [] };
  // Re-read the same page so deletions/supersession during reasoning invalidate it.
  const current = source.delta(cursor);
  for (const e of delta.entries) {
    if (JSON.stringify(current.entries.find(r => r.id === e.id)) !== JSON.stringify(e)) throw new Error(`${streamLabel[stream]} evidence changed during refinement`);
  }
  const after = applyProposal(before, proposal, delta.entries, delta.cursor);
  for (const [file, text] of Object.entries(context)) {
    if (readFileSync(safePath(root,file),'utf8') !== text) throw new Error('Context changed during refinement');
  }
  atomic(pendingPath(root, stream), JSON.stringify({ previous: cursor, next: delta.cursor, before: hash(before), after: hash(after), content: after, contextHashes: Object.fromEntries(Object.entries(context).filter(([file]) => file !== profilePath).map(([file,text]) => [file,hash(text)])) }));
  recover(root, stream);
}
