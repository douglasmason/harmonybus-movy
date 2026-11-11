/** Shared spatial display model. Existing trail curves own fading, never notes. */
import {trailFade,type TrailSettings} from './trail-history.js';
export type CloudPoint={x:number;y:number;pressure:number;age:number};
export type CloudSnapshot={contacts:CloudPoint[];trails:CloudPoint[];grains:CloudPoint[]};
export const emptyCloud=():CloudSnapshot=>({contacts:[],trails:[],grains:[]});
/** The same involution maps physical input to musical axes and back to display. */
export function cloudPosition<Point extends {x:number;y:number}>(point:Point,flipped=false):Point {return flipped?{...point,x:point.y,y:point.x}:point;}
export function readCloud(raw:string):CloudSnapshot|null {
 const fields=raw.split('|');if(fields.length!==4||!['cf1','cf2'].includes(fields[0]))return null;
 const maximum=fields[0]==='cf2'?16383:127;
 const groups=fields.slice(1).map((field,index)=>field?field.split(';').map(record=>record.split(',').map(Number)):[]);
 if(groups.some((group,index)=>group.length>(index===0?16:256)||group.some(point=>point.length!==(index===0?3:4)||point.some(value=>!Number.isFinite(value))||point.slice(0,2).some(value=>value<0||value>maximum)||point[2]<0||point[2]>127||(point[3]??0)<0)))return null;
 const points=groups.map(group=>group.map(([x,y,pressure,age=0])=>({x:x/maximum,y:y/maximum,pressure:pressure/127,age:age/4})));
 return {contacts:points[0],trails:points[1],grains:points[2]};
}
export {cloudPointer,createCloudMpeInput} from './expression-input.js';
export function cloudFade(point:CloudPoint,settings:TrailSettings):number {
 if(point.age>=4)return 0;
 return trailFade(point.age,settings.decayBeats,settings.curve,settings.exponent,settings.floor,settings.peak)*settings.strength*point.pressure;
}
/** Wrap preserves overshoot on either side; a bounded cursor stops at the edge. */
export function cloudCoordinate(value:number,wrap:boolean,maximum=127):number {return wrap?((value%(maximum+1))+(maximum+1))%(maximum+1):Math.max(0,Math.min(maximum,value));}
export function cloudCells(snapshot:CloudSnapshot,width:number,height:number,settings:TrailSettings,flipped=false):number[] {
 const colors=Array(width*height).fill(0),strength=Array(width*height).fill(0),age=Array(width*height).fill(Infinity);
 const cell=(point:CloudPoint)=>{const projected=cloudPosition(point,flipped);return Math.round(projected.y*(height-1))*width+Math.round(projected.x*(width-1));};
 for(const point of [...snapshot.trails,...snapshot.grains]){
  const projected=cloudPosition(point,flipped),horizontal=projected.x*(width-1),vertical=projected.y*(height-1);
  const left=Math.floor(horizontal),bottom=Math.floor(vertical),fade=cloudFade(point,settings);
  // Four neighboring cells share a deposit. Max blending prevents a held cloud
  // or repeated heartbeats from making the same position artificially brighter.
  for(let row=bottom;row<=bottom+1&&row<height;row++)for(let column=left;column<=left+1&&column<width;column++){
   const index=row*width+column,level=fade*(1-Math.abs(horizontal-column))*(1-Math.abs(vertical-row));
   // Ignore sub-visible energy, including 7-bit rounding at physical pad centers.
   if(level<1/32||level<strength[index]||level===strength[index]&&point.age>=age[index])continue;strength[index]=level;age[index]=point.age;
   colors[index]=point.age<1?(level>.55?16:level>.2?95:96):(level>.55?125:level>.2?99:100);
  }
 }
 for(const point of snapshot.contacts)colors[cell(point)]=126;
 return colors;
}
