// Private durable state and write-ahead recovery. No context policy lives here.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
export interface Cursor { database: string; position: number }
export const profilePath = 'context/PROFILE.md';
// One checkpoint and one write-ahead receipt per evidence stream. Memory keeps
// its original file names so existing installations continue unchanged.
export type Stream = 'memory' | 'transcript';
const streamFiles: Record<Stream, { checkpoint: string; pending: string }> = {
  memory: { checkpoint: '.fortytwo/oneiros/checkpoint.json', pending: '.fortytwo/oneiros/pending.json' },
  transcript: { checkpoint: '.fortytwo/oneiros/transcript-checkpoint.json', pending: '.fortytwo/oneiros/transcript-pending.json' },
};
// Human label used in errors, so a transcript fault is never reported as memory.
export const streamLabel: Record<Stream, string> = { memory: 'Memory', transcript: 'Transcript' };
function files(stream: Stream): { checkpoint: string; pending: string } {
  if (!Object.hasOwn(streamFiles, stream)) throw new Error('Unknown Oneiros stream');
  return streamFiles[stream];
}
export function checkpointPath(root: string, stream: Stream = 'memory'): string { return safePath(root, files(stream).checkpoint); }
export function pendingPath(root: string, stream: Stream = 'memory'): string { return safePath(root, files(stream).pending); }
export function safePath(root: string, relative: string): string {
  const base = resolve(root); let current = base;
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..') throw new Error('Invalid internal path');
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Symlink refused');
  }
  if (!current.startsWith(base + sep)) throw new Error('Path escape');
  return current;
}
export function stateDir(root: string): string {
  const dir = safePath(root, '.fortytwo/oneiros'); mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir;
}
export function hash(text: string): string { return createHash('sha256').update(text).digest('hex'); }
export function atomic(path: string, content: string): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
  const dir = openSync(dirname(path), 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
}
export function readCursor(root: string, stream: Stream = 'memory'): Cursor | null {
  const path = checkpointPath(root, stream);
  if (!existsSync(path)) return null;
  const c = JSON.parse(readFileSync(path, 'utf8'));
  validateCursor(c, stream); return c;
}
export function validateCursor(c: Cursor, stream: Stream = 'memory'): void {
  if (!c || typeof c.database !== 'string' || !/^[\w-]+$/.test(c.database) || !Number.isSafeInteger(c.position) || c.position < 0) throw new Error(`Invalid ${stream} cursor`);
}
export function compatible(previous: Cursor, next: Cursor, stream: Stream = 'memory'): void {
  validateCursor(next, stream);
  if (previous.database !== next.database || previous.position > next.position) throw new Error(`${streamLabel[stream]} database changed or moved backwards`);
}
// The reaper is itself an exclusive PID lock. Every stale takeover rechecks the
// main inode while holding it, so a second reaper cannot unlink a new live lock.
function acquire(path: string, candidate: string, depth = 0): () => void {
  if (depth > 8) throw new Error('Too many abandoned Oneiros locks; inspect state');
  const own = lstatSync(candidate);
  const release = () => {
    try {
      const current = lstatSync(path);
      if (current.ino === own.ino && current.dev === own.dev) unlinkSync(path);
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  };
  try { linkSync(candidate, path); return release; } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  let stale;
  try { stale = lstatSync(path); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return acquire(path,candidate,depth+1);
    throw e;
  }
  if (stale.isSymbolicLink()) throw new Error('Symlink refused');
  let owner: string;
  try { owner = readFileSync(path, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return acquire(path,candidate,depth+1);
    throw e;
  }
  const pid = Number(owner.split(':')[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid Oneiros lock; inspect before removal');
  try { process.kill(pid, 0); throw new Error('Oneiros is already running'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
  }
  const releaseReaper = acquire(`${path}.reap`,candidate,depth+1);
  try {
    let current;
    try { current = lstatSync(path); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (current && current.ino === stale.ino && current.dev === stale.dev && readFileSync(path,'utf8') === owner) unlinkSync(path);
    // EEXIST here is a competing live owner. Never unlink its lock.
    linkSync(candidate,path);
    return release;
  } finally { releaseReaper(); }
}
export function lock(root: string): () => void {
  const dir = stateDir(root); const path = safePath(root, '.fortytwo/oneiros/lock');
  const candidate = join(dir, `lock-${randomUUID()}`);
  writeFileSync(candidate, `${process.pid}:${randomUUID()}`, { flag: 'wx', mode: 0o600 });
  try { return acquire(path,candidate); } finally { unlinkSync(candidate); }
}
export interface Receipt { previous: Cursor; next: Cursor; before: string; after: string; content: string; contextHashes: Record<string,string> }
export function recover(root: string, stream: Stream = 'memory'): void {
  const receiptPath = pendingPath(root, stream);
  if (!existsSync(receiptPath)) return;
  const r: Receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  compatible(r.previous, r.next, stream);
  const cursor = readCursor(root, stream);
  if (!cursor || cursor.database !== r.previous.database || ![r.previous.position, r.next.position].includes(cursor.position) || hash(r.content) !== r.after) throw new Error('Invalid recovery receipt');
  const path = safePath(root, profilePath); const current = hash(readFileSync(path, 'utf8'));
  if (current !== r.before && current !== r.after) throw new Error('Context changed during recovery; manual reconciliation required');
  if (current === r.before && current !== r.after) {
    if (!r.contextHashes || typeof r.contextHashes !== 'object' || Array.isArray(r.contextHashes)) throw new Error('Invalid context baseline in receipt');
    for (const [file, expected] of Object.entries(r.contextHashes)) {
      const baselinePath = safePath(root,file);
      if (!existsSync(baselinePath) || hash(readFileSync(baselinePath,'utf8')) !== expected) throw new Error('Context changed during recovery; manual reconciliation required');
    }
    atomic(path, r.content);
  }
  atomic(checkpointPath(root, stream), JSON.stringify(r.next));
  unlinkSync(receiptPath);
}
