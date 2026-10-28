/** Bundle the production Movy application and our existing HB/Movy surface. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function buildMove({root,source,schwung,esbuild}){
 await esbuild.build({entryPoints:[resolve(root,'move-runtime.mjs')],bundle:true,format:'esm',platform:'browser',
  outfile:resolve(root,'build/move-runtime.mjs'),alias:{movy:resolve(source,'src')},define:{__MOVY_DEBUG__:'false'},
  plugins:[{name:'browser-move-host',setup(build){
   // Device tool reloads clear these module caches. Browser session restores
   // reuse the worker, so expose the equivalent reset beside the real readers.
   build.onLoad({filter:/\/(seq\/part-storage|app\/interface-usage)\.ts$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    if(args.path.endsWith('/part-storage.ts')){
     if(!contents.includes('if(entries)return entries[kind];'))throw new Error('Movy user parts cache seam changed');
     contents+='\nexport function resetBrowserUserParts():void {entries=null;}\n';
    }else{
     if(!contents.includes('if(initialized)return;initialized=true;'))throw new Error('Movy usage cache seam changed');
     contents+='\nexport function resetBrowserUsage():void {initialized=false;dirty=false;exportPending=false;purgePending=false;lastInput=0;lastSave=0;retryAfter=0;generation=0;status="Local only";held.clear();interactionLog.clear();interactionLog.enabled=true;}\n';
    }
    return {contents,loader:'ts'};
   });
   // The browser's transactional session owner replaces only device Set discovery
   // and disk autosave. Musical UI/controllers, polling, routing and Undo are intact.
   build.onLoad({filter:/\/seq\/set-session\.ts$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    for(const [before,after] of [
     ['export function sessionPhase(): Phase { return phase; }',"export function sessionPhase(): Phase { return globalThis.host_browser_engine_ready?.() ? 'ready' : phase; }"],
     ["export function sessionReady(): boolean { return phase === 'ready'; }","export function sessionReady(): boolean { return globalThis.host_browser_engine_ready?.() === true; }"],
     ['export function sessionTick(): void {','export function sessionTick(): void { if (globalThis.host_browser_engine_ready?.()) return;'],
     ['export function sessionFlush(force = false): void {','export function sessionFlush(force = false): void { if (globalThis.host_browser_engine_ready?.()) return;']
    ]){if(contents.split(before).length!==2)throw new Error('Movy lifecycle seam changed: '+before);contents=contents.replace(before,after);}
    return {contents,loader:'ts'};
   });
   build.onLoad({filter:/\/seq\/ui-state\.ts$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    // The browser envelope already restores and verifies these on a fresh DSP.
    // Do not enqueue a second asynchronous module restore after that swap.
    for(const [before,after] of [
     ['chains: captureChains(chainDoc),','chains: undefined,'],
     ['sends: captureSends(chainDoc),','sends: undefined,'],
     ['const n = restoreChains(o.chains, o.sends);','const n = 0;']
    ]){if(contents.split(before).length!==2)throw new Error('Movy UI state seam changed: '+before);contents=contents.replace(before,after);}
    return {contents,loader:'ts'};
   });
   build.onLoad({filter:/\/track\/host-mode\.ts$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    const before='export function setHostMode(mode: number): void {';
    if(contents.split(before).length!==2)throw new Error('Movy host choice seam changed');
    contents=contents.replace(before,before+' mode = 1; // Browser owns all 16 chains.');
    return {contents,loader:'ts'};
   });
   build.onResolve({filter:/^\/data\/UserData\/schwung\/shared\//},args=>({path:resolve(schwung,'src/shared',args.path.split('/shared/')[1])}));
  }}]});
 await esbuild.build({entryPoints:[resolve(root,'move-surface.mjs')],bundle:true,format:'esm',platform:'browser',
  outfile:resolve(root,'build/move-surface.mjs'),alias:{movy:resolve(source,'src')}});
}
