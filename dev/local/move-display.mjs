/** Fit a complete value into one or two lines using real browser font metrics.
 * Break only at whitespace; shrinking never invents abbreviations or fragments. */
export function fitValueText(value,width,height,measure,maxSize=6){
 const text=String(value??'').trim().replace(/\s+/g,' '),candidates=[[text]];
 for(let index=0;index<text.length;index++)if(text[index]===' ')candidates.push([text.slice(0,index),text.slice(index+1)]);
 let best={lines:[text],size:0};
 for(const lines of candidates){
  const size=Math.min(maxSize,height/(lines.length*1.2),width/Math.max(1,...lines.map(measure)));
  if(size>best.size)best={lines,size};
 }
 return best;
}

/** Replay production geometry at screen resolution, or its exact bitmap. */
export function mountMoveDisplay(inputs){
 const view=mountDisplayView(inputs);
 const canvas=document.querySelector('#hero'),context=canvas.getContext('2d'),pixels=context.createImageData(128,64);
 const sharp=document.querySelector('#screen-sharp'),toggle=document.querySelector('#display-sharp');
 const namespace='http://www.w3.org/2000/svg';
 let frame=null,revision=-1,sharpMode=null;
 const fontFamily='Arial, Helvetica, sans-serif';
 context.font=`500 100px ${fontFamily}`;
 const measure=text=>context.measureText(text).width/100;
 const node=(name,attributes)=>{
  const element=document.createElementNS(namespace,name);
  for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
 };
 function paint(){
  const highResolution=toggle.checked&&!frame?.device;
  toggle.disabled=!!frame?.device;
  canvas.hidden=highResolution;sharp.toggleAttribute('hidden',!highResolution);
  if(!frame||(revision===frame.displayRevision&&sharpMode===highResolution))return;
  if(highResolution){
   const nodes=[];
   for(const command of frame.display??[]){
    const [kind,x,y,width,height,color,text]=command;
    if(kind===2){for(const shape of command[1]){
     if(!shape.box){nodes.push(node(shape.tag,shape.attributes));continue;}
     const [left,top,span,rows]=shape.box,{lines,size}=fitValueText(shape.text,span,rows,measure,shape.maxSize);
     const label=node('text',{...shape.attributes,'font-family':fontFamily,'font-weight':500,'font-size':size,'text-anchor':'middle'});
     const title=node('title',{});title.textContent=shape.text;label.append(title);
     for(const [index,line]of lines.entries()){
      const run=node('tspan',{x:left+span/2,y:top+rows/2+(index-(lines.length-1)/2)*size*1.2+size*.35});
      run.textContent=line;label.append(run);
     }
     nodes.push(label);
    }}
    else if(kind===0)nodes.push(node('rect',{x,y,width,height,fill:color?'white':'black'}));
    else if(width>0&&text){
     // Cap height follows the native font; its measured advance keeps text
     // inside the same cells. All backgrounds/overlays retain their draw order.
     const label=node('text',{x,y:y+height,fill:color?'white':'black','font-size':height/0.72,
      'font-family':'Arial, Helvetica, sans-serif','font-weight':500,textLength:width,lengthAdjust:'spacingAndGlyphs'});
     label.textContent=text;nodes.push(label);
    }
   }
   sharp.replaceChildren(...nodes);
  }else{
   for(let index=0;index<8192;index++){
    const offset=index*4;pixels.data[offset]=pixels.data[offset+1]=pixels.data[offset+2]=frame.screen[index];pixels.data[offset+3]=255;
   }
   context.putImageData(pixels,0,0);
  }
  revision=frame.displayRevision;sharpMode=highResolution;
 }
 toggle.addEventListener('change',paint);
 return {openComponent:view.openComponent,update(next){view.update();if(frame?.device!==next.device)revision=-1;frame=next;paint();}};
}

/** Reuse the live controls in a modal editing view; do not remount the engine. */
function mountDisplayView(inputs){
 const workspace=document.querySelector('main'),row=document.querySelector('.display-row'),expand=document.querySelector('#display-expand');
 const home=document.createComment('Movy workspace position');workspace.before(home);
 const playback=document.querySelector('.playback-controls');
 const playbackHome=document.createComment('Movy playback position');playback.before(playbackHome);
 const dialog=document.createElement('dialog');dialog.id='display-dialog';
 dialog.setAttribute('aria-label','Enlarged Movy display');
 const header=document.createElement('div');header.className='display-dialog-header';
 const title=document.createElement('strong');title.textContent='Movy display';
 const titleGroup=document.createElement('div');titleGroup.className='display-dialog-title';
 const padsJump=document.createElement('button');padsJump.type='button';padsJump.textContent='Pads & steps';
 const sessions=document.querySelector('#sessions');
 const filesJump=document.createElement('button');filesJump.type='button';filesJump.textContent='Files & audio';filesJump.disabled=true;
 filesJump.onclick=()=>{
  if(inputs.isHeld()||sessions.hidden)return;
  sessions.open=true;sessions.scrollIntoView({block:'start'});
  sessions.querySelector('summary').focus({preventScroll:true});
 };
 const surface=document.querySelector('#surface');
 surface.tabIndex=-1;
 const performanceHeading=document.createElement('div');performanceHeading.className='display-performance-heading';
 const performanceTitle=document.createElement('strong');performanceTitle.textContent='Playing pads & steps';
 const displayJump=document.createElement('button');displayJump.type='button';displayJump.textContent='Back to display';
 performanceHeading.append(performanceTitle,displayJump);surface.prepend(performanceHeading);
 padsJump.onclick=()=>{if(inputs.isHeld())return;surface.scrollIntoView({block:'start'});surface.focus({preventScroll:true});};
 displayJump.onclick=()=>{if(inputs.isHeld())return;row.scrollIntoView({block:'start'});document.querySelector('#play-mode').focus({preventScroll:true});};
 const close=document.createElement('button');close.type='button';close.textContent='Close large display';
 let returnFocus=expand;
 titleGroup.append(title,padsJump,filesJump);header.append(titleGroup,close);dialog.append(header);document.body.append(dialog);
 function restore(){
  if(inputs.isHeld())inputs.release();
  home.after(workspace);playbackHome.after(playback);expand.hidden=false;expand.setAttribute('aria-expanded','false');
  document.body.classList.remove('display-expanded');
  const target=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:document.querySelector('#workspace-options summary');
  target.focus({preventScroll:true});
 }
 function openComponent(panel,trigger=expand){
  // Reparenting a captured control could interrupt its original release.
  if(inputs.isHeld()||dialog.open||panel?.hidden)return;
  returnFocus=trigger;
  header.append(playback);dialog.append(workspace);expand.hidden=true;expand.setAttribute('aria-expanded','true');
  document.body.classList.add('display-expanded');dialog.showModal();
  if(panel){panel.tabIndex=-1;panel.scrollIntoView({block:'start'});panel.focus({preventScroll:true});}
  else close.focus();
 }
 expand.onclick=()=>openComponent();
 close.onclick=()=>dialog.close();
 dialog.addEventListener('close',restore);
 // Disabling Enable audio during startup can move focus to body. Handle an
 // idle Escape before the global release handler even in that focus state;
 // leave its native default action intact so the modal still closes.
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&dialog.open&&!inputs.isHeld())event.stopPropagation();
 },true);
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Tab'){
   const focusable=[...dialog.querySelectorAll('button,select,input,summary,[tabindex]')]
    .filter(element=>{
     // Closed details can retain layout boxes for their hidden descendants.
     const closed=element.closest('details:not([open])');
     return !element.disabled&&element.tabIndex>=0&&element.getClientRects().length&&
      (!closed||element===closed.querySelector('summary'));
    });
   const first=focusable[0],last=focusable.at(-1);
   if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}
  }
 });
 // The shared input handler cancels held gestures on Escape. Native dialog
 // cancellation closes this view; the modal keeps background controls inert.
 return {openComponent,update(){filesJump.disabled=sessions.hidden;padsJump.disabled=surface.hidden;displayJump.disabled=row.hidden;}};
}
