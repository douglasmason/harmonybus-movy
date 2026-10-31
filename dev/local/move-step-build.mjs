/** Read-only browser labels beside the production Chord Play step mapping. */
export function describeChordSteps(contents){
 for(const seam of ['function stepSlot(index:number):number{','function contentStepKey(index:number):string|null',
  'export function chordPadModalActive():boolean','export function chordOperationOwner():PerformancePort|null',
  'export function paintChordSteps():boolean{']){
  if(contents.split(seam).length!==2)throw new Error('Movy chord step label seam changed: '+seam);
 }
 return contents+`
// Browser-only observation: no parameter reads, writes or alternate chord map.
export function browserChordStepLabels(){
 if(!chordActive()||!page||settingsActive()||paramPageActive()||appState.shiftHeld||muteHeld()||
    seqState.loopMode||seqState.trackSelectHold||chordPadModalActive()||chordOperationOwner()||
    page.ctl.hbNavigation?.isMenu()||page.ctl.state.pickerOpen||page.ctl.state.menuEntered||
    chordDiscovery.owns(discoveryLevel())||['cp_clips','cp_motifs'].includes(page.ctl.page?.level??''))return null;
 return Array.from({length:16},(_,index)=>{
  const slot=stepSlot(index);
  if(slot<0)return {slot,name:'Off',roman:'',bank:'',enabled:true,queued:false};
  const setting=setup.slots[slot],meta=chordLabelMetadata(slot,setting.intent,setting.target,bankStatus?.slots[slot]??null);
  return {slot,name:String(meta.chordName),roman:String(meta.chordRoman),bank:bankNames[Math.floor(slot/7)],
   enabled:!!setting.enabled,queued:chordSlotQueued(slot)};
 });
}
`;
}
