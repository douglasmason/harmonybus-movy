/** Shared actor browser and temporary performance source; Record owns persistence. */
import styles from './generator-styles.json';
import {userParts,isGeneratorPart,userPartLabel,partLibraryRevision,type PartKind} from './part-storage.js';
import {portFor} from '../track/registry.js';
import {seqCmd,seqCmdFlush,engineReady,engineGeneration} from './engine.js';
import {seqState} from './state.js';
import {seqToast} from './render.js';
import {undoableEdit} from '../undo/edit.js';
type Actor='Comp'|'Bass'|'Melody';
type Draft={config:number[];genre:string;user:number|null;auditioned?:boolean};
let selectedActor:Actor='Comp',generation=-1,recordingTrack:number|null=null,pageDirty=false,selectedTrack=2;
let tracks={Comp:2,Bass:1,Melody:3};
let libraryRevision=-1;
const shortStyles:Record<string,string>={'Root / Fifth':'R+5',Syncopated:'Sync',Quarters:'Qtrs',Offbeats:'Offbt',Sustain:'Hold','Pop Answer 2b':'Pop 2b','Funk Pocket 2b':'Funk 2b','Bossa 2b':'Bosa 2b','Soul Space 4b':'Soul 4b'};
const drafts=new Map<string,Draft>();
const liveModes=['Exploring','Recording','Preview','Overdub'];
const recordedModes=['Recorded','Preview','Overdub'];
const cached=new Map<number,{at:number;value:string[]}>();
export const cloudDefaults=[96,48,64,40,64,32];
export const cloudControls=['density','dynamics','rate','length','register','spread','contour','variation'];
export const cloudKeys=['rate','density','length','register','spread','contour','variation','dynamics'].map(field=>'cg_cloud_'+field);
export const euclideanDefaults=[3,8,0,0,0,50,50];
export const euclideanControls=['hits','steps','rotation','rate','accents','depth','gate'];
export const euclideanRates=['1/16','1/8','1/4','1/2'];
export const euclideanKeys=[...euclideanControls.slice(0,4).map(field=>'cg_euclid_'+field),'cg_intensity','cg_explore','cg_bake','cg_restore'];
export const euclideanExpressionKeys=['cg_euclid_accents','cg_euclid_depth','cg_euclid_gate','cg_intensity','cp_blank_0','cg_explore','cg_bake','cg_restore'];
export type EuclideanView={hits:number;steps:number;rotation:number;rate:number;cursor:number;mask:number;accents:number;depth:number;gate:number;accentMask:number};
/** A stopped draft uses its controls; running views use the engine observation. */
export function generatorEuclideanView(track=selectedTrack):EuclideanView|null {
 const state=readState(track);if(!compatible(state)||!generatorEuclidean(track))return null;
 let [hits,steps,rotation,rate,accents,depth,gate]=euclideanDefaults.map((fallback,index)=>draft(track).config[5+index]??fallback),cursor=-1;
 const observed=state[6]?.trim().split(' ').map(Number);
 if(state[0]!=='Off'&&observed&&[5,8].includes(observed.length)&&observed.every(Number.isInteger)&&observed[0]>=0&&observed[0]<=16&&observed[1]>=1&&observed[1]<=16&&observed[2]>=0&&observed[2]<16&&observed[3]>=0&&observed[3]<4&&observed[4]>=-1&&observed[4]<observed[1]){
  [hits,steps,rotation,rate,cursor]=observed;
  if(observed.length===8&&observed[5]>=0&&observed[5]<=16&&observed[6]>=0&&observed[6]<=100&&observed[7]>=1&&observed[7]<=100)[accents,depth,gate]=observed.slice(5);
 }
 if(![hits,steps,rotation,rate].every(Number.isInteger)||steps<1||steps>16)return null;
 const count=Math.min(hits,steps),accentCount=Math.min(accents,count);let mask=0,accentMask=0;
 for(let index=0;index<steps;index++){
  const offset=(index+steps-rotation%steps)%steps;
  if(count>0&&(offset*count)%steps<count){mask|=1<<index;if(accentCount>0&&(Math.floor(offset*count/steps)*accentCount)%count<accentCount)accentMask|=1<<index;}
 }
 return {hits:count,steps,rotation:rotation%steps,rate,cursor,mask,accents:accentCount,depth,gate,accentMask};
}
/** A step tap is the same control edit as turning Rotation, including overdub. */
export function generatorRotateStep(index:number,track=selectedTrack):boolean {
 const view=generatorEuclideanView(track);if(!view||!Number.isInteger(index)||index<0||index>=view.steps)return false;
 return generatorWrite('cg_euclid_rotation',String(index),track)===true;
}
function sourceKind(style:number):string {const name=styles[style]?.name;return name==='Cloud'||name==='Euclidean'?name:'Authored';}
export function generatorEuclidean(track=selectedTrack):boolean{return sourceKind(draft(track).config[0])==='Euclidean';}
export function generatorCloud(track=selectedTrack):boolean{return styles[draft(track).config[0]]?.name==='Cloud';}
export function generatorPanelKeys():string[]{return generatorEuclidean()?euclideanKeys:generatorCloud()?cloudKeys:generatorKeys;}
export function generatorSelectedTrack():number{return selectedTrack;}
export const generatorBrowseKeys=['cg_actor','cg_genre','cg_family','cg_style'];
export const generatorKeys=['cg_complexity','cg_intensity','cg_seed','cg_explore','cg_bake','cg_restore','cg_source_style'];
export function generatorActor():Actor{return selectedActor;}
export function generatorTarget(comp:number,bass:number,melody=3):number {tracks={Comp:comp,Bass:bass,Melody:melody};selectedTrack=tracks[selectedActor];return selectedTrack;}
function draft(track=selectedTrack):Draft {
 const key=selectedActor+':'+track;let value=drafts.get(key);
 if(!value){const style=styles.findIndex(style=>style.actor===selectedActor);value={config:styles[style].name==='Cloud'?[style,96,80,1,0,...cloudDefaults]:[style,32,64,1],genre:'All',user:null};drafts.set(key,value);}
 return value;
}
/** Existing library Load can start the same temporary source and Record path. */
export function generatorAuditionUser(track:number,kind:PartKind,index:number,genre='All'):boolean {
 const entry=userParts(kind)[index],actor:Actor=entry?.generator??(kind==='bass'?'Bass':'Comp');
 if(!entry||!isGeneratorPart(entry)||(entry.generator&&entry.generator!==actor)){seqToast('Choose a saved generator recipe');return false;}
 if(entry.synth!==(portFor(track).getParam('synth_module')??'')){seqToast('User preset needs its saved instrument');return false;}
 if(!engineReady())return false;
 seqCmd('guser '+track+' '+kind+' '+entry.payload);seqCmdFlush();cached.clear();
 const state=info(track,true);
 if(state[5]!=='1'||!state[3]?.startsWith('Explore saved recipe')){seqToast(state[3]??'Recipe unavailable');return false;}
 selectedActor=actor;selectedTrack=track;tracks[actor]=track;
 const current=draft(track);current.user=index;current.auditioned=true;current.genre=genre;pageDirty=true;readState(track,true);return true;
}
function editUser(track:number,field:number,value:number):boolean {
 seqCmd('guser '+track+' edit '+field+' '+value);seqCmdFlush();cached.clear();
 const state=readState(track,true);if((state[5]!=='1'&&state[0]!=='Overdub')||!state[3]?.startsWith('Explore saved recipe')){seqToast(state[3]??'Recipe unavailable');return false;}return true;
}
function choices(genre=draft().genre){return styles.filter(style=>style.actor===selectedActor&&(genre==='All'||style.genres.includes(genre)));}
const actorKind=():PartKind=>selectedActor==='Bass'?'bass':'comp';
function userChoices(includeCurrent=true):number[]{
 const current=draft(),entries=userParts(actorKind());
 return Array.from({length:8},(_,index)=>index).filter(index=>current.genre==='All'||isGeneratorPart(entries[index])&&entries[index]?.genres?.includes(current.genre)||includeCurrent&&current.user===index);
}
function genres():string[]{return [...new Set([...styles.filter(style=>style.actor===selectedActor).flatMap(style=>style.genres),...userParts(actorKind()).filter(isGeneratorPart).flatMap(entry=>entry?.genres??[])])];}
function familyChoices():string[]{return [...new Set([...choices().map(style=>style.family),styles[draft().config[0]].family,...(userChoices(false).length||draft().user!==null?['User']:[])])];}
function styleChoices():string[]{if(draft().user!==null)return userChoices().map(index=>userPartLabel(actorKind(),index));const family=styles[draft().config[0]].family;return [...new Set([...choices().filter(style=>style.family===family).map(style=>style.name),styles[draft().config[0]].name])];}
export function generatorParameters():any[]{return [
 {key:'cg_actor',name:'Generator Actor',short_name:'Actor',type:'enum',options:['Comp','Bass','Melody'],options_as_string:true,default:'Comp'},
 {key:'cg_genre',name:'Genre Filter',short_name:'Genre',type:'enum',options:['All',...genres()],options_as_string:true,default:'All'},
 {key:'cg_family',name:'Pattern Family',short_name:'Family',type:'enum',options:familyChoices(),options_as_string:true,default:familyChoices()[0]},
 {key:'cg_style',name:'Pattern Style',short_name:'Style',type:'enum',options:styleChoices(),short_options:styleChoices().map(name=>shortStyles[name]??name),options_as_string:true,default:styleChoices()[0]},
 {key:'cg_source_style',name:'Generator Style',short_name:'Style',type:'enum',options:choices('All').map(style=>style.name),short_options:choices('All').map(style=>shortStyles[style.name]??style.name),options_as_string:true,default:choices('All')[0].name},
 ...cloudControls.map(field=>({key:'cg_cloud_'+field,name:'Cloud '+field,short_name:field.slice(0,6),type:'int',min:0,max:127,step:1,default:64})),
 ...euclideanControls.slice(0,3).map((field,index)=>({key:'cg_euclid_'+field,name:'Euclidean '+field,short_name:['Hits','Steps','Rotate'][index],type:'int',min:field==='steps'?1:0,max:field==='rotation'?15:16,step:1,default:euclideanDefaults[index]})),
 {key:'cg_euclid_rate',name:'Euclidean Step Rate',short_name:'Rate',type:'enum',options:euclideanRates,options_as_string:true,default:'1/16'},
 ...['accents','depth','gate'].map((field,index)=>({key:'cg_euclid_'+field,name:['Euclidean Accents','Accent Depth %','Euclidean Gate %'][index],short_name:['Accents','Depth','Gate'][index],type:'int',min:field==='gate'?1:0,max:field==='accents'?16:100,step:1,default:euclideanDefaults[4+index]})),
 ...['complexity','intensity'].map(field=>({key:'cg_'+field,name:field==='complexity'?'Complexity %':'Intensity %',short_name:field==='complexity'?'Complex':'Intens',type:'int',min:0,max:100,step:1,default:field==='complexity'?25:50})),
 {key:'cg_seed',name:'Variation Seed',short_name:'Seed',type:'int',min:1,max:65535,step:1,default:1},
 ...['explore','bake','restore'].map(field=>({key:'cg_'+field,name:field==='explore'?'Explore / Stop':field==='bake'?'Bake Recorded Clip':'Restore Saved Controls',short_name:field==='explore'?'Explore':field==='bake'?'Bake':'Revert',type:'string',readOnly:true}))
];}
function info(track:number,fresh=false):string[]{
 if(generation!==engineGeneration()){cached.clear();recordingTrack=null;generation=engineGeneration();}
 const now=Date.now();let state=cached.get(track);
 if(fresh||!state||now-state.at>=100){state={at:now,value:String(host_module_get_param('generator_info_'+track)??'').split('|')};cached.set(track,state);}
 return state.value;
}
function active(track=selectedTrack):boolean {return liveModes.includes(info(track)[0]);}
function recordingTarget():number|null {
 const binding=info(selectedTrack)[4];
 if(binding!==undefined){const owner=Number(binding);recordingTrack=Number.isInteger(owner)&&owner>=0&&owner<16?owner:null;}
 else if(!seqState.recording&&!seqState.countingIn)recordingTrack=null;
 return recordingTrack;
}
export function generatorRecordActive():boolean {return recordingTarget()!==null||(active()&&compatible(info(selectedTrack)));}
export function generatorRecordTrack():number|null {return recordingTarget()??(active()&&compatible(info(selectedTrack))?selectedTrack:null);}
/** Display the confirmed take owner, never the actor merely being browsed. */
export function generatorClipSlot(track=selectedTrack):number|null {
 const value=info(track)[1],slot=Number(value);return value!==undefined&&Number.isInteger(slot)&&slot>=0&&slot<8?slot:null;
}
export function generatorRecording():{phase:'idle'|'armed'|'count-in'|'recording';track:number|null;slot:number|null} {
 const track=recordingTarget();
 const phase=seqState.countingIn?'count-in':seqState.recording?'recording':track!==null?'armed':'idle';
 return {phase,track,slot:track===null?null:generatorClipSlot(track)};
}
export function generatorPageChanged():boolean {if(libraryRevision!==partLibraryRevision()){libraryRevision=partLibraryRevision();pageDirty=true;}const changed=pageDirty;pageDirty=false;return changed;}
function compatible(state:string[]):boolean {const style=styles[Number(state[2]?.split(' ')[0])];return !(liveModes.includes(state[0])||state[0]==='Recorded')||style?.actor===selectedActor;}
function readState(track:number,fresh=false):string[]{
 const state=info(track,fresh),current=draft(track);
 if((liveModes.includes(state[0])||state[0]==='Recorded')&&compatible(state)){
  const values=state[2]?.split(' ').map(Number);
  if(values&&[4,5,9,11,12].includes(values.length)&&values.every(Number.isFinite)&&Number.isInteger(values[0])&&styles[values[0]]){
   if(styles[current.config[0]].family!==styles[values[0]].family)pageDirty=true;
   current.config=values.length>=9?values:values.slice(0,4);
   if(recordedModes.includes(state[0])&&current.user!==null&&current.auditioned){current.user=null;pageDirty=true;}
  }
 }
 return state;
}
function preview(track:number,slot:number,field?:number,value?:number):boolean {
 if(!engineReady())return false;
 seqCmd('gpreview '+track+' '+slot+(field===undefined?'':' '+field+' '+value));seqCmdFlush();cached.clear();
 const state=readState(track,true),okay=['Preview','Overdub'].includes(state[0]);
 if(!okay)seqToast(state[3]??'Preview unavailable');
 return okay;
}
/** null leaves ordinary Record routing alone; false consumes a refused request. */
export function generatorPrepareRecord(track:number):boolean|null {
 if(recordingTarget()!==null)return true;
 const state=readState(track,true);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return false;}
 if(active(track))return true;
 return state[0]==='Recorded'?preview(track,Number(state[1])):null;
}
export function generatorRecordCommand():string|null {const track=generatorRecordTrack();if(track===null)return null;recordingTrack=track;return 'rec '+track;}
export function generatorStop(track?:number):void {if(engineReady()){seqCmd(track===undefined?'gexplore off':'gexplore '+track+' off');seqCmdFlush();}cached.clear();if(track===undefined||recordingTrack===track)recordingTrack=null;}
function send(track:number):boolean {
 if(!engineReady())return false;
 seqCmd('gexplore '+track+' '+draft(track).config.join(' '));seqCmdFlush();cached.clear();
 const result=info(track,true),okay=liveModes.includes(result[0]);
 if(!okay)seqToast(result[3]??'Generator unavailable');
 return okay;
}
export function generatorRead(key:string,track:number):string|null {
 if(!key.startsWith('cg_'))return null;
 readState(track);const current=draft(track),config=current.config,field=key.slice(3);
 if(field.startsWith('euclid_')){const index=euclideanControls.indexOf(field.slice(7));if(index<0)return null;const value=config[5+index]??euclideanDefaults[index];return index===3?euclideanRates[value]:String(value);}
 if(field.startsWith('cloud_')){const index=cloudControls.indexOf(field.slice(6));return String(index<2?config[index+1]:(config[5+index-2]??cloudDefaults[index-2]));}
 if(field==='actor')return selectedActor;
 if(field==='genre')return current.genre;
 if(field==='family')return current.user!==null?'User':styles[config[0]].family;
 if(field==='style')return current.user!==null?userPartLabel(actorKind(),current.user):styles[config[0]].name;
 if(field==='source_style')return styles[config[0]].name;
 if(field==='complexity'||field==='intensity')return String(Math.round(config[field==='complexity'?1:2]*100/127));
 if(field==='seed')return String(config[3]);
 if(field==='explore')return active(track)?'Stop':'Start';
 if(field==='bake'||field==='restore')return 'Tap';return null;
}
export function generatorWrite(key:string,value:string,track:number):boolean|null {
 if(!key.startsWith('cg_'))return null;
 const field=key.slice(3);
 if(field==='actor'){
  if(!['Comp','Bass','Melody'].includes(value))return false;if(value===selectedActor)return true;
  selectedActor=value as Actor;selectedTrack=tracks[selectedActor];cached.clear();pageDirty=true;return true;
 }
 const state=readState(track),current=draft(track),recorded=recordedModes.includes(state[0]);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return false;}
 if(field.startsWith('euclid_')){
  const control=euclideanControls.indexOf(field.slice(7));
  const number=control===3?euclideanRates.indexOf(value):Number(value);
  if(control<0||!Number.isFinite(number)||number<0||!generatorEuclidean(track))return false;
  const amount=Math.max(control===1||control===6?1:0,Math.min(control===2?15:control===3?3:control>=5?100:16,Math.round(number))),lane=control>=4?control+1:control;
  if(current.user!==null)return active(track)?editUser(track,lane,amount):false;
  if(recorded)return preview(track,Number(state[1]),lane,amount);
  current.config=[...current.config.slice(0,4),0,...euclideanDefaults.map((fallback,index)=>current.config[5+index]??fallback)];
  current.config[5+control]=amount;return active(track)?send(track):true;
 }
 if(field.startsWith('cloud_')){
  const control=cloudControls.indexOf(field.slice(6)),number=Number(value);if(control<0||!Number.isFinite(number)||!generatorCloud(track))return false;
  const amount=Math.max(0,Math.min(127,Math.round(number)));
  if(current.user!==null)return active(track)?editUser(track,control,amount):false;
  if(recorded)return preview(track,Number(state[1]),control,amount);
  current.config=[...current.config.slice(0,4),0,...(current.config.length===11?current.config.slice(5):cloudDefaults)];
  current.config[control<2?control+1:control+3]=amount;return active(track)?send(track):true;
 }
 if(field==='genre'){
  if(value!=='All'&&!genres().includes(value))return false;
  current.genre=value;pageDirty=true;return true;
 }
 const eligible=userChoices(false),preferred=eligible.find(index=>isGeneratorPart(userParts(actorKind())[index]))??eligible[0]??current.user;
 const userChoice=field==='family'&&value==='User'?preferred:field==='style'&&current.user!==null?userChoices().find(index=>userPartLabel(actorKind(),index)===value)??null:null;
 if(userChoice!==null){
  if(recordingTarget()===track){seqToast('Finish this actor take first');return false;}
  if(active(track))return generatorAuditionUser(track,actorKind(),userChoice,current.genre);
  current.user=userChoice;current.auditioned=false;pageDirty=true;return true;
 }
 if(field==='seed'&&current.user!==null){seqToast('Seed fixed for saved recipes');return false;}
 const next=[...current.config];
 if(field==='family'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.family===value&&(current.genre==='All'||style.genres.includes(current.genre)));if(index<0)return false;next[0]=index;}
 else if(field==='style'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.name===value&&style.family===styles[current.config[0]].family&&(current.genre==='All'||style.genres.includes(current.genre)));if(index<0)return false;next[0]=index;}
 else if(field==='source_style'){const index=styles.findIndex(style=>style.actor===selectedActor&&style.name===value);if(index<0)return false;next[0]=index;}
 else if(field==='complexity'||field==='intensity'){const number=Number(value);if(!Number.isFinite(number))return false;next[field==='complexity'?1:2]=Math.round(Math.max(0,Math.min(100,number))*127/100);}
 else if(field==='seed'){if(recorded){seqToast('Seed fixed for recorded clips');return false;}if(recordingTarget()===track){seqToast('Seed locked during recording');return false;}const number=Number(value);if(!Number.isFinite(number))return false;next[3]=Math.max(1,Math.min(65535,Math.round(number)));}
 else return true;
 if(sourceKind(current.config[0])!=='Authored'&&['source_style','style','family'].includes(field)&&next[0]===current.config[0])return true;
 if(generatorEuclidean(track)&&field==='complexity')return false;
 const control=field==='complexity'?0:field==='intensity'?(generatorEuclidean(track)?4:1):2,controlValue=field==='intensity'?next[2]:next[control===2?0:control+1];
 const changingKind=sourceKind(current.config[0])!==sourceKind(next[0]);
 if(changingKind&&(recorded||recordingTarget()===track||current.user!==null&&field==='source_style')){seqToast('Finish this recipe before changing source');return false;}
 if(current.user!==null){
  if(field==='family'||field==='style'){
   if(recordingTarget()===track){seqToast('Finish this actor take first');return false;}
   const wasActive=active(track);if(wasActive)generatorStop(track);current.user=null;current.config=sourceKind(next[0])==='Euclidean'?[...next.slice(0,4),0,...euclideanDefaults]:sourceKind(next[0])==='Cloud'?[...next.slice(0,4),0,...cloudDefaults]:next.slice(0,4);pageDirty=true;
   return wasActive?send(track):true;
  }
  if(active(track))return editUser(track,control,controlValue);
  seqToast('Start recipe exploration to change its controls');return false;
 }
 if(styles[current.config[0]].family!==styles[next[0]].family)pageDirty=true;
 if(changingKind){const wasActive=active(track);if(wasActive)generatorStop(track);current.config=sourceKind(next[0])==='Euclidean'?[...next.slice(0,4),0,...euclideanDefaults]:sourceKind(next[0])==='Cloud'?[...next.slice(0,4),0,...cloudDefaults]:next.slice(0,4);pageDirty=true;return wasActive?send(track):true;}
 current.config=next;
 if(recorded)return preview(track,Number(state[1]),control,controlValue);
 if(active(track))return send(track);return true;
}
export function generatorTouch(key:string,track:number,down:boolean):boolean {
 if(key.startsWith('cp_blank_'))return true;
 if(!['cg_explore','cg_bake','cg_restore'].includes(key))return false;if(!down)return true;
 const state=readState(track,true);
 if(!compatible(state)){seqToast('Clip belongs to another actor');return true;}
 if(key==='cg_restore'){
  if(!engineReady())return true;
  seqCmd('grestore '+track+' '+Number(state[1]));seqCmdFlush();cached.clear();
  const restored=readState(track,true);pageDirty=true;seqToast(restored[3]??'Restore unavailable');return true;
 }
 if(key==='cg_explore') {if(active(track))generatorStop(track);else {if(draft(track).user!==null)generatorAuditionUser(track,actorKind(),draft(track).user!,draft(track).genre);else if(state[0]==='Recorded')preview(track,Number(state[1]));else if(send(track))seqToast('Explore: Play starts / Rec saves');}return true;}
 const slot=Number(state[1]);
 if(state[0]!=='Recorded'||seqState.recording||seqState.countingIn){seqToast('Stop exploration; record a take first');return true;}
 undoableEdit('BAKE '+selectedActor.toUpperCase(),'T'+(track+1),()=>seqCmd('gbake '+track+' '+slot));seqCmdFlush();cached.clear();
 seqToast(info(track,true)[3]??'Bake requested');return true;
}
export function generatorFooter(track:number):string {
 const state=info(track);if(!compatible(state))return 'Clip belongs to another actor';
 if(state[3]&&/^(Choose|Three|Set actor|Actor needs|Automation|Seed locked|Recording ended|Generator automation|Play the selected|Preview ended)/.test(state[3]))return state[3];
 const target=selectedActor+' T'+(track+1)+':'+(Number(state[1])+1),owner=recordingTarget();
 if(owner!==null&&seqState.countingIn)return owner===track?'Count-in '+target:target+' / Count-in T'+(owner+1);
 if(owner!==null&&owner!==track)return target+' / Rec T'+(owner+1);
 if(draft(track).user!==null&&owner===null){const entry=userParts(actorKind())[draft(track).user!];return target+' '+(entry?.steps?entry.steps%16?entry.steps+'s':entry.steps/16+'b':'?b')+(entry?.automation?' Auto:'+(entry.euclidean?['H','S','R','T','I','A','D','G']:entry.cloud?['D','V','R','L','H','S','C','J']:['C','I','S']).filter((_,index)=>entry.automation!&(1<<index)).join(''):'');}
 return (state[0]==='Overdub'?'Overdub ':state[0]==='Preview'?'Preview ':state[0]==='Recording'?'Recording ':active(track)?'Explore ':state[0]==='Recorded'?'Recorded ':'Temporary ')+target;
}

export function generatorEnsureCloud(track=selectedTrack):boolean {
 if(!generatorCloud(track)||!compatible(info(track,true)))return false;
 if(active(track))return true;
 return info(track)[0]==='Recorded'?preview(track,Number(info(track)[1])):send(track);
}
export function generatorCloudContact(track:number,id:number,x:number,y:number,pressure:number,start=true,activity='Probability'):void {
 if(!engineReady()||pressure>0&&(start?!generatorEnsureCloud(track):!active(track)))return;
 seqCmd(`gcloud ${track} ${id} ${Math.round(x)} ${Math.round(y)} ${Math.round(pressure)}${activity==='Rate'?' 1':''}`);seqCmdFlush();
}
export function generatorCloudSnapshot(track=selectedTrack):string {return String(host_module_get_param('cloud_view_'+track)??'');}
export function generatorCloudHeld(track=selectedTrack):boolean {return engineReady()&&String(host_module_get_param('cloud_hold_'+track))==='1';}
export function generatorCloudHold(enabled:boolean,track=selectedTrack):void {
 if(!engineReady()||enabled&&!generatorEnsureCloud(track))return;
 seqCmd(`gcloud ${track} hold ${enabled?1:0}`);seqCmdFlush();
}
