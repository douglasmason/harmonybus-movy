import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createVectorAdapter} from './move-vector-build.mjs';
import {createMoveDrawing} from './move-drawing.mjs';

test('production graphics retain exact device pixels while emitting scalable geometry',async()=>{
 const source=process.env.MOVY_SOURCE;assert(source,'MOVY_SOURCE must identify the prepared production UI');
 const esbuild=createRequire(resolve(source,'package.json'))('esbuild'),vectors=createVectorAdapter(source);
 const directory=await mkdtemp(resolve(tmpdir(),'movy-drawing-'));
 const shared=resolve(source,'src/vendor/schwung/shared/param_pages');
 const input=[['page',shared+'/render_page_movy.mjs'],['viz',shared+'/viz_draw.mjs'],['meta',shared+'/param_meta.mjs'],
  ['primitives',resolve(source,'src/renderer/primitives.ts')],['pan',resolve(source,'src/renderer/pan-dial.ts')],['wave',resolve(source,'src/renderer/lfo-wave.ts')],
  ['filter',resolve(source,'src/renderer/filter-curve.ts')],['eq',resolve(source,'src/renderer/eq-curve.ts')],['sample',resolve(source,'src/renderer/wav-form.ts')]]
  .map(([name,path])=>`export * as ${name} from ${JSON.stringify(path)};`).join('\n');
 try{
  const modules=[];
  for(const adapted of [false,true]){
   const outfile=resolve(directory,adapted?'vector.mjs':'native.mjs');
   await esbuild.build({stdin:{contents:input,resolveDir:source},outfile,bundle:true,platform:'node',format:'esm',plugins:adapted?[{name:'vectors',setup(build){
    build.onLoad({filter:/\/(?:renderer\/.*\.ts|param_pages\/.*\.mjs)$/},async args=>({contents:vectors.transform(await readFile(args.path,'utf8'),args.path),loader:args.path.endsWith('.ts')?'ts':'js'}));
   }}]:[]});
   modules.push(await import(pathToFileURL(outfile).href));
  }
  const cases=[
   ['arc', (ui,ctx)=>ui.page.drawArcKnob(ctx,3,12,.371)],
   ['switch on',(ui,ctx,meta)=>ui.viz.drawSwitch(ctx,{x:0,y:10,w:32,h:16},'on',{on:'On'},meta)],
   ['switch off',(ui,ctx,meta)=>ui.viz.drawSwitch(ctx,{x:0,y:10,w:32,h:16},'on',{on:'Off'},meta)],
   ['envelope',(ui,ctx,meta)=>ui.viz.drawEnvelope(ctx,{x:0,y:10,w:128,h:16},{attack:'a',decay:'d',sustain:'s',release:'r'},{a:.2,d:.4,s:.6,r:.8},meta)],
   ['filter',(ui,ctx,meta)=>ui.viz.drawFilter(ctx,{x:0,y:10,w:64,h:16},{cutoff:'a',resonance:'r'},{a:.61,r:.43},meta)],
   ['wave',(ui,ctx,meta)=>ui.viz.drawWaveform(ctx,{x:0,y:10,w:32,h:16},'shape',{shape:'Sine'},meta)],
   ['fader',(ui,ctx,meta)=>ui.viz.drawFader(ctx,{x:0,y:10,w:32,h:16},'a',{a:.417},meta,{a:.3})],
   ['native lines',ui=>{ui.primitives.drawLine(2,3,25,19);ui.primitives.hatchRect(30,3,15,12,1);}],
   ['pan left',ui=>ui.pan.drawPanDial(0,10,.173)],
   ['pan center',ui=>ui.pan.drawPanDial(0,10,.5)],
   ['pan right',ui=>ui.pan.drawPanDial(0,10,.827)],
   ['native sine',ui=>ui.wave.drawWave(2,10,30,15,0,1,1)],
   ['native square',ui=>ui.wave.drawWave(2,10,30,15,3,1,1)],
   ['native filter',ui=>ui.filter.drawFilterCurve(10,{startCol:0,mode:'lp',cutoff:.42,resonance:.2,slope:0})],
   ['native EQ',ui=>ui.eq.drawEqCurve(10,{startCol:0,cellCount:2,bands:['low','high'],gains:[.4,-.7]})],
   ['sample envelope',ui=>ui.sample.drawWavForm(10,{startCol:0,cellCount:2,points:Array.from({length:64},(_,i)=>Math.abs(Math.sin(i*.21))),gain:.8,position:.31,loopStart:.1,loopEnd:.8,spray:.2})]
  ];
  let sawGrey=false;
  for(const [name,draw]of cases){
   const images=[],commands=[];
   for(const ui of modules){
    const pixels=new Uint8Array(8192),drawing=createMoveDrawing(pixels);
    Object.assign(globalThis,{fill_rect:drawing.fillRect,host_browser_begin_vector:drawing.beginVector,host_browser_round:drawing.round});
    const metadata=ui.meta.buildMetaIndex({chainParams:[...['a','d','s','r'].map(key=>({key,type:'float',min:0,max:1})),{key:'on',type:'enum',options:['Off','On']},{key:'shape',type:'enum',options:['Sine','Square']}]});
    draw(ui,{fillRect:drawing.fillRect},metadata);
    images.push(pixels);commands.push(drawing.snapshot().display);
   }
   assert.deepEqual(images[1],images[0],name+' device bitmap changed');
   assert(commands[1].some(command=>command[0]===2),name+' has no vector geometry');
   assert(!/NaN|Infinity/.test(JSON.stringify(commands[1])),name+' invalid coordinates');
   sawGrey ||= commands[1].some(command=>command[0]===2&&command[1].some(shape=>shape.attributes.opacity>0&&shape.attributes.opacity<1));
  }
  assert(sawGrey,'dither coverage should become greyscale');
  const drawing=createMoveDrawing(new Uint8Array(8192));
  const end=drawing.beginVector('circle',10,10,5);drawing.fillRect(5,5,1,1,1);end();
  drawing.fillRect(0,0,128,8,0);const endText=drawing.beginText(0,0,'Overlay',1,20,5);endText();
  assert.deepEqual(drawing.snapshot().display.map(command=>command[0]),[2,0,1],'overlay draw order');
  assert.throws(()=>drawing.beginVector('curve',0,2,()=>{throw new Error('sample');}),/sample/);
  assert.equal(drawing.round(1.2),1,'a failed sampler must restore device rounding');
 }finally{delete globalThis.fill_rect;delete globalThis.host_browser_begin_vector;delete globalThis.host_browser_round;await rm(directory,{recursive:true,force:true});}
});
