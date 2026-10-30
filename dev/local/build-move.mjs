/** Bundle the production Movy application and our existing HB/Movy surface. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function buildMove({root,source,schwung,esbuild}){
 await esbuild.build({entryPoints:[resolve(root,'move-runtime.mjs')],bundle:true,format:'esm',platform:'browser',
  outfile:resolve(root,'build/move-runtime.mjs'),alias:{movy:resolve(source,'src')},define:{__MOVY_DEBUG__:'false'},
  plugins:[{name:'browser-move-host',setup(build){
   // Observe the one shared text blitter before it becomes tiny bitmap runs.
   // Keep its original raster path intact for device-faithful display mode.
   build.onLoad({filter:/\/font\/blit\.ts$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    const before='    let cx = x;';
    if(contents.split(before).length!==2||!contents.trimEnd().endsWith('}'))throw new Error('Movy text blitter seam changed');
    contents=contents.replace(before,`    const endText = globalThis.host_browser_begin_text?.(x, y, str, color,
        glyphRunWidth(str, glyphFor, fallbackAdv, gap), glyphFor(72)?.[3] ?? 5);
    try {
${before}`).replace(/\n}\s*$/, '\n    } finally { endText?.(); }\n}\n');
    return {contents,loader:'ts'};
   });
   // Schwung parameter cells use their own shared font families. Observe the
   // same public print/measure pair, keeping every original raster call.
   build.onLoad({filter:/\/param_pages\/font(4x5|5x3|_tamzen6x12|_big_num)\.mjs$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    const suffix=args.path.endsWith('font4x5.mjs')?'4x5':args.path.endsWith('font5x3.mjs')?'5x3':'';
    const print='fontPrint'+suffix,width='fontWidth'+suffix;
    const height=suffix==='4x5'?'FONT4_HEIGHT':suffix==='5x3'?'FONT5_HEIGHT':'HEIGHT';
    const before=`export function ${print}(ctx, x, y, str, color) {`;
    if(contents.split(before).length!==2)throw new Error('Schwung font seam changed: '+args.path);
    contents=contents.replace(before,`function rasterPrint(ctx, x, y, str, color) {`);
    contents+=`\nexport function ${print}(ctx, x, y, str, color) {
 const endText=globalThis.host_browser_begin_text?.(x,y,String(str??''),color,${width}(str),${height});
 try { rasterPrint(ctx,x,y,str,color); } finally { endText?.(); }
}\n`;
    return {contents,loader:'js'};
   });
   // Expose the existing selector for browser session restore. The optional
   // query skips Clips/Settings overlays so their performance owner survives.
   build.onLoad({filter:/\/seq\/router-buttons\.ts$/},async args=>{
    let contents=await readFile(args.path,'utf8');
    for(const [before,after] of [
     ['function selectInputMode(next: number, remember=true): void {','export function selectInputMode(next: number, remember=true): void {'],
     ['export function sessionPlayMode(): number {','export function sessionPlayMode(includeOverlays = true): number {'],
     ['return seqState.sessionMode ? 0 : settingsOpen() ? 7 :','return includeOverlays && seqState.sessionMode ? 0 : includeOverlays && settingsOpen() ? 7 :']
    ]){if(contents.split(before).length!==2)throw new Error('Movy mode selector seam changed: '+before);contents=contents.replace(before,after);}
    return {contents,loader:'ts'};
   });
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
     ['const n = restoreChains(o.chains, o.sends);','const n = 0;'],
     ['function freshHarmonyBusChains() {','export function freshHarmonyBusChains() {'],
     ['const hbFreshCount = restoreChains(freshHarmonyBusChains(), null);','const hbFreshCount = 0;']
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
