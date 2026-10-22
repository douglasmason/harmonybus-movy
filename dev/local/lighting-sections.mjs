const index=value=>Number.isSafeInteger(value)&&value>=0;
/** Validate the production schema without inferring structure from notes or bars. */
export function lightingSection(value){
 if(!value||value.schema!==1||!index(value.epoch)||!index(value.visit)||!index(value.tick)||
  !Number.isFinite(value.ticks_per_bar)||value.ticks_per_bar<=0||typeof value.playing!=='boolean'||typeof value.started!=='boolean')return null;
 const current=value.current;
 if(current!==null&&(!current||!index(current.index)||!index(current.scene)||current.scene>7||typeof current.terminal!=='boolean'||
  !(current.start_tick===null||index(current.start_tick))||!(current.end_tick===null||index(current.end_tick))||
  (current.start_tick!==null&&current.end_tick!==null&&current.end_tick<=current.start_tick)))return null;
 const next=value.next;
 if(next!==null&&(!next||!index(next.index)||!index(next.scene)||next.scene>7||typeof next.committed!=='boolean'))return null;
 return {epoch:value.epoch,visit:value.visit,tick:value.tick,playing:value.playing,started:value.started,
  current:current?{index:current.index,scene:current.scene,start:current.start_tick,end:current.end_tick,terminal:current.terminal}:null,
  next:next?{index:next.index,scene:next.scene,committed:next.committed}:null};
}

/** Observe completed traversals; forecasts never schedule a timer or a cue. */
export class SectionLighting {
 constructor(){this.reset();}
 reset(){this.current=null;this.updated=-Infinity;}
 observe(raw,now,{reset=false,mode='arrival',ppqn=96}={}){
  const previous=this.current,updated=this.updated,current=lightingSection(raw);
  this.current=current;this.updated=now;
  if(reset||!current||!previous||now<updated||now-updated>750||mode==='off')return null;
  const before=previous.current,after=current.current;
  if(!previous.playing||!previous.started||!current.playing||!current.started||!before||!after||
   previous.epoch!==current.epoch||current.visit!==previous.visit+1||
   before.end===null||after.start!==before.end||current.tick<previous.tick||
   current.tick<after.start||!Number.isFinite(ppqn)||ppqn<=0||current.tick-after.start>ppqn/4)return null;
  return after.terminal?'break':mode==='rotate'?'phrase':'arrival';
 }
 label(now){
  const value=this.current;if(!value||now-this.updated>750)return 'Song sections unavailable';
  if(!value.current)return 'No song chain · live and clip response active';
  const current=`Section ${value.current.index+1} · scene ${value.current.scene+1}`;
  if(!value.playing)return `${current} · stopped`;
  if(!value.started||value.current.start===null)return `${current} · awaiting start`;
  if(value.current.terminal)return `${current} · ending`;
  const next=value.next?` → section ${value.next.index+1} (${value.next.committed?'queued':'forecast'})`:'';
  return current+next;
 }
}
