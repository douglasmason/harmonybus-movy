/** Fit a complete value into one or two lines using real browser font metrics.
 * Break only at whitespace; shrinking never invents abbreviations or fragments. */
export function fitValueText(value,width,height,measure){
 const text=String(value??'').trim().replace(/\s+/g,' '),candidates=[[text]];
 for(let index=0;index<text.length;index++)if(text[index]===' ')candidates.push([text.slice(0,index),text.slice(index+1)]);
 let best={lines:[text],size:0};
 for(const lines of candidates){
  const size=Math.min(6,height/(lines.length*1.2),width/Math.max(1,...lines.map(measure)));
  if(size>best.size)best={lines,size};
 }
 return best;
}

/** Replay production geometry at screen resolution, or its exact bitmap. */
export function mountMoveDisplay(){
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
  const highResolution=toggle.checked;
  canvas.hidden=highResolution;sharp.toggleAttribute('hidden',!highResolution);
  if(!frame||(revision===frame.displayRevision&&sharpMode===highResolution))return;
  if(highResolution){
   const nodes=[];
   for(const command of frame.display??[]){
    const [kind,x,y,width,height,color,text]=command;
    if(kind===2){for(const shape of command[1]){
     if(!shape.box){nodes.push(node(shape.tag,shape.attributes));continue;}
     const [left,top,span,rows]=shape.box,{lines,size}=fitValueText(shape.text,span,rows,measure);
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
 return {update(next){frame=next;paint();}};
}
