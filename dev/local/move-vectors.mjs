/** Resolution-independent drawing commands; coordinates stay in Move units. */
const point=value=>Math.round(value*1000)/1000;
const ink=color=>color?'white':'black';
const shape=(tag,attributes)=>({tag,attributes});
const stroke=(color=1,opacity=1)=>({fill:'none',stroke:ink(color),'stroke-width':0.8,'stroke-linecap':'round','stroke-linejoin':'round',opacity});
const path=(points,color=1,opacity=1)=>shape('path',{d:points.map(([x,y],index)=>(index?'L':'M')+point(x+.5)+' '+point(y+.5)).join(' '),...stroke(color,opacity)});
function samples(left,right){
 const count=Math.min(513,Math.max(2,Math.ceil((right-left)*4)+1));
 return Array.from({length:count},(_,index)=>left+(right-left)*index/(count-1));
}
export function vectorShapes(kind,args){
 if(kind==='enum'){
  const [x,y,width,height,value,readOnly=false]=args;
  return [shape('rect',{x:x+.5,y:y+.5,width:width-1,height:height-1,rx:1,...stroke(1,readOnly?.55:1),...(readOnly?{'stroke-dasharray':'1 1.5'}:{})}),
   {tag:'text',attributes:{fill:'white','data-value':String(value??'')},text:String(value??''),box:[x+2,y+1,width-4,height-2]}];
 }
 if(kind==='line'){
  const [x0,y0,x1,y1,color=1,opacity=1]=args;return [path([[x0,y0],[x1,y1]],color,opacity)];
 }
 if(kind==='circle'){
  const [cx,cy,r,color=1]=args;return [shape('circle',{cx:cx+.5,cy:cy+.5,r,...stroke(color)})];
 }
 if(kind==='arc'){
  const [cx,cy,r,start,sweep,color=1]=args;
  if(sweep>=360)return vectorShapes('circle',[cx,cy,r,color]);
  const at=angle=>{const radians=angle*Math.PI/180;return [point(cx+.5+r*Math.sin(radians)),point(cy+.5-r*Math.cos(radians))];};
  return [shape('path',{d:`M${at(start).join(' ')} A${r} ${r} 0 ${sweep>180?1:0} 1 ${at(start+sweep).join(' ')}`,...stroke(color)})];
 }
 if(kind==='knob'){
  const [cx,cy,r,value,start,sweep,arcStart,arcSweep,inner,outer]=args,angle=(start+value*sweep)*Math.PI/180;
  const at=distance=>[cx+r*distance*Math.sin(angle),cy-r*distance*Math.cos(angle)];
  return [...vectorShapes('arc',[cx,cy,r,arcStart,arcSweep]),path([at(inner),at(outer)])];
 }
 if(kind==='ellipse'){
  const [cx,cy,rx,ry,color=1,filled=false,bottomOnly=false]=args;
  if(!bottomOnly)return [shape('ellipse',{cx:cx+.5,cy:cy+.5,rx,ry,...(filled?{fill:ink(color)}:stroke(color))})];
  return [path(samples(0,Math.PI).map(angle=>[cx+rx*Math.cos(angle),cy+ry*Math.sin(angle)]),color)];
 }
 if(kind==='roundRect'){
  const [x,y,width,height,radius,color=1,filled=true]=args;
  return [shape('rect',{x:x+(filled?0:.5),y:y+(filled?0:.5),width:width-(filled?0:1),height:height-(filled?0:1),rx:radius,...(filled?{fill:ink(color)}:stroke(color))})];
 }
 if(kind==='switch'){
  const [x,y,width,height,slugX,slugY,slugW,slugH,on,radius=1.5]=args;
  return [...vectorShapes('roundRect',[x,y,width,height,radius,1,on]),...vectorShapes('roundRect',[slugX,slugY,slugW,slugH,Math.min(radius,slugH/2),on?0:1,true])];
 }
 if(kind==='shade'){
  const [x,y,width,height,color=1,opacity=.35]=args;return [shape('rect',{x,y,width,height,fill:ink(color),opacity})];
 }
 if(kind==='dottedRect'){
  const [x,y,width,height]=args;return [shape('rect',{x:x+.5,y:y+.5,width:width-1,height:height-1,...stroke(1,.55),'stroke-dasharray':'1 1.5'})];
 }
 if(kind==='corners'){
  const [x,y,width,height]=args,radius=Math.min(1.5,width/2,height/2),right=x+width,bottom=y+height;
  return [shape('path',{d:`M${x} ${y}h${radius}Q${x} ${y} ${x} ${y+radius}Z M${right} ${y}h${-radius}Q${right} ${y} ${right} ${y+radius}Z M${right} ${bottom}h${-radius}Q${right} ${bottom} ${right} ${bottom-radius}Z M${x} ${bottom}h${radius}Q${x} ${bottom} ${x} ${bottom-radius}Z`,fill:'black'})];
 }
 if(kind==='curve'){
  const [left,right,yAt,color=1,skip=null,opacity=1]=args,shapes=[];let points=[];
  for(const x of samples(left,right)){
   const y=yAt(x);
   if(!Number.isFinite(y)||(skip&&skip(y))){if(points.length>1)shapes.push(path(points,color,opacity));points=[];}
   else points.push([x,y]);
  }
  if(points.length>1)shapes.push(path(points,color,opacity));return shapes;
 }
 if(kind==='closedWave'){
  const [left,right,yAt,color,opacity]=args,shapes=vectorShapes('curve',[left,right,yAt,color,null,opacity]);
  if(yAt(left)!==yAt(right))shapes.push(path([[left,yAt(left)],[left,yAt(right)]],color,opacity),path([[right,yAt(left)],[right,yAt(right)]],color,opacity));
  return shapes;
 }
 if(kind==='waveform'){
  const [x,y,width,height,peaks,gain]=args,mid=y+(height-1)/2,amp=(height-1)/2;
  const halfAt=px=>{
   const index=Math.min(Math.max(0,px-x),peaks.length-1),left=Math.floor(index),fraction=index-left;
   return Math.max(0,Math.min(1,((peaks[left]??0)*(1-fraction)+(peaks[left+1]??peaks[left]??0)*fraction)*gain))*amp;
  };
  return [...vectorShapes('mass',[x,x+width-1,px=>mid-halfAt(px),mid,y,y+height-1,px=>mid+halfAt(px)]),
   ...vectorShapes('curve',[x,x+width-1,px=>mid-halfAt(px)]),...vectorShapes('curve',[x,x+width-1,px=>mid+halfAt(px)])];
 }
 if(kind==='fader'){
  const [cx,top,bottom,value,wide]=args,y=bottom-Math.max(0,Math.min(1,value))*(bottom-top),width=wide?7:3;
  return [path([[cx-4,top],[cx-4,bottom]],1,.4),path([[cx+4,top],[cx+4,bottom]],1,.4),
   shape('rect',{x:cx-(width-1)/2,y,width,height:bottom-y+1,fill:'white',opacity:wide?.55:.85}),path([[cx-3,y],[cx+3,y]])];
 }
 if(kind==='pan'){
  const [cx,cy,value,half]=args,offset=Math.max(-1,Math.min(1,(value-.5)*2))*half;
  return [path([[cx-half,cy+5],[cx+half,cy+5]],1,.4),
   shape('rect',{x:cx,y:cy-7,width:1,height:3,fill:'white'}),
   shape('rect',{x:cx+Math.min(0,offset),y:cy-2,width:Math.abs(offset)+1,height:6,fill:'white'})];
 }
 if(kind==='envStage'){
  const [x,top,bottom,width,length,stage]=args,right=x+width-1;
  return stage==='d'?[path([[x,top],[x,bottom]],1,.4),path([[x,top],[x+length,bottom],[right,bottom]])]
   :[path([[x,bottom],[right-length,bottom],[right,top]]),path([[right,top],[right,bottom]],1,.4)];
 }
 if(kind==='mass'){
  const [left,right,yAt,base,top,bottom,mirror=null]=args;
  const clip=value=>Math.max(top,Math.min(bottom,value));
  const columns=samples(left,right),points=columns.map(x=>[x,clip(yAt(x))]).concat(columns.reverse().map(x=>[x,clip(mirror?mirror(x):base)]));
  return [shape('path',{d:path(points).attributes.d+'Z',fill:'white',opacity:.28})];
 }
 if(kind==='polyline')return [path(args[0],args[1]??1)];
 throw new Error('Unknown vector drawing: '+kind);
}
