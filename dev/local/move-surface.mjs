/** The existing HB/Movy grid surface, connected to production framebuffer/LEDs. */
import {PAD_PALETTE} from 'movy/keyboard/pad-palette.ts';

export const controls=[];
const add=(group,name,type,index,extra={})=>controls.push({group,name,type,index,...extra});
for(let index=0;index<8;index++)add('knobs','Knob '+(index+1),'encoder',71+index,{touch:index});
add('navigation','Jog','encoder',14,{touch:9,click:3});
add('navigation','Volume','encoder',79,{touch:8});
for(const [name,index] of [['Back',51],['Note / Session',50],['Left',62],['Right',63],['Down',54],['Up',55]])add('navigation',name,'cc',index,{white:true});
for(let row=0;row<4;row++)add('tracks','Track '+(row+1),'cc',43-row);
// Device row zero is the bottom; keep the production pad addressing intact.
for(let row=3;row>=0;row--)for(let column=0;column<8;column++)add('pads','Pad '+(row*8+column+1),'note',68+row*8+column);
for(const [name,index] of [['Capture',52],['Sample',118],['Loop',58],['Mute',88],['Delete',119],['Copy',60],['Undo',56],['Shift',49]])add('functions',name,'cc',index,{white:index!==118});
for(let index=0;index<16;index++)add('steps','Step '+(index+1),'note',16+index);
add('transport','Play / Stop','cc',85);add('transport','Record','cc',86);

export function mountMoveSurface(){
 const canvas=document.querySelector('#hero'),context=canvas.getContext('2d'),pixels=context.createImageData(128,64);
 const buttons=controls.map(control=>{
  const button=document.querySelector(`.control[data-kind="${control.type}"][data-index="${control.index}"]`);
  return {control,button,label:button.querySelector('.control-label'),note:button.querySelector('.pad-note')};
 });
 const rowHeadings=[...document.querySelectorAll('.pad-row-label')];
 const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 let frame=null,lastFrame=null,tempo=120,animation=null;
 function paint(now){
  animation=null;if(!frame||document.hidden)return;
  if(frame!==lastFrame){
   for(let index=0;index<8192;index++){
    const offset=index*4;pixels.data[offset]=pixels.data[offset+1]=pixels.data[offset+2]=frame.screen[index];pixels.data[offset+3]=255;
   }
   context.putImageData(pixels,0,0);
  for(const heading of rowHeadings){
   const row=Number(heading.dataset.row),label=frame.padLabels?.rows[row];
   text(heading,label?`${label.owner} · ${label.kind}${label.operation?' · '+label.operation:''}`:`Pads ${row*8+1}–${row*8+8}`);
  }
  for(const {control,button,label:primary,note}of buttons){
   if(control.group==='pads'){
    const label=frame.padLabels?.pads[control.index-68];
    text(primary,label?.primary??String(control.index-67));text(note,label?.secondary??'');
    const title=label?`${control.name} · ${label.description}`:control.name;
    if(button.title!==title){button.title=title;button.setAttribute('aria-description',label?.description??'');}
   }
   if(control.group==='tracks'){
    const name='Track '+(Math.floor(frame.track/4)*4+44-control.index);
    if(button.getAttribute('aria-label')!==name){button.setAttribute('aria-label',name);button.title=name;button.querySelector('.control-label').textContent=name;}
   }
  }
   lastFrame=frame;
  }
  const surface=frame.surface;let animating=false;
  for(const {control,button}of buttons){
   const kind=control.type==='note'?0:1,index=control.index,offset=536+(kind*128+index)*4;
   const value=surface[(kind?280:24)+index],effect=surface[(kind?408:152)+index];
   let color=surface[offset+3]?surface.slice(offset,offset+3):effect===255||!value?[0,0,0]:control.white?[value*2,value*2,value*2]:(PAD_PALETTE[value]??[0,0,0]);
   // Firmware animation channels: 6–10 pulse, 11–14 blink; 15 is steady.
   if(!surface[offset+3]&&effect>=6&&effect<=14&&value){
    const period=(60000/tempo)*[1/3,.5,1,2,4][(effect-6)%5],phase=(now%period)/period;
    const level=effect>=11?(phase<.5?1:0):.3+.7*(.5+.5*Math.cos(phase*Math.PI*2));
    color=color.map(channel=>Math.round(channel*level));animating=true;
   }
   const bright=color.reduce((sum,channel)=>sum+channel,0),rgb=`rgb(${color.join(',')})`;
   button.style.setProperty('--led',bright?rgb:'#34453d');button.dataset.lit=String(bright>0);
   if(control.group==='pads'||control.group==='steps'){
    button.style.backgroundColor=bright?rgb:'#202b25';button.style.color=bright>400?'#101713':'#edf5ee';
   }
  }
  if(animating)animation=requestAnimationFrame(paint);
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&frame&&animation===null)animation=requestAnimationFrame(paint);});
 return {update(next,bpm){frame=next;if(Number.isFinite(bpm)&&bpm>0)tempo=bpm;if(animation===null)animation=requestAnimationFrame(paint);}};
}
