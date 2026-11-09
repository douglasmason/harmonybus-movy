/** Shared Move / browser view. Rhythm evaluation and timing remain in the engine. */
import {type EuclideanView,euclideanRates} from './comp-generator.js';
import {cachedSetAnimLED} from './led-cache.js';
import {appState} from '../app/state.js';
import {fontPrint} from '../font/index.js';
let previous='';
export function tickEuclidean(view:EuclideanView|null):void {
 const next=view?JSON.stringify(view):'';
 if(next!==previous){previous=next;appState.dirty=true;}
}
export function euclideanStepColors(view:EuclideanView):number[] {
 return Array.from({length:16},(_,index)=>index>=view.steps?0:index===view.cursor?120:(view.mask&(1<<index))!==0?(view.depth>0&&view.accents>0&&!(view.accentMask&(1<<index))?2:127):119);
}
export function paintEuclideanSteps(view:EuclideanView):void {
 euclideanStepColors(view).forEach((color,index)=>cachedSetAnimLED(16+index,color,color,0));
}
export function drawEuclidean(view:EuclideanView):void {
 fill_rect(0,11,128,45,0);
 fontPrint(2,12,`${view.hits}/${view.steps}  ${euclideanRates[view.rate]}  R${view.rotation}`,1);
 for(let index=0;index<view.steps;index++){
  const x=2+index%8*16,y=23+Math.floor(index/8)*13;
  fill_rect(x,y,12,8,1);
  if(!(view.mask&(1<<index)))fill_rect(x+1,y+1,10,6,0);
  else if(view.depth>0&&view.accents>0&&!(view.accentMask&(1<<index))){fill_rect(x+1,y+1,10,6,0);fill_rect(x+3,y+2,6,4,1);}
  if(index===view.cursor)fill_rect(x,y+9,12,2,1);
 }
 fontPrint(2,49,'Tap step: rotate',1);
}
