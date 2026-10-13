// Internal persona consolidation API. Scheduling and worker execution are injected.
import { existsSync, readFileSync } from 'node:fs';
import { applyProposal, editableSections, eligibleEvidence, type Evidence } from './policy.js';
import { atomic, compatible, hash, lock, profilePath, readCursor, recover, safePath, validateCursor, type Cursor } from './state.js';
export type { Cursor, Evidence };
export const workerPrompt = readFileSync(new URL('../oneiros/prompt.md', import.meta.url), 'utf8');
export interface Delta { cursor: Cursor; entries: Evidence[] }
export interface Memory { head(): Cursor; delta(cursor: Cursor): Delta }
export interface WorkerInput { profile: string; context?: Record<string, string>; eligibleEvidenceIds?: number[]; editableSections: readonly string[]; entries: Evidence[] }
export function initialize(root: string, head: Cursor): void {
  validateCursor(head); const release = lock(root);
  try {
    const previous = readCursor(root);
    if (previous) { compatible(previous, head); return; }
    atomic(safePath(root, '.fortytwo/oneiros/checkpoint.json'), JSON.stringify(head));
  } finally { release(); }
}
export function hasWork(root: string, memory: Memory): boolean {
  const c = readCursor(root); if (!c) return false;
  const head = memory.head(); compatible(c, head);
  return existsSync(safePath(root, '.fortytwo/oneiros/pending.json')) || head.position > c.position;
}
export async function refine(opts: { root: string; memory: Memory; worker(input: WorkerInput): Promise<unknown> }): Promise<void> {
  const { root, memory, worker } = opts; const release = lock(root);
  try {
    const previous = readCursor(root); if (!previous) throw new Error('Oneiros has not been initialized');
    compatible(previous, memory.head()); recover(root);
    const cursor = readCursor(root)!;
    const delta = memory.delta(cursor); compatible(cursor, delta.cursor);
    if (delta.cursor.position === cursor.position) return;
    if (delta.entries.some((e, i) => !Number.isSafeInteger(e.id) || e.id <= cursor.position || e.id > delta.cursor.position || (i > 0 && e.id <= delta.entries[i-1]!.id))) throw new Error('Invalid memory delta');
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
    const current = memory.delta(cursor);
    for (const e of delta.entries) {
      if (JSON.stringify(current.entries.find(r => r.id === e.id)) !== JSON.stringify(e)) throw new Error('Memory evidence changed during refinement');
    }
    const after = applyProposal(before, proposal, delta.entries, delta.cursor);
    for (const [file, text] of Object.entries(context)) {
      if (readFileSync(safePath(root,file),'utf8') !== text) throw new Error('Context changed during refinement');
    }
    atomic(safePath(root, '.fortytwo/oneiros/pending.json'), JSON.stringify({ previous: cursor, next: delta.cursor, before: hash(before), after: hash(after), content: after, contextHashes: Object.fromEntries(Object.entries(context).filter(([file]) => file !== profilePath).map(([file,text]) => [file,hash(text)])) }));
    recover(root);
  } finally { release(); }
}
