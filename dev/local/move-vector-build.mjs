import {createRequire} from 'node:module';
import {resolve} from 'node:path';

/** Observe shared drawing functions before rasterization, retaining their
 * original bodies for the exact bitmap. AST positions keep hooks out of
 * comments, overload signatures, and similarly named helpers. */
export function createVectorAdapter(source){
 const ts=createRequire(resolve(source,'package.json'))('typescript');
 const hook=(name,kind,args,start=null,end=null)=>({name,kind,args,start,end});
 const rules={
  '/renderer/primitives.ts':[
   hook('drawLine','line','x0,y0,x1,y1'),
   hook('drawDottedV','line','x,y0,x,y1,1,.4'),
   hook('drawDottedH','line','x0,y,x1,y,1,.4'),
   hook('drawDottedRect','dottedRect','x,y,w,h'),
   hook('hatchRect','shade','x,y,w,h,color,.35')],
  '/renderer/knob.ts':[
   hook('drawEnumSquare','enum','kx+(KW-28)/2,ky,28,KW,options ? (options[enumIndex] ?? String(enumIndex)) : String(enumIndex)'),
   hook('drawCircleBorder','circle','cx,cy,r'),
   hook('drawCircle','ellipse','kx+7.5,ky+7.5,3.5,3.5,1,solid'),
   hook('drawDashedFrame','dottedRect','kx,ky,KW,KW'),
   hook('drawArcKnob','knob','kx+7,ky+7,7,normVal,210,300,0,360,0,1'),
   hook('drawSwitch','switch','kx-5,ky+2,26,11,kx-5+(on?16:1),ky+3,9,9,on,5'),
   hook('drawFader','fader','cx,top,bot,normVal,false', 'for (let y = top;'),
   hook('drawEnvStage','envStage','x,top,bot,w,len,stage','const dottedV =')],
  '/renderer/label.ts':[
   hook('drawLabelCell','label','col*CELL_W,lblY,CELL_W,LBL_H,(pvm.trigger||!pvm.touched)?(pvm.fullName||pvm.shortName):pvm.displayValue,!!pvm.touched,!!pvm.modulated,!!pvm.automated')],
  '/renderer/pan-dial.ts':[
   hook('drawPanDial','pan','cellX+Math.floor(CELL_W/2),ky+8,normVal,PAN_HALF')],
  '/param_pages/render_page.mjs':[
   hook('line','line','x0,y0,x1,y1,color'),hook('circle','circle','cx,cy,r,color'),
   hook('fillDithered','shade','x,y,w,h,1,Array.from({length:16},(_,i)=>pattern(x+i%4,y+Math.floor(i/4))?1:0).reduce((a,b)=>a+b,0)/16'),
   hook('dashedVRule','line','x,y,x,y+h-1,1,.4'),hook('notchCorners','corners','x,y,w,h')],
  '/param_pages/render_page_movy.mjs':[
   hook('drawLabelCell','label','cellLeft(g,col),lblY,g.cellW,LBL_H,showValue?browserValue:browserLabel,!!inverted,!!modulated,!!automated'),
   hook('drawEnumSquare','enum','kx,ky,ENUM_W,BOX_H,browserText,!!readOnly'),
   hook('drawLine','line','x0,y0,x1,y1'),
   hook('drawArcKnob','knob','kx+KNOB_R,ky+KNOB_R,KNOB_R,normVal,KNOB_START_DEG,KNOB_SWEEP_DEG,ARC_START_DEG,ARC_SWEEP_DEG,POINTER_INNER,POINTER_OUTER'),
   hook('ellipseOutline','ellipse','cx,cy,rx,ry,color,false,bottomOnly'),
   hook('ellipseFill','ellipse','cx,cy,rx,ry,color,true')],
  '/param_pages/viz_draw.mjs':[
   hook('dottedV','line','x,y0,x,y1,1,.4'),hook('dottedH','line','x0,y,x1,y,1,.4'),
   hook('drawLine','line','x0,y0,x1,y1,color'),
   hook('drawPolyline','polyline','points,color'),
   hook('drawColumnCurve','curve','x0,xEnd-1,yAt,color,skipY'),
   hook('drawStepCurve','curve','x0,xEnd-1,yAt,color'),
   hook('fillCurveMass','mass','x0,xEnd-1,yAt,baseY,topY,botY,mirrorAt'),
   hook('drawWaveCell','curve','x,x+w-1,yAt', 'let py = yAt(x);'),
   hook('drawSample','waveform','x0,topY,w,botY-topY+1,pts??[],scale','fillCurveMass(ctx, x0, x0 + w, crestAt','const colOf ='),
   hook('drawSwitch','switch','x,y,w,h,sx,sy,SLUG_W,SLUG_H,on', 'if (on) {'),
   hook('drawFader','fader','cx,top,bot,normVal,true','const y = Math.round(bot - exact);','if (baseValues) {')],
  '/renderer/lfo-wave.ts':[
   hook('drawWave','closedWave','x,x+w-1,yAt,colour,dotted?.4:1','const firstY ='),
   hook('drawLfoWave','curve','x0,xEnd-1,yAt','let prevX =','if (g.retrigger) {')],
  '/renderer/filter-curve.ts':[
   hook('drawFilterCurve','curve','x0,xEnd-1,yAt,1,(value)=>value>=botY','let prevX =')],
  '/renderer/cut-curve.ts':[
   hook('drawCutCurve','curve','leftX,rightX,yAt,1,(value)=>value>=baseY','let prevX =')],
  '/renderer/eq-curve.ts':[
   hook('drawEqCurve','curve','x0,xEnd-1,yAt','let py =')],
  '/renderer/wav-form.ts':[
   hook('drawWavForm','waveform','x0,topY,w,botY-topY+1,pts,viz.gain','for (let i = 0;','const colOf =')],
  '/renderer/trail-curves.ts':[
   hook('drawTrailCurves','curve','x,x+w-1,(px)=>y+(peak-trailFade((px-x)/(w-1)*(settings.curve===\'exponential\'?4:1),1,settings.curve,settings.exponent,floor,peak))/Math.max(.000001,peak-floor)*(h-1)','let previous=')]
 };
 return {filter:/\/(?:renderer\/(?:primitives|knob|pan-dial|lfo-wave|filter-curve|cut-curve|eq-curve|wav-form|trail-curves)\.ts|param_pages\/(?:render_page|viz_draw)\.mjs)$/,
  transform(contents,path){
   const key=Object.keys(rules).find(suffix=>path.endsWith(suffix));if(!key)return contents;
   if(key==='/param_pages/render_page_movy.mjs'){
    // The device may use short_options. Carry the already-resolved full value
    // to the browser observation without changing the device's text argument.
    for(const [before,after] of [
     ['export function drawEnumSquare(ctx, kx, ky, text, anim, nowMs, animKey, raw, readOnly) {',
      'export function drawEnumSquare(ctx, kx, ky, text, anim, nowMs, animKey, raw, readOnly, browserText = text) {'],
     ['anim, nowMs, animKey, shown, !!meta.readOnly);',
      'anim, nowMs, animKey, shown, !!meta.readOnly, displayValue(shown, meta));'],
     ['export function drawLabelCell(ctx, g, col, lblY, label, displayValue, showValue, inverted, modulated, automated = false) {',
      'export function drawLabelCell(ctx, g, col, lblY, label, displayValue, showValue, inverted, modulated, automated = false, browserLabel = label, browserValue = displayValue) {'],
     ['automated ? !!automated(key) : false);',
      'automated ? !!automated(key) : false, meta.label || meta.key, (cellText === null || cellText === undefined) ? displayValue(raw, meta) : String(cellText));']
    ]){if(contents.split(before).length!==2)throw new Error('Enum value seam changed: '+before);contents=contents.replace(before,after);}
   }
   const tree=ts.createSourceFile(path,contents,ts.ScriptTarget.Latest,true),edits=[];
   for(const {name,kind,args,start,end}of rules[key]){
    const matches=tree.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(matches.length!==1||!matches[0].body)throw new Error('Vector drawing seam changed: '+key+' '+name);
    const body=matches[0].body,bodyStart=body.getStart(tree)+1,bodyEnd=body.end-1;
    const position=anchor=>{
     const found=contents.indexOf(anchor,bodyStart);
     if(found<0||found>=bodyEnd||contents.indexOf(anchor,found+1)<bodyEnd&&contents.indexOf(anchor,found+1)>=0)throw new Error('Vector drawing anchor changed: '+name+' '+anchor);
     return found;
    };
    const begin=start?position(start):bodyStart,finish=end?position(end):bodyEnd;
    edits.push([begin,`\nconst endBrowserVector=globalThis.host_browser_begin_vector?.('${kind}',${args});\ntry {\n`]);
    edits.push([finish,'\n} finally { endBrowserVector?.(); }\n']);
   }
   for(const [at,text]of edits.sort((a,b)=>b[0]-a[0]))contents=contents.slice(0,at)+text+contents.slice(at);
   // Callback-defined curves keep their original rounding for the device.
   // Only their synchronous vector sampling asks for fractional coordinates.
   return contents.replaceAll('Math.round(', 'browserRound(')+'\nfunction browserRound(value){return globalThis.host_browser_round?.(value) ?? Math.round(value);}\n';
  }};
}
