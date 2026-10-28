/** Bundle the production Movy application and Schwung's existing Move drawing. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

function between(text,start,end){
 const begin=text.indexOf(start),finish=text.indexOf(end,begin+start.length);
 if(begin<0||finish<0)throw new Error('Move Mirror source seam changed: '+start);
 return text.slice(begin,finish);
}

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
 const mirror=await readFile(resolve(schwung,'schwung-manager/static/mirror.html'),'utf8');
 const drawing=between(mirror,"'use strict';",'/* ---------------- the connection')+
  between(mirror,'/* ---------------- surface accessors','/* ---------------- the press log');
 await writeFile(resolve(root,'build/move-mirror.mjs'),
  '// Extracted from pinned Schwung Move Mirror; see Move-Mirror-LICENSE.txt.\n'+drawing+`
let dirty=true;
sizeDevice();
export function updateMirror(frame){
 surf=Uint8Array.from(frame.surface);surfView=new DataView(surf.buffer);
 const pixels=frame.screen;
 for(let index=0;index<8192;index++){
  const offset=index*4;img.data[offset]=img.data[offset+1]=img.data[offset+2]=pixels[index];img.data[offset+3]=255;
 }
 hctx.putImageData(img,0,0);dctx.setTransform(dpr,0,0,dpr,0,0);drawDevice(dctx,performance.now());
}
export const controls=[];
const control=(name,type,index,x,y,width,height,extra={})=>controls.push({name,type,index,x,y,width,height,...extra});
for(let index=0;index<8;index++)control('Knob '+(index+1),'encoder',71+index,padCx(index)-22,TOP_Y+TOP_H/2-22,44,44,{touch:index});
control('Volume','encoder',79,FUNC_X+COL_F*.75-25,TOP_Y+TOP_H/2-25,50,50,{touch:8});
const wheelX=P+COL_L/2,wheelY=(rowCy(0)+rowCy(1))/2;
control('Jog','encoder',14,wheelX-36,wheelY-36,72,72,{touch:9,click:3});
control('Back','cc',51,wheelX-40,rowCy(2)-18,36,36);
control('Note / Session','cc',50,wheelX+4,rowCy(2)-18,36,36);
for(let row=0;row<4;row++)control('Track '+(row+1),'cc',43-row,P+COL_L+GAP,rowCy(row)-PAD_CH/2,COL_T,PAD_CH);
for(let row=0;row<4;row++)for(let column=0;column<8;column++){
 const note=68+(3-row)*8+column;
 control('Pad '+(note-67),'note',note,PAD_X+column*(PAD_CW+PAD_GAP),PADS_Y+row*(PAD_CH+PAD_GAP),PAD_CW,PAD_CH);
}
for(let index=0;index<FUNCS.length;index++){
 const [name,cc]=FUNCS[index],cx=FUNC_X+COL_F*(index%2?.75:.25),cy=rowCy(Math.floor(index/2));
 control(name[0].toUpperCase()+name.slice(1),'cc',cc,cx-20,cy-20,40,40);
}
control('Play / Stop','cc',85,wheelX-40,STEP_Y-18,36,36);
control('Record','cc',86,wheelX+4,STEP_Y-18,36,36);
for(let index=0;index<16;index++)control('Step '+(index+1),'note',16+index,PAD_X+PAD_W/16*index,STEP_Y-14,PAD_W/16,28);
for(const [name,cc,dx,dy] of NAV)control(name[0].toUpperCase()+name.slice(1),'cc',cc,FUNC_X+COL_F/2+dx*26-12,STEP_Y+4+dy*14-12,24,24);
export const dimensions={width:W,height:H};
`);
 const license=await readFile(resolve(schwung,'LICENSE'),'utf8');
 const thirdParty=await readFile(resolve(schwung,'THIRD_PARTY_LICENSES.md'),'utf8');
 await writeFile(resolve(root,'build/Move-Mirror-LICENSE.txt'),license+'\n'+thirdParty);
}
