/** Presentation preferences only. Never part of an engine or musical session. */
export const defaultAppearance=Object.freeze({hue:145,saturation:55,brightness:12});
export function appearance(value){
 const bounded=(key,min,max)=>Number.isFinite(value?.[key])?Math.max(min,Math.min(max,value[key])):defaultAppearance[key];
 return {hue:bounded('hue',0,360)%360,saturation:bounded('saturation',0,100),brightness:bounded('brightness',0,100)};
}
export function hsl(hue,saturation,lightness){
 const chroma=(1-Math.abs(2*lightness-1))*saturation,sector=hue/60,second=chroma*(1-Math.abs(sector%2-1));
 const channels=[[chroma,second,0],[second,chroma,0],[0,chroma,second],[0,second,chroma],[second,0,chroma],[chroma,0,second]][Math.floor(sector)%6];
 return '#'+channels.map(channel=>Math.round((channel+lightness-chroma/2)*255).toString(16).padStart(2,'0')).join('');
}
export function contrast(first,second){
 const luminance=hex=>hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
 const left=luminance(first),right=luminance(second);return (Math.max(left,right)+.05)/(Math.min(left,right)+.05);
}
export function palette(value){
 const state=appearance(value),saturation=state.saturation/100,level=.035+.91*state.brightness/100;
 const base=hsl(state.hue,saturation*.3,level),lightText=contrast('#ffffff',base)>contrast('#000000',base);
 // Keep surfaces on the same side of the contrast boundary as the background.
 const direction=lightText?-1:1;
 const color=(offset,sat=.3)=>hsl(state.hue,saturation*sat,Math.max(.015,Math.min(.98,level+direction*offset)));
 const foreground=lightText?'#ffffff':'#000000',surfaces=[base,color(.035),color(.065),color(.085)];
 const minimumContrast=hex=>Math.min(...surfaces.map(surface=>contrast(hex,surface)));
 const readable=(hue,sat)=>{
  if(minimumContrast(hsl(hue,sat,.5))>=4.5)return hsl(hue,sat,.5);
  let safe=lightText?1:0,unsafe=.5;
  for(let iteration=0;iteration<12;iteration++){
   const middle=(safe+unsafe)/2;
   if(minimumContrast(hsl(hue,sat,middle))>=4.5)safe=middle;else unsafe=middle;
  }
  return hsl(hue,sat,safe);
 };
 const muted=readable(state.hue,saturation*.25),accent=readable(state.hue,saturation);
 return {'--ui-bg':surfaces[0],'--ui-panel':surfaces[1],'--ui-control':surfaces[2],'--ui-active':surfaces[3],
  '--ui-fg':foreground,'--ui-muted':muted,'--ui-accent':accent,'--ui-border':accent,'--ui-focus':accent,
  '--ui-error':readable(0,.8),'--ui-success':readable(145,.8),'--ui-warning':readable(40,.8),
  '--ui-scheme':lightText?'dark':'light'};
}
export function wheelPosition(x,y){
 return {hue:(Math.atan2(y,x)*180/Math.PI+360)%360,saturation:Math.min(100,Math.hypot(x,y)*100)};
}
