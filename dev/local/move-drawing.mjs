import {vectorShapes} from './move-vectors.mjs';

/** Record one display in two forms: exact device pixels and scalable shapes. */
export function createMoveDrawing(screen){
 let display=[],revision=0,depth=0,precise=false;
 const begin=command=>{
  if(!depth){display.push(command);revision++;}
  depth++;return ()=>{depth--;};
 };
 return {
  clear(){screen.fill(0);display=[];revision++;},
  round(value){return precise?value:Math.round(value);},
  beginVector(kind,...args){
   if(depth){depth++;return ()=>{depth--;};}
   let shapes;
   precise=true;try{shapes=vectorShapes(kind,args);}finally{precise=false;}
   return begin([2,shapes]);
  },
  beginText(left,top,text,color,width,height){return begin([1,left,top,width,height,color,text]);},
  fillRect(left,top,width,height,color){
   if(!depth){display.push([0,left,top,width,height,color]);revision++;}
   const startX=Math.min(128,Math.max(0,Math.trunc(left))),endX=Math.max(0,Math.min(128,Math.ceil(left+width)));
   if(endX<=startX)return;
   for(let row=Math.max(0,Math.trunc(top));row<Math.min(64,Math.ceil(top+height));row++)screen.fill(color?255:0,row*128+startX,row*128+endX);
  },
  snapshot:()=>({display,displayRevision:revision})
 };
}
