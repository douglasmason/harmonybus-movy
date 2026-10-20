import type { PerformancePort } from './hb-performance.js';
import { appState } from '../app/state.js';
import { seqState } from '../seq/state.js';
import { seqCmd, seqCmdFlush, engineReady, engineGeneration } from '../seq/engine.js';
import { currentSetUuid } from '../seq/set-session.js';
import { seqToast } from '../seq/render.js';
import { undoableEdit } from '../undo/edit.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { fontPrint } from '../font/index.js';
import { APPROACH_MOTIFS, TRIPLE_MOTIFS } from './hb-approach.js';

const choices=[...APPROACH_MOTIFS.slice(0,19).map(name=>name.replace(/^I-/,'').replace(/-(Target|I|i)$/,'')),...TRIPLE_MOTIFS,...Array.from({length:16},(_,i)=>'User '+(i+1))];
const units=['1/32','1/16T','1/16','1/8T','1/16.','1/8','1/4T','1/8.','1/4','1/4.','1/2','1/2.','1 Bar'];
const rhythms=['As Entered','Even','Long-Short','Short-Long','Accelerate','Decelerate'];
const placements=['Saved','End','Start','Both','Omit'];
export function motifLoaderPanels(hierarchy:any):void {
    if(!hierarchy.levels?.root)return;
    const enumeration=(key:string,name:string,options:string[],value:string)=>({key,name,type:'enum',options_as_string:true,options,default:value});
    const params=[
        enumeration('motif_load_choice','Motif',choices,'ii-V'),
        {key:'motif_load_target',name:'Target Input',type:'int',min:0,max:127,step:1,default:60},
        enumeration('motif_load_collection','Approach Scale',['Parent','Parallel'],'Parent'),
        enumeration('motif_load_unit','Unit',units,'1 Bar'),
        enumeration('motif_rhythm','Rhythm',rhythms,'As Entered'),
        enumeration('motif_placement','Target Placement',placements,'Saved'),
        enumeration('motif_load_even','Even Units',['Off','On'],'Off'),
        enumeration('motif_load_write','Write to Clip',['Preview'],'Preview'),
    ];
    const targets=[params[5],params[6],params[4]];
    hierarchy.levels.motif_targets={name:'Motif Targets',knobs:targets.map(p=>p.key),params:targets};
    if(!hierarchy.levels.root.params.some((p:any)=>p.level==='motif_targets'))hierarchy.levels.root.params.push({level:'motif_targets'});
    hierarchy.levels.motif_load={name:'Motif to Clip',knobs:params.map(p=>p.key),params};
    if(!hierarchy.levels.root.params.some((p:any)=>p.level==='motif_load'))hierarchy.levels.root.params.push({level:'motif_load'});
}
interface Preview { generation:number;setId:string|null;owner:PerformancePort;track:number;slot:number;signature:string;duration:number;root:number;scale:number;
    payload:string;labels:string[];choice:string;target:string;notes:number;occupied:boolean;ready:boolean;page:number; }
let review:Preview|null=null;
const consumed=new Set<number>();
const getEngine=(key:string):string=>String(host_module_get_param(key)??'');
const pitchName=(pitch:number):string=>['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][pitch%12]+(Math.floor(pitch/12)-1);
function prepare(port:PerformancePort):void {
    if(!engineReady()){seqToast('Sequencer not ready');return;}
    const track=port.performanceTrack;
    if(track===undefined||track!==appState.activeTrack.index||seqState.recording||seqState.countingIn||seqState.stepAutoMode){seqToast('Finish clip recording/edit');return;}
    seqCmdFlush();
    const clip=getEngine('motif_clip_info_'+track).split(',');
    if(clip.length!==6||!/^\d+$/.test(clip[0])||! /^[0-9a-f]+$/.test(clip[1])){seqToast('Update Movy for motif loading');return;}
    port.performanceSet('motif_load_prepare','Preview');
    const header=port.performanceGet('motif_load_header').split(',');
    if(header[0]!=='ml1'||header.length!==7){seqToast(header.join(',').replace(/^error:/,''));return;}
    const [serial,duration,count,root,scale]=header.slice(1).map(Number);
    if(![serial,duration,count,root,scale].every(Number.isInteger)||count<1||count>34){seqToast('Invalid motif preview');return;}
    const events:string[]=[];let notes=0;
    for(let index=0;index<count;index++){
        const event=port.performanceGet('motif_load_event_'+serial+'_'+index);
        if(!/^\d+,\d+(,\d+\.\d+)*:[0-9a-f]+(,[0-9a-f]+){51}$/.test(event)){seqToast('Preview expired — try again');return;}
        notes+=event.split(':')[0].split(',').length-2;events.push(event);
    }
    const payload=events.join('|');if(payload.length>40000){seqToast('Motif exceeds transfer limit');return;}
    review={generation:engineGeneration(),setId:currentSetUuid(),owner:port,track,slot:Number(clip[0]),signature:clip[1],duration,root,scale,payload,
        labels:port.performanceGet('motif_load_labels').split(' > '),choice:port.performanceGet('motif_load_choice'),
        target:pitchName(Number(port.performanceGet('motif_load_target'))),notes,occupied:clip[5]==='1',ready:false,page:0};
    appState.dirty=true;
}
function commit(mode:number):void {
    const preview=review;if(!preview)return;
    if(!engineReady()||preview.generation!==engineGeneration()||preview.setId!==currentSetUuid()||preview.track!==appState.activeTrack.index||seqState.recording||seqState.countingIn){review=null;seqToast('Selection changed — preview again');return;}
    const command=`mload ${preview.track} ${preview.slot} ${preview.signature} ${mode} ${preview.duration} ${preview.root} ${preview.scale} ${preview.payload}`;
    undoableEdit('mload','Motif to clip',()=>seqCmd(command));seqCmdFlush();
    const result=getEngine('motif_load_result');seqToast(result||'No result — check clip');
    review=null;markUiStateDirty();appState.dirty=true;
}
export function motifLoaderTouch(port:PerformancePort,key:string|null,slot:number,down:boolean):boolean {
    if(!down&&consumed.delete(slot)){if(review)review.ready=true;return true;}
    if(review&&review.owner===port){
        if(down){consumed.add(slot);if(review.ready){if(slot===0)review=null;else if(slot>=1&&slot<=3)commit(slot-1);appState.dirty=true;}}
        return true;
    }
    if(!down)return false;
    if(key==='motif_load_write'){consumed.add(slot);prepare(port);return true;}
    // Play the intended target, then touch Target Input to capture it. Turning
    // the knob afterwards fine-tunes the input note without changing the key.
    if(key==='motif_load_target'&&port.performanceTrack!==undefined){
        port.performanceSet('motif_load_capture','Capture');
        const pitch=Number(port.performanceGet('motif_load_target'));
        if(Number.isInteger(pitch)&&pitch>=0&&pitch<=127){port.performanceSet(key,String(pitch));seqToast('Target '+pitchName(pitch));markUiStateDirty();appState.dirty=true;}
    }
    return false;
}
export function motifLoaderTurn(port:PerformancePort,_slot:number,delta:number):boolean {
    if(!review||review.owner!==port)return false;
    review.page=Math.max(0,Math.min(review.labels.length-1,review.page+Math.sign(delta)));appState.dirty=true;return true;
}
export function drawMotifLoader(port:PerformancePort):boolean {
    if(!review)return false;
    if(review.owner!==port||review.track!==appState.activeTrack.index){review=null;return false;}
    fill_rect(0,0,128,64,0);
    fontPrint(1,1,'Motif > Clip '+(review.slot+1),1);
    fontPrint(1,10,'In '+review.target+'  '+Number((review.duration/384).toFixed(2))+' bars  '+review.notes+' notes',1);
    let text=review.labels.slice(review.page).join(' > ');
    fontPrint(1,21,text.slice(0,25),1);fontPrint(1,29,text.slice(25,50),1);
    fontPrint(1,39,'Turn: scroll progression',1);
    ['Cancel',review.occupied?'Replace':'Write','Append','Overdub'].forEach((label,index)=>fontPrint(index*32+1,51,label,1));
    fontPrint(1,59,'Touch knobs 1-4 to choose',1);
    return true;
}
