/** Touch controls for the existing Loop + Scene gesture; no browser scheduler. */
import {songLoopHold,songSceneStep,resetSong,NUM_SCENES} from 'movy/seq/song.ts';
import {seqCmdFlush} from 'movy/seq/engine.ts';
import {resetSectionPanel} from 'movy/seq/section-panels.ts';
export function mountSong({page,read}){
 const toggle=document.querySelector('#song-build'),summary=document.querySelector('#song-summary');
 let building=false;
 const setBuilding=value=>{building=value;songLoopHold(value);toggle.setAttribute('aria-pressed',String(value));toggle.textContent=value?'Finish building song':'Build a new song';for(const button of buttons)button.disabled=!value;};
 const buttons=Array.from({length:NUM_SCENES},(_,scene)=>{
  const button=document.createElement('button');button.textContent=`Scene ${scene+1}`;button.disabled=true;
  button.onclick=()=>{songSceneStep(scene*2,true);songSceneStep(scene*2,false);seqCmdFlush();};
  document.querySelector('#song-scenes').append(button);return button;
 });
 toggle.onclick=()=>setBuilding(!building);
 document.querySelector('#song-edit').onclick=()=>{
  setBuilding(false);const controller=page(),index=controller.ctl?.pages.findIndex(item=>item.keys?.includes('joint_section_entry'))??-1;
  if(index>=0)controller.goToPage(index);
 };
 return {
  reset(){setBuilding(false);resetSong();resetSectionPanel();},
  update(){
   let state;try{state=JSON.parse(read('song_section')??'null');}catch{}
   if(state?.schema!==1){summary.textContent='Waiting for song state';return;}
   const entry=value=>value?`Entry ${value.index+1} · Scene ${value.scene+1}`:'—';
   summary.textContent=!state.count?'No song yet. Record a clip, then add Scene 1.':`${state.count} scene selections · Now ${entry(state.current)}${state.current?.terminal?' · END':''} · Next ${entry(state.next)}${state.next?(state.next.committed?' (queued)':' (forecast)'):''} · ${state.editable?'Stopped — section edits available':'Stop to edit sections'}`;
  }
 };
}
