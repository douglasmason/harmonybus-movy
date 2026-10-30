/** Replay the production draw order with scalable text, or its exact bitmap. */
export function mountMoveDisplay(){
 const canvas=document.querySelector('#hero'),context=canvas.getContext('2d'),pixels=context.createImageData(128,64);
 const sharp=document.querySelector('#screen-sharp'),toggle=document.querySelector('#display-sharp');
 const namespace='http://www.w3.org/2000/svg';
 let frame=null,revision=-1,sharpMode=null;
 const node=(name,attributes)=>{
  const element=document.createElementNS(namespace,name);
  for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
 };
 function paint(){
  const highResolution=toggle.checked;
  canvas.hidden=highResolution;sharp.toggleAttribute('hidden',!highResolution);
  if(!frame||(revision===frame.displayRevision&&sharpMode===highResolution))return;
  if(highResolution){
   const nodes=[];
   for(const command of frame.display??[]){
    const [kind,x,y,width,height,color,text]=command;
    if(kind===0)nodes.push(node('rect',{x,y,width,height,fill:color?'white':'black'}));
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
 return {update(next){frame=next;paint();}};
}
