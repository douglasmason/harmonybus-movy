/** Read-only feedback from production status and selected-clip metadata. */
export function performanceFeedback(status,clips,{mask=0,overwrite=0,audioEnabled=false}={}){
 const playing=status.play==='1',recording=status.rec==='1',counting=status.cin==='1';
 const tick=Number(status.tick)||0,beat=Math.floor(tick/96)%4+1;
 const known=clips.every(clip=>clip!==null),notes=clips.reduce((sum,clip)=>sum+(clip?.notes??0),0);
 const selected=clips.filter(clip=>clip&&(mask&(1<<clip.track))).map(clip=>`${clip.actor} T${clip.track+1}/C${clip.slot+1}${overwrite&(1<<clip.track)?' replace':' layer'}`);
 let headline=counting?`Count-in · ${4-Math.floor(tick/96)%4} beats — wait`:recording?'Recording — play the pads':playing?'Playing — from the beginning':known?`${notes} captured notes in selected clips`:'Reading selected clips…';
 let hint=counting?'Pads sound now, but notes are not captured until Recording.':recording?'Stop finishes the take; Play finishes and replays. Replace tracks erase earlier notes on each loop.':notes?'Record adds a take. Stop finishes it. Play replays it.':'Record → wait for Recording → play pads → Stop → Play.';
 if(status.song&&status.song!=='-')hint+=' Song is active: Play starts its first scene.';
 if(!audioEnabled)hint+=' Enable audio to listen.';
 if(!mask&&!recording&&!counting)hint+=' No actors enabled for recording; check Controls.';
 return {headline,hint,position:playing?`Bar ${Math.floor(tick/384)+1} · Beat ${beat}`:'',target:selected.join(' · '),notes,known};
}
export function selectedClip(value,track){
 const parts=String(value??'').split(',');
 if(parts.length!==6||![parts[0],parts[2],parts[4]].every(part=>/^\d+$/.test(part)))return null;
 return {track,actor:['Root','Bass','Comp','Melody'][track%4],slot:Number(parts[0]),steps:Number(parts[2]),notes:Number(parts[4])};
}
