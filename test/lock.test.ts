import { expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

it('serializes separate processes recovering the same dead lock', async () => {
  const root = mkdtempSync(join(tmpdir(),'oneiros-lock-'));
  try {
    mkdirSync(join(root,'.fortytwo/oneiros'),{recursive:true});
    const dead = spawnSync(process.execPath,['-e','']).pid;
    writeFileSync(join(root,'.fortytwo/oneiros/lock'),String(dead));
    // Transpile the actual module for real child processes without relying on dist.
    writeFileSync(join(root,'state.mjs'),ts.transpileModule(readFileSync(new URL('../src/state.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
    const script = `import {lock} from './state.mjs';
import {openSync,closeSync,unlinkSync} from 'node:fs';
process.stdout.write('ready\\n');
process.stdin.once('data',()=>{
 let release; try { release=lock(process.cwd()); } catch { process.exit(0); }
 try {
  const fd=openSync('critical','wx'); closeSync(fd);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,80);
  unlinkSync('critical'); process.stdout.write('acquired\\n');
 } catch { process.exitCode=2; }
 finally {release();}
});`;
    writeFileSync(join(root,'contender.mjs'),script);
    const children = Array.from({length:12},()=>spawn(process.execPath,['contender.mjs'],{cwd:root,stdio:['pipe','pipe','pipe']}));
    let acquired=0;
    const exits=children.map(c=>new Promise<number|null>(resolve=>{c.stdout.on('data',d=>{if(String(d).includes('acquired'))acquired++;}); c.on('exit',resolve);}));
    await Promise.all(children.map(c=>new Promise<void>(resolve=>c.stdout.once('data',()=>resolve()))));
    for(const c of children)c.stdin.end('go');
    expect(await Promise.all(exits)).toEqual(Array(12).fill(0));
    expect(acquired).toBeGreaterThan(0);
  } finally {rmSync(root,{recursive:true,force:true});}
},15000);
