/** Temporary exploration; only Record or Bake writes persistent musical data. */
import styles from './generator-styles.json';
import {seqCmd,seqCmdFlush,engineReady,engineGeneration} from './engine.js';
import {seqState} from './state.js';
import {seqToast} from './render.js';
import {undoableEdit} from '../undo/edit.js';
const families=[...new Set(styles.map(style=>style.family))];
let actor=-1,generation=-1,config=[0,32,64,1],pageDirty=false;
const liveModes=['Exploring','Recording','Preview','Overdub'];
const recordedModes=['Recorded','Preview','Overdub'];
let cached={track:-1,at:0,value:[] as string[]};
const fields=['family','style','complexity','intensity','seed','explore','bake'];
export const generatorKeys=fields.map(field=>'cg_'+field);
export function generatorParameters():any[]{return [
 {key:'cg_family',name:'Comp Family',short_name:'Family',type:'enum',options:families,options_as_string:true,default:families[0]},
 {key:'cg_style',name:'Comp Style',short_name:'Style',type:'enum',options:styles.filter(style=>style.family===styles[config[0]].family).map(style=>style.name),options_as_string:true,default:styles[0].name},
 ...['complexity','intensity'].map(field=>({key:'cg_'+field,name:field==='complexity'?'Complexity %':'Intensity %',short_name:field==='complexity'?'Complex':'Intens',type:'int',min:0,max:100,step:1,default:field==='complexity'?25:50})),
 {key:'cg_seed',name:'Variation Seed',short_name:'Seed',type:'int',min:1,max:65535,step:1,default:1},
 ...['explore','bake'].map(field=>({key:'cg_'+field,name:field==='explore'?'Explore / Stop':'Bake Recorded Clip',short_name:field==='explore'?'Explore':'Bake',type:'string',readOnly:true}))
];}
function info(track:number,fresh=false):string[]{
 const now=Date.now();
 if(fresh||cached.track!==track||now-cached.at>=100){cached={track,at:now,value:String(host_module_get_param('generator_info_'+track)??'').split('|')};}
 return cached.value;
}
function active():boolean {
 if(generation!==engineGeneration()){actor=-1;return false;}
 if(actor>=0){const state=info(actor);if(state.length>=3&&!liveModes.includes(state[0]))actor=-1;}
 return actor>=0;
}
export function generatorRecordActive():boolean {return active();}
export function generatorRecordTrack():number|null {return active()?actor:null;}
export function generatorPageChanged():boolean {const changed=pageDirty;pageDirty=false;return changed;}
function readState(track:number,fresh=false):string[]{
 const state=info(track,fresh);
 if(recordedModes.includes(state[0])||state[0]==='Recording'){
  const values=state[2]?.split(' ').slice(0,4).map(Number);
  if(values?.length===4&&values.every(Number.isFinite)&&Number.isInteger(values[0])&&styles[values[0]]){
   if(styles[config[0]].family!==styles[values[0]].family)pageDirty=true;
   config=values;
  }
 }
 return state;
}
function preview(track:number,slot:number,field?:number,value?:number):boolean {
 if(!engineReady())return false;
 seqCmd('gpreview '+track+' '+slot+(field===undefined?'':' '+field+' '+value));seqCmdFlush();cached.at=0;
 const state=readState(track,true),okay=['Preview','Overdub'].includes(state[0]);
 if(okay){actor=track;generation=engineGeneration();}else seqToast(state[3]??'Preview unavailable');
 return okay;
}
/** null leaves ordinary Record routing alone; false consumes a refused request. */
export function generatorPrepareRecord(track:number):boolean|null {
 if(active())return true;
 const state=readState(track,true);
 return state[0]==='Recorded'?preview(track,Number(state[1])):null;
}
export function generatorRecordCommand():string|null {return active()?'rec '+actor:null;}
export function generatorStop():void {if(actor>=0&&engineReady()){seqCmd('gexplore off');seqCmdFlush();}actor=-1;cached.at=0;}
function send(track:number):boolean {
 if(!engineReady())return false;
 seqCmd('gexplore '+track+' '+config.join(' '));seqCmdFlush();cached.at=0;
 const result=info(track,true);const okay=liveModes.includes(result[0]);
 if(okay){actor=track;generation=engineGeneration();}else seqToast(result[3]??'Generator unavailable');
 return okay;
}
export function generatorRead(key:string,track:number):string|null {
 if(!key.startsWith('cg_'))return null;
 readState(track);
 const field=key.slice(3);
 if(field==='family')return families.includes(styles[config[0]].family)?styles[config[0]].family:families[0];
 if(field==='style')return styles[config[0]].name;
 if(field==='complexity'||field==='intensity')return String(Math.round(config[field==='complexity'?1:2]*100/127));
 if(field==='seed')return String(config[3]);
 if(field==='explore')return active()?'Stop':'Start';
 if(field==='bake')return 'Tap';return null;
}
export function generatorWrite(key:string,value:string,track:number):boolean|null {
 if(!key.startsWith('cg_'))return null;
 const state=readState(track),recorded=recordedModes.includes(state[0]);
 const field=key.slice(3);let next=[...config];
 if(field==='family'){const index=styles.findIndex(style=>style.family===value);if(index<0)return false;next[0]=index;}
 else if(field==='style'){const index=styles.findIndex(style=>style.name===value);if(index<0||styles[index].family!==styles[config[0]].family)return false;next[0]=index;}
 else if(field==='complexity'||field==='intensity'){const number=Number(value);if(!Number.isFinite(number))return false;next[field==='complexity'?1:2]=Math.round(Math.max(0,Math.min(100,number))*127/100);}
 else if(field==='seed'){if(recorded){seqToast('Seed fixed for recorded clips');return false;}if(seqState.recording||seqState.countingIn){seqToast('Seed locked during recording');return false;}const number=Number(value);if(!Number.isFinite(number))return false;next[3]=Math.max(1,Math.min(65535,Math.round(number)));}
 else return true;
 if(styles[config[0]].family!==styles[next[0]].family)pageDirty=true;
 config=next;
 if(recorded){const index=field==='complexity'?0:field==='intensity'?1:2;return preview(track,Number(state[1]),index,next[index===2?0:index+1]);}
 if(active())return send(track);return true;
}
export function generatorTouch(key:string,track:number,down:boolean):boolean {
 if(!['cg_explore','cg_bake'].includes(key))return false;if(!down)return true;
 if(key==='cg_explore') {if(active())generatorStop();else {const state=readState(track,true);if(state[0]==='Recorded')preview(track,Number(state[1]));else if(send(track))seqToast('Explore: Play starts / Rec saves');}return true;}
 const state=info(track,true),slot=Number(state[1]);
 if(state[0]!=='Recorded'||seqState.recording||seqState.countingIn){seqToast('Stop exploration; record a take first');return true;}
 undoableEdit('BAKE COMP','T'+(track+1),()=>seqCmd('gbake '+track+' '+slot));seqCmdFlush();cached.at=0;
 seqToast(info(track,true)[3]??'Bake requested');return true;
}
export function generatorFooter(track:number):string {
 const state=info(track);if(state[3]&&/^(Choose|Three|Set Comp|Comp needs|Automation|Seed locked|Recording ended|Generator automation|Play the selected|Preview ended)/.test(state[3]))return state[3];return state[0]==='Overdub'?'Overdub Comp T'+(track+1):state[0]==='Preview'?'Preview / Record captures':state[0]==='Recording'?'Recording Comp T'+(track+1):active()?'Explore / Rec T'+(track+1)+':'+(Number(state[1])+1):state[0]==='Recorded'?'Recorded / Rec overdubs':'Temporary / Tap Explore';
}
