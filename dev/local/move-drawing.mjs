import {vectorShapes} from './move-vectors.mjs';

/** Record one display in two forms: exact device pixels and scalable shapes. */
export function createMoveDrawing(screen){
 let display=[],revision=0,depth=0,precise=false;
 const targets=new Map();
 const begin=command=>{
  if(!depth){display.push(command);revision++;}
  depth++;return ()=>{depth--;};
 };
 return {
  clear(){screen.fill(0);display=[];targets.clear();revision++;},
  target(slot,bounds){targets.set(slot,{slot,bounds});},
  round(value){return precise?value:Math.round(value);},
  beginVector(kind,...args){
   if(depth){depth++;return ()=>{depth--;};}
   let shapes;
   precise=true;try{shapes=vectorShapes(kind,args);}finally{precise=false;}
   return begin([2,shapes]);
  },
  beginText(left,top,text,color,width,height){return begin([1,left,top,width,height,color,text]);},
  fillRect(left,top,width,height,color){
   if(!depth){
    // A later card/menu repaint covers the controls below it. Label highlights
    // fit within one cell; larger opaque rectangles invalidate intersected cells.
    if(height>8)for(const [slot,{bounds:[x,y,w,h]}]of targets)
     if((width>w||height>h)&&left<x+w&&left+width>x&&top<y+h&&top+height>y)targets.delete(slot);
    // Some modes repaint only a footer each tick. Discard covered text/rects
    // instead of retaining an ever-growing history behind the opaque repaint.
    if(left<=0&&top<=0&&left+width>=128&&top+height>=64)display=[];
    else display=display.filter(([kind,x,y,w,h])=>kind===2||x<left||y<top||x+w>left+width||y+h>top+height);
    display.push([0,left,top,width,height,color]);revision++;
   }
   const startX=Math.min(128,Math.max(0,Math.trunc(left))),endX=Math.max(0,Math.min(128,Math.ceil(left+width)));
   if(endX<=startX)return;
   for(let row=Math.max(0,Math.trunc(top));row<Math.min(64,Math.ceil(top+height));row++)screen.fill(color?255:0,row*128+startX,row*128+endX);
  },
  snapshot:()=>({display,displayRevision:revision,screenTargets:[...targets.values()]})
 };
}
