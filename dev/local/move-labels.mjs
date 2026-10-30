/** Read-only labels for the exact maps sent by Movy, never a second pad mapper. */
import {keyboardState} from 'movy/keyboard/state.ts';
import {SCALES} from 'movy/scale-catalog.ts';
import {midiNoteName} from 'movy/keyboard/notes.ts';

export const actorName=track=>['Root','Bass','Comp','Melody'][track%4];
const pitchName=pitch=>Number.isInteger(pitch)&&pitch>=0&&pitch<128?midiNoteName(pitch):'—';
function degreeLabel(pitch){
 const degrees=SCALES[keyboardState.scale].degrees;
 const degree=degrees.indexOf(((pitch-keyboardState.rootPc)%12+12)%12);
 return degree<0?pitchName(pitch):String(degree+1);
}

export function createPadLabels(read){
 let padMap=[],jointMap=[],revision=0,last=null,lastAt=-Infinity;
 function route(key,value){
  if(key==='padmap'){padMap=String(value).split(',').map(Number);revision++;}
  if(key==='joint_map'){jointMap=value==='off'?[]:String(value).split(';').map(cell=>cell.split(',').map(Number));revision++;}
 }
 function describe(mode,track,editing=false){
  if(editing||![1,3,6].includes(mode))return null;
  const ownerName=owner=>mode===6?'Melody':actorName(owner);
  const now=performance.now(),signature=[revision,mode,track,keyboardState.scale,keyboardState.rootPc].join(':');
  if(last?.signature===signature&&now-lastAt<100)return last;
  const cells=mode===3?jointMap.map(([owner,pitch,target,row])=>({track:owner,pitch,target,row:target>=0&&row!==3?row+1:0})):
   padMap[0]<0||padMap.length!==33?[]:padMap.slice(1).map(code=>({track,
    pitch:code>=128?-1:code,target:code>=128?code%128:-1,row:code>=256?Math.floor((code-256)/128)+1:0}));
  if(cells.length!==32)return null;
  const operations=new Map();
  for(const owner of new Set(cells.filter(cell=>cell.target>=0).map(cell=>cell.track))){
   const [header,...sequence]=String(read(`ch${owner}:midi_fx1:approach_sequence_view`)).split('|');
   const [selected,,begin]=header.split(',').map(Number);
   const rows=String(read(`ch${owner}:midi_fx1:approach_rows_view`)).split('|').map(row=>row.split(',').slice(1).join(','));
   operations.set(owner,{single:sequence[selected-begin]||'Approach',rows});
  }
  const pads=cells.map((cell,index)=>{
   const approach=cell.target>=0,pitch=approach?cell.target:cell.pitch;
   const degree=pitch>=0?degreeLabel(pitch):'—',operation=approach?(cell.row?operations.get(cell.track)?.rows[cell.row-1]:operations.get(cell.track)?.single)||'Approach':null;
   const targetLabel=/^\d+$/.test(degree)?'degree '+degree:degree;
   return {...cell,index,degree,operation,kind:pitch<0?'Silent':approach?'Approach':'Target',
    primary:pitch<0?'—':approach?'→'+degree:degree,secondary:pitchName(pitch),
    description:`T${cell.track+1} ${ownerName(cell.track)} · ${pitch<0?'Silent':approach?operation+' → '+targetLabel:targetLabel} · ${approach?'target ':''}${pitchName(pitch)}`};
  });
  const rows=Array.from({length:4},(_,row)=>{
   const section=pads.slice(row*8,row*8+8),owners=[...new Set(section.map(cell=>`T${cell.track+1} ${ownerName(cell.track)}`))];
   const kinds=[...new Set(section.filter(cell=>cell.kind!=='Silent').map(cell=>cell.kind))];
   const ops=[...new Set(section.map(cell=>cell.operation).filter(Boolean))];
   return {owner:owners.join(' / '),kind:kinds.join(' + ')||'Silent',operation:ops.join(' / ')};
  });
  lastAt=now;return last={signature,pads,rows,key:pitchName(keyboardState.rootPc).replace(/-1$/,''),scale:SCALES[keyboardState.scale].name};
 }
 function outputs(packets){
  const groups=new Map();
  for(const packet of packets){
   if((packet[1]&240)!==144||!packet[3])continue;
   const channel=(packet[1]&15)+1;
   if(!groups.has(channel))groups.set(channel,new Set());groups.get(channel).add(packet[2]);
  }
  if(!groups.size)return [];
  return [...groups].sort(([left],[right])=>left-right).map(([channel,notes])=>({channel,
   notes:[...notes].sort((left,right)=>left-right),names:[...notes].sort((left,right)=>left-right).map(pitchName)}));
 }
 return {route,describe,outputs,invalidate(){last=null;}};
}
