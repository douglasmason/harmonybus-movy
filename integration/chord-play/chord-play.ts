import { fontPrint, fontWidth } from '../font/index.js';
import { preparePart,partModalTouch,partModalActive,cancelPartReview,drawPartReview } from './part-library.js';
import {partParameters,partRead,partWrite,partChoiceFor,partKind,partNativeKey} from './part-controls.js';
import {groupOpen} from '../undo/group.js';
import {undoableEdit} from '../undo/edit.js';
import {recordParamOp,recordUiOp} from '../undo/record.js';
import { returnPreviousInputView } from './router-buttons.js';
import { sharedPanel } from './shared-panel.js';
const followPanel=sharedPanel();
import {TouchSequence} from './touch-sequence.js';
const queuePhrase=new TouchSequence<number>();
function beginQueuePhrase(control:number,index:number):void {
    if(!setup.playMode)return;
    if(!queuePhrase.active)send('chord_queue','begin,'+conductorTrackForQueue());
    queuePhrase.begin(control,index);
}
function endQueuePhrase(length:number):void {
    const phrase=length>1||portFor(conductorTrackForQueue()).getParam('midi_fx1:chord_queue_depth')==='Touch Phrase';
    send('chord_queue',phrase?'commit':'end');statusCache=null;
}
function conductorTrackForQueue():number {return setup.conductor;}
import {queueFooterText,drawHarmonyFooter} from '../renderer/hb-footer.js';
import {ANIM_PULSE_SLOW} from './colors.js';
/** Chord slots choose conductor harmony; the comp actor owns rhythm and sound. */
import { appState } from '../app/state.js';
import { FOLLOWER_SCALE_NAMES } from '../scale-catalog.js';
import { selectTrack } from '../track/focus.js';
import { portFor } from '../track/registry.js';
import type { TrackPort } from '../track/port.js';
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import {motifLoaderTouch,motifLoaderTurn,drawMotifLoader,motifLoaderActive,cancelMotifLoader} from '../renderer/hb-motif-loader.js';
import {beginHbLaneTouch} from '../renderer/hb-performance.js';
import { beginControlTouch } from '../surfaces/controls.js';
import type { PerformancePort } from '../renderer/hb-performance.js';
import { ownPerformanceTouch, releasePerformanceTouch } from '../renderer/performance-touch.js';
import { drawHeader, drawBankBar } from '../renderer/header.js';
import { seqState } from './state.js';
import { fieldEngineSet, engineReady } from './engine.js';
import { markUiStateDirty } from './ui-dirty.js';
import { cachedSetAnimLED } from './led-cache.js';
import { resetKnobLedCache } from '../renderer/knob-leds.js';
import { chordColor, chordIntents, chordDegrees, intentLabel, parseChordBank, matchesHarmony, type ChordBankStatus } from './chord-colors.js';
import { muteHeld } from './router-buttons.js';
import { seqToast } from './render.js';
import { recToggle } from '../undo/rec-pass.js';
import { settingsActive } from './hb-settings.js';

import {compactChordSettings} from './chord-settings-layout.js';

const send=(key:string,value:string):void=>{if(engineReady())fieldEngineSet(key,value);};
const bankNames=['Home','Parallel','Blues'];
const statusFields=['effective','override','next','handoff','key','editing','relation'];
const statusNames=['Sounding Harmony','Live Override','Recorded Next','Return To Conductor','Sounding Key','Editing Chord','Edit Scale Relation'];
const statusShort=['Sounds','Live','Next','Return','Key','Editing','Scale'];
let statusCache:{at:number;identity:string;values:Record<string,string>}|null=null;
const notes=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const qualities=['Auto','Major','Minor','Dim','Aug','Maj7','Dom7','Min7','Half Dim7','Dim7','MinMaj7','AugMaj7','Dom7b5'];
const forms=['Auto','Power','Triad','Seventh','Ninth','Add9','Sixth','6/9','Eleventh','Thirteenth','Sus2','Sus4','Shell 7','Shell 9','Shell 6/9','Rootless 7','Rootless 9'];
// Shared HB scale indices, presented through the native parameter metadata below.
type Slot={range:number;root:number;quality:number;form:number;policy:number;tonic:number;scale:number;bass:number;intent:number;target:number;enabled:number};
type Setup={playMode:number;directRender:string|null;conductor:number;comp:number;bass:number;bassClip:boolean;source:number;selected:number;colorView:number;slots:Slot[]};
const defaultSlots=():Slot[]=>Array.from({length:21},(_,index)=>({root:0,quality:0,form:0,policy:index>=14?1:3,tonic:0,scale:1,bass:12,intent:index<7?1:index<14?12:13,target:index%7,enabled:1,range:0}));
const fresh=():Setup=>({playMode:0,directRender:null,conductor:0,comp:2,bass:1,bassClip:false,source:0,selected:0,colorView:0,slots:defaultSlots()});
let setup=fresh(),enabled=false,page:SchwungPage|null=null,pageTrack=-1,activeSlot=-1,route='';
let conductorRenders=false,conductorOutput='Off';
let bankStatus:ChordBankStatus|null=null,bankWire='',bankOwner=-1,bankPollAt=-Infinity,bankKnobs=false,bankPageDirty=false,bankUrgentUntil=-Infinity;
const slotPayload=(slot:Slot):string=>[slot.root,slot.quality,slot.form,slot.policy,slot.tonic,slot.scale,slot.bass,slot.intent,slot.target].join(',');
function resetBank():void{statusCache=null;conductorRenders=false;conductorOutput='Off';bankStatus=null;bankWire='';bankOwner=-1;bankPollAt=-Infinity;bankUrgentUntil=-Infinity;bankPageDirty=false;}
function refreshBank():void{
    const now=Date.now(),wire=setup.slots.map(slotPayload).join(';'),owner=setup.conductor;
    const changed=wire!==bankWire||owner!==bankOwner;
    if(!changed&&now>=bankPollAt&&now-bankPollAt<(now<bankUrgentUntil?16:seqState.playing?50:250))return;
    bankPollAt=now;const port=portFor(owner);
    const previousRender=conductorRenders,output=port.getParam('midi_fx1:render_channel');conductorRenders=!!output&&output!=='Off'&&output!=='--';conductorOutput=conductorRenders?output!:'Off';
    if(previousRender!==conductorRenders)bankPageDirty=true;
    if(changed){port.setParam('midi_fx1:hb_chord_bank',wire);bankWire=wire;bankOwner=owner;}
    const raw=port.getParam('midi_fx1:hb_chord_bank_snapshot');if(raw==='--'){bankStatus=null;activeSlot=-1;return;}
    const next=parseChordBank(raw);
    if(next&&JSON.stringify(next)!==JSON.stringify(bankStatus)){bankStatus=next;appState.dirty=true;}
}
export function chordSlotColor(index:number):number{
    const slot=setup.slots[index],status=bankStatus?.slots[index];
    const matching=bankStatus?setup.slots.findIndex((candidate,other)=>candidate.enabled&&matchesHarmony(bankStatus!.slots[other],bankStatus!.active)):-1;
    const selected=bankStatus?(setup.slots[activeSlot]?.enabled&&matchesHarmony(bankStatus.slots[activeSlot],bankStatus.active)?activeSlot:matching):-1;
    return chordColor(status,slot.intent,setup.colorView,index===selected,!!slot.enabled);
}
export function chordSlotQueued(index:number):boolean{return !!setup.playMode&&!!setup.slots[index]?.enabled&&!!bankStatus?.slots[index]?.queued;}
/** Shared defaults are native; slot overrides travel with each selected chord. */
const rangeTouches=new Map<number,{shift:boolean;moved:boolean}>();
const rangeTurns=new Map<number,{at:number;remainder:number;identity:string}>();
function chordEvent(slot:Slot):number[]{return [slot.root,slot.quality,slot.form,slot.policy,slot.tonic,slot.scale,slot.bass,...(slot.intent||slot.range?[slot.intent,slot.target]:[]),...(slot.range?[slot.range]:[])];}
function soundTrack():number {return !chordActive()||setup.source===0&&conductorRenders?conductorTrackForQueue():setup.comp;}
function soundPath():string{return soundTrack()===setup.conductor?'C'+(setup.conductor+1)+'>'+conductorOutput:'Comp T'+(setup.comp+1);}
function defaultRegister():number{const raw=portFor(soundTrack()).getParam('midi_fx1:hb_chord_range_top'),value=Number(raw);return raw!==null&&raw!==''&&Number.isInteger(value)&&value>=0&&value<=127?value:67;}
const topNoteName=(note:number):string=>notes[note%12]+(Math.floor(note/12)-1);
function nextRangeTop(base:number,direction:number,index:number|null):number {
    const native=Number(portFor(soundTrack()).getParam('midi_fx1:hb_chord_range_mask'));
    const mask=native>0&&native<4096?native:index===null?0:bankStatus?.slots[index]?.mask??0;
    for(let candidate=base+direction;candidate>=0&&candidate<=127;candidate+=direction)
        if(!mask||(mask&(1<<(candidate%12))))return candidate;
    return base;
}
function setChordRegister(index:number|null,value:number|null):void {
    if(value!==null&&(!Number.isInteger(value)||value<0||value>127))return;
    const native=portFor(conductorTrackForQueue());
    if(index===null)portFor(soundTrack()).setParam('midi_fx1:chord_register',value===null?(soundTrack()!==conductorTrackForQueue()?'Conductor':'0'):'Top '+value);
    else {const slot=setup.slots[index];slot.range=value===null?0:Math.max(0,Math.min(127,value))+8;native.setParam('midi_fx1:hb_chord_range',chordEvent(slot).join(','));setup.selected=index;}
    statusCache=null;bankPollAt=-Infinity;markUiStateDirty();appState.dirty=true;
    const range=value===null?'Default':'Top '+topNoteName(value);
    seqToast((index===null?'All chords':bankStatus?.slots[index]?.name??'Chord')+' '+range);
}
function rangeControlMidi(data:number[],surface:SchwungPage|null):boolean {
    if(!surface||surface.ctl.hbNavigation?.isMenu())return false;
    const type=data[0]&240,control=data[1],value=data[2],turn=type===176&&control>=71&&control<=78;
    const knob=turn?control-71:control;if(knob<0||knob>7)return false;
    const key=surface.keyAt(knob)??'',match=/^cp_slot_(\d+)$/.exec(key);
    if(!match&&key!=='cp_off')return false;
    const index=match?Number(match[1]):null,down=type===144&&value>0,up=type===128||(type===144&&!value),now=Date.now();
    if(turn){
        const touched=rangeTouches.get(knob);if(touched)touched.moved=true;
        const raw=value<64?value:value-128,identity=(surface.ctl.page?.level??'')+':'+key+':'+soundTrack();
        const previous=rangeTurns.get(knob);
        let remainder=previous&&previous.identity===identity&&now-previous.at<500&&Math.sign(previous.remainder)===Math.sign(raw)?previous.remainder:0;
        remainder+=Math.max(-4,Math.min(4,raw));
        const steps=Math.trunc(remainder/4);remainder-=steps*4;
        rangeTurns.set(knob,{at:now,remainder,identity});
        if(steps){const range=index===null?0:setup.slots[index].range,base=range>=8?range-8:defaultRegister(),next=nextRangeTop(base,Math.sign(steps),index);if(next!==base)setChordRegister(index,next);}
        return true;
    }
    if(down){rangeTouches.set(knob,{shift:appState.shiftHeld,moved:now-(rangeTurns.get(knob)?.at??-Infinity)<180});return index===null||appState.shiftHeld;}
    if(up){const touch=rangeTouches.get(knob);rangeTouches.delete(knob);
        if(touch&&!touch.moved&&now-(rangeTurns.get(knob)?.at??-Infinity)>=180){if(touch.shift)setChordRegister(index,null);else if(index===null)harmonyOff();}
        return index===null||!!touch?.shift;
    }
    return false;
}
let styleTouch:{key:number;control:string;moved:boolean}|null=null;
const touches=new Map<number,SchwungPage>(),steps=new Set<number>(),controls=new Set<number>();
const performanceOwners=new Map<number,PerformancePort>();
function performanceOwner(track:number):PerformancePort{
    let owner=performanceOwners.get(track);
    if(!owner){const native=portFor(track);owner={performanceTrack:track,performanceGet:key=>native.getParam('midi_fx1:'+key)??'',performanceSet:(key,value)=>{native.setParam('midi_fx1:'+key,value);}};performanceOwners.set(track,owner);}
    return owner;
}
export const chordEnabled=():boolean=>enabled;
export const chordActive=():boolean=>enabled&&!seqState.sessionMode;
/** The native conductor queue is the one authoritative live loop.
 * A mode or melody-track change relinquishes only UI ownership. */
export function chordQueueOwned():boolean {
    return (portFor(setup.conductor).getParam('midi_fx1:hb_chord_queue_status')??'').startsWith('cq1|');
}

export function chordSnapshot():Setup{return {...setup,slots:setup.slots.map(slot=>({...slot}))};}
export function restoreChord(value:unknown):void{
    setChordEnabled(false);setup=fresh();
    if(value&&typeof value==='object'){
        const input=value as Partial<Setup>;
        if(typeof input.directRender==='string'&&/^(Off|[1-9]|1[0-6])$/.test(input.directRender))setup.directRender=input.directRender;
        for(const key of ['conductor','comp','bass','source','selected','colorView'] as const){const number=input[key];if(Number.isInteger(number)&&number!>=0&&number!<=(key==='source'?2:key==='colorView'?2:key==='selected'?20:15))setup[key]=number!;}
        setup.playMode=input.playMode===1?1:0;
        setup.bassClip=input.bassClip===true;
        if(setup.comp===setup.conductor)setup.comp=setup.conductor===2?3:2;
        if([setup.conductor,setup.comp].includes(setup.bass))setup.bass=Array.from({length:16},(_,index)=>index).find(track=>![setup.conductor,setup.comp].includes(track))!;
        setup.slots=setup.slots.map((slot,index)=>{const saved=input.slots?.[index];if(saved&&typeof saved==='object'&&saved.intent===undefined){slot.intent=0;slot.target=0;}if(saved&&typeof saved==='object')for(const key of Object.keys(slot) as (keyof Slot)[]){const number=saved[key],limit=key==='quality'||key==='bass'?12:key==='form'?16:key==='policy'?3:key==='scale'?FOLLOWER_SCALE_NAMES.length:key==='target'?6:key==='enabled'?1:key==='range'?135:key==='intent'?13:11;if(Number.isInteger(number)&&number>=0&&number<=limit&&(key!=='scale'||number>=1))slot[key]=number;}return slot;});
    }
    page=null;route='';resetBank();
}
export function releaseChordTouches():void{
    if(queuePhrase.active)endQueuePhrase(queuePhrase.length);queuePhrase.cancel();rangeTouches.clear();rangeTurns.clear();
    cancelPartReview();cancelMotifLoader(performanceOwner(setup.conductor));styleTouch=null;
    for(const [slot,owner] of touches)if(!releasePerformanceTouch(slot,true))owner.knobTouch(slot,false);
    for(const slot of controls)releasePerformanceTouch(slot,true);
    touches.clear();steps.clear();controls.clear();
}
export function setChordEnabled(value:boolean):void{
    if(enabled===value)return;
    // Controller visibility does not imply Harmony Off. A live conductor queue
    // remains audible when its UI is hidden or track focus moves.
    const continuing=!value&&(setup.playMode===1||chordQueueOwned());
    releaseChordTouches();resetBank();resetKnobLedCache();
    if(!value&&bankKnobs){for(let knob=0;knob<8;knob++){cachedSetAnimLED(knob,0,0,0);cachedSetAnimLED(71+knob,0,0,0,true);}bankKnobs=false;}
    if(!value&&!continuing)send('chord_select','off');
    enabled=value;activeSlot=-1;route='';
    if(value&&[setup.conductor,setup.comp,setup.bass].includes(appState.activeTrack.index))
        selectTrack(Array.from({length:16},(_,index)=>(index+3)%16).find(track=>![setup.conductor,setup.comp,setup.bass].includes(track))!);
    if(!value&&!continuing)send('chord_route','off');
    page=null;appState.dirty=true;
}
export function selectChordSlot(index:number):void{
    if(!chordActive()||!engineReady()||!Number.isInteger(index)||index<0||index>=setup.slots.length)return;
    const slot=setup.slots[index];if(!slot.enabled)return;setup.selected=index;if(!setup.playMode)activeSlot=index;
    send(setup.playMode?'chord_queue':'chord_select',[setup.conductor,...chordEvent(slot)].join(','));
    statusCache=null;bankPollAt=-Infinity;bankUrgentUntil=Date.now()+100; // Refresh accepted harmony on the next frame, not after the idle poll interval.
    if(setup.playMode)seqToast('Queued '+performanceStatus('queue_count')+' / '+performanceStatus('queue_next'));
    markUiStateDirty();appState.dirty=true;
}
const enumeration=(key:string,name:string,options:string[])=>({key,name,type:'enum',options,options_as_string:true,default:options[0]});
const actorPanels=():[string,number,string[]][]=>[
    ['Conductor',setup.conductor,['follower_touch','operations_9_16','motion_operation','motif_play','motif_global','motif_load','motif_targets','global_transpose','explicit_key','secondary_scale','chord_forms','rhythm_generate','rhythm_edit']],
    ['Sound',soundTrack(),['chord_player','arp_player']],
    ['Comp',setup.comp,['chord_forms','follower_source','follower_play','rhythm_generate','rhythm_edit','motif_global','motion_operation','motion_timing','motion_conditions']],
    ['Melody',appState.activeTrack.index,['follower_source','follower_play','track_scales','chord_player','arp_player','follower_touch','operations_9_16','motion_operation','motion_timing','motion_conditions']]
];
function parameters(native:any[]):any[]{
    const scale=native.find(parameter=>parameter.key==='key_center_explicit_scale')?.options??['Major','Natural Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian'];
    return [enumeration('cp_play_mode','Chord Selection',['Immediate','Queued']),...['current','next','count'].map(field=>({key:'cp_queue_'+field,name:field==='count'?'Queue Status':field==='next'?'Queued Next':'Current Chord',type:'string',readOnly:true,access:'read'})),...statusFields.map((field,index)=>({key:'cp_status_'+field,name:statusNames[index],short_name:statusShort[index],type:'string',readOnly:true,access:'read'})),...partParameters(native),...Array.from({length:7},(_,index)=>({key:'cp_blank_'+index,name:' ',type:'string',readOnly:true})),{key:'cp_off',name:'Range / Tap Off',short_name:'Range',type:'int',min:-3,max:3,step:1,default:0},{key:'cp_reset',name:'Reset Chords',type:'string',readOnly:true},enumeration('cp_conductor','Conductor Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_bass_track','Bass Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_bass_source','Bass Input',['Existing Routing','Bass Clip']),enumeration('cp_comp','Comp Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_melody','Playing Track',Array.from({length:16},(_,index)=>String(index+1))),enumeration('cp_source','Comp Input',['Conductor / Melody','Comp Clip','Follow Melody']),enumeration('cp_selected','Edit Chord',Array.from({length:21},(_,index)=>String(index+1))),enumeration('cp_colorView','Color By',['Quality + Scale','Intent + Scale','Scale Only']),enumeration('cp_intent','Chord Intent',chordIntents),enumeration('cp_target','Target Degree',chordDegrees),enumeration('cp_enabled','Chord Enabled',['Off','On']),{key:'cp_resolved',name:'Resolved Chord',type:'string',readOnly:true},{key:'cp_relation',name:'Scale Relation',type:'string',readOnly:true},
        enumeration('cp_root','Literal Root',notes),enumeration('cp_quality','Quality',qualities),enumeration('cp_form','Form',forms),enumeration('cp_policy','Scale Context',['Parent','Minimum Change','Explicit','Harmony Rules']),enumeration('cp_tonic','Scale Tonic',notes),enumeration('cp_scale','Scale',scale),enumeration('cp_bass','Bass',['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B','Root']),
        ...setup.slots.map((slot,index)=>enumeration('cp_slot_'+index,String(index+1),slot.intent?chordDegrees.map((_,degree)=>intentLabel(slot.intent,degree)):notes.flatMap(root=>qualities.map(quality=>root+' '+quality))))];
}
function alias(key:string):{track:number;key:string}|null{const match=/cp_track_(\d+)_/.exec(key);return match?{track:Number(match[1]),key:key.replace(match[0],'')}:null;}
export function chordPanelPort(track:number):TrackPort{
    const native=portFor(track);let metadata:any[]=[];
    const getParam=(key:string):string|null=>{
        const target=alias(key);if(target)return portFor(target.track).getParam(target.key);
        const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
        if(bare==='chain_params'){
            const text=native.getParam(key);if(!text)return text;
            const source=JSON.parse(text);metadata=parameters(source);
            metadata.push({key:'cp_sound_path',name:'Sound Owner / Output',short_name:'Sounds',type:'string',readOnly:true,access:'read'});
            for(const entry of metadata){
                const shortNames:Record<string,string>={cp_conductor:'Cond',cp_bass_track:'Bass',cp_comp:'Comp',cp_melody:'Mel',cp_bass_source:'Bass In',cp_colorView:'Color',cp_reset:'Reset'};
                if(shortNames[entry.key])entry.short_name=shortNames[entry.key];
                if(entry.key==='cp_melody')entry.name='Melody Track';
                if(entry.key==='cp_reset'){entry.type='int';entry.min=0;entry.max=1;entry.access='write';delete entry.readOnly;}
                if(entry.key==='cp_off'){entry.type='string';entry.readOnly=true;}
                if(entry.key==='cp_source'){entry.name='Chord Sound Source';entry.short_name='Source';}
                if(/^[cb]p_gate$/.test(entry.key)){entry.name='Stored Clip Note Length %';entry.short_name='Length';}
                if(/^[cb]p_register$/.test(entry.key)){entry.name='Stored Clip Pitch Shift';entry.short_name='Shift';}
            }
            const levels=JSON.parse(native.getParam('midi_fx1:ui_hierarchy')??'{"levels":{}}').levels;
            const aliases=actorPanels().filter(([name])=>name!=='Melody').flatMap(([,owner,panels])=>{
                const keys=new Set(['key_center','parallel_mode','dominant_color','chord_timing','anticipation','chord_queue_depth','chord_queue_end',...panels.flatMap(panel=>[...(levels[panel]?.knobs??[]),...(levels[panel]?.params??[]).map((item:any)=>item.key).filter(Boolean)])]);
                return source.filter((entry:any)=>keys.has(entry.key)).map((entry:any)=>({...entry,...(entry.key==='chord_timing'?{name:'Queue Time',short_name:'Time'}:{}),key:'cp_track_'+owner+'_'+entry.key}));
            });
            return JSON.stringify([...source,...metadata,...aliases]);
        }
        const meta=metadata.find(entry=>entry.key===bare);
        if(!meta)return native.getParam(key);
        if(key.endsWith(':modulated'))return '0';
        const slot=setup.slots[setup.selected];
        if(bare.startsWith('cp_blank_'))return '';
        if(bare==='cp_play_mode')return setup.playMode?'Queued':'Immediate';
        if(bare.startsWith('cp_queue_'))return performanceStatus(bare.slice(3));
        if(bare.startsWith('cp_status_'))return performanceStatus(bare.slice(10));
        if(bare==='cp_off')return topNoteName(defaultRegister());
        if(bare==='cp_sound_path')return soundPath();
        const partValue=partRead(bare,partOwner(bare));if(partValue!==null)return partValue;
        if(bare==='cp_reset')return 'Tap';
        if(bare==='cp_resolved')return bankStatus?.slots[setup.selected]?.name??'--';
        if(bare==='cp_relation')return !slot.enabled?'Off':bankStatus?(bankStatus.slots[setup.selected]?.chromatic?'Chromatic':'Diatonic'):'--';
        let value=bare==='cp_colorView'?setup.colorView:bare==='cp_melody'?appState.activeTrack.index:bare==='cp_conductor'?setup.conductor:bare==='cp_comp'?setup.comp:bare==='cp_bass_track'?setup.bass:bare==='cp_bass_source'?Number(setup.bassClip):bare==='cp_source'?setup.source:bare==='cp_selected'?setup.selected:slot[bare.slice(3) as keyof Slot];
        if(bare==='cp_scale')value--;
        if(bare.startsWith('cp_slot_')){const bank=setup.slots[Number(bare.slice(8))];value=bank.intent?bank.target:bank.root*13+bank.quality;}
        return meta.options[value]??meta.options[0];
    };
    const setParam=(key:string,value:string):boolean=>{
        const target=alias(key);if(target){statusCache=null;return portFor(target.track).setParam(target.key,value);}
        const bare=key.split(':').pop()??'';const partResult=partWrite(bare,value,partOwner(bare));if(partResult!==null)return partResult;
        const meta=metadata.find(entry=>entry.key===bare);
        if(!meta)return native.setParam(key,value);
        if(bare==='cp_reset')return true; // The owned touch below fires this action once.
        if(bare==='cp_off'){setChordRegister(null,Number(value));return true;}
        if(!meta.options)return false;
        const selected=meta.options.indexOf(value);if(selected<0)return false;
        if(bare==='cp_play_mode'){if(selected!==setup.playMode){send('chord_queue','off');setup.playMode=selected;statusCache=null;markUiStateDirty();appState.dirty=true;}return true;}
        if(['cp_melody','cp_comp','cp_conductor','cp_bass_track'].includes(bare)){
            const assignments={cp_melody:appState.activeTrack.index,cp_comp:setup.comp,cp_conductor:setup.conductor,cp_bass_track:setup.bass};
            const others=Object.entries(assignments).filter(([key])=>key!==bare).map(([,track])=>track);
            if(others.includes(selected)){seqToast('Choose distinct tracks');return false;}
            releaseChordTouches();
            // A track assignment is not a new performance. The native
            // single-owner queue changes conductor on the first new chord.
            if(setup.playMode!==1&&!chordQueueOwned())send('chord_select','off');
            activeSlot=-1;
            if(bare==='cp_melody')selectTrack(selected);else setup[bare==='cp_comp'?'comp':bare==='cp_bass_track'?'bass':'conductor']=selected;
            page=null;route='';
        }else if(bare==='cp_bass_source'){setChordBassClip(selected===1);}
        else if(bare==='cp_source'){setChordCompSource(selected);}
        else if(bare==='cp_selected')setup.selected=selected;
        else if(bare==='cp_colorView')setup.colorView=selected;
        else if(bare==='cp_intent'){const slot=setup.slots[setup.selected];slot.intent=selected;if(selected){slot.quality=0;slot.policy=3;}bankPageDirty=true;}
        else if(bare.startsWith('cp_slot_')){const index=Number(bare.slice(8));setup.selected=index;if(setup.slots[index].intent)setup.slots[index].target=selected;else{setup.slots[index].root=Math.floor(selected/13);setup.slots[index].quality=selected%13;}}
        else setup.slots[setup.selected][bare.slice(3) as keyof Slot]=selected+(bare==='cp_scale'?1:0);
        markUiStateDirty();appState.dirty=true;return true;
    };
    return {track:native.track,bulkReads:native.bulkReads,getParam,setParam,
        getMany:(keys,allowFallback)=>{
            const values:(string|null)[]=Array(keys.length).fill(null),groups=new Map<number,{keys:string[];indices:number[]}>();
            keys.forEach((key,index)=>{
                const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
                const partKey=partNativeKey(bare);
                const target=alias(key)??(partKey?{track:partOwner(bare),key:'midi_fx1:'+partKey+(key.endsWith(':base')?':base':key.endsWith(':modulated')?':modulated':'')}:null);
                if(!target&&/:(cp|bp)_/.test(key)){values[index]=getParam(key);return;}
                const owner=target?.track??track,group=groups.get(owner)??{keys:[],indices:[]};
                group.keys.push(target?.key??key);group.indices.push(index);groups.set(owner,group);
            });
            for(const [owner,group] of groups){const read=portFor(owner).getMany(group.keys,allowFallback);group.indices.forEach((index,offset)=>values[index]=read[offset]??null);}
            return values;
        },setMany:pairs=>pairs.every(([key,value])=>setParam(key,value)),
        setParamTimeout:(key,value)=>setParam(key,value),sendMidi:(status,pitch,velocity)=>native.sendMidi(status,pitch,velocity)};
}
export function chordHierarchy(hierarchy:any):any{
    const levels=hierarchy.levels,links:any[]=[];
    const add=(key:string,name:string,knobs:string[]):void=>{levels[key]={name,knobs,params:knobs.map(key=>({key}))};links.push({level:key});};
    for(let bank=0;bank<3;bank++)add('cp_bank_'+bank,bankNames[bank]+(bank===2?' Dominants':' Chords'),[...Array.from({length:7},(_,index)=>'cp_slot_'+(bank*7+index)),'cp_off']);
    add('cp_scale_controls','Scale Operations',['cp_track_'+setup.conductor+'_key_center','cp_track_'+setup.conductor+'_parallel_mode','cp_track_'+setup.conductor+'_dominant_color']);
    add('cp_edit','Chord Editor',['cp_selected','cp_intent','cp_target','cp_root','cp_quality','cp_form','cp_bass']);
    add('cp_edit_scale','Chord Scale Context',['cp_policy','cp_tonic','cp_scale','cp_enabled','cp_resolved','cp_relation']);
    add('cp_overview','Harmony Overview',statusFields.map(field=>'cp_status_'+field));
    for(const [name,track,panels] of actorPanels()){
        for(const source of panels){const original=levels[source];if(!original)continue;
            const key='cp_'+name+'_'+source,remap=(key:string)=>name==='Melody'?key:'cp_track_'+track+'_'+key;
            const knobs=(original.knobs??[]).filter((key:string)=>source!=='motif_load'||key!=='motif_load_even').map(remap);
            // Every surfaced control is a live alias into its owner, including defaults.
            levels[key]={...original,name:(name==='Sound'?'Sound '+(track===conductorTrackForQueue()?'Cond':'Comp')+' T'+(track+1):name)+' '+original.name,visible_if:undefined,knobs,params:(original.params??[]).filter((item:any)=>item.key).map((item:any)=>({...item,key:remap(item.key)}))};links.push({level:key});
        }
    }
    const sound=soundTrack(),soundKey=(key:string)=>'cp_track_'+sound+'_'+key;
    add('cp_Sound_output','Sound '+(sound===setup.conductor?'Cond':'Comp')+' T'+(sound+1)+' Output',
        ['cp_source','cp_sound_path','cp_velocity','cp_form_live',soundKey('chord_register'),soundKey('chord_voicing'),soundKey('chord_inversion')]);
    // Three coherent sound pages, all addressing the same sounding owner.
    const chords=levels.cp_Sound_chord_player,arp=levels.cp_Sound_arp_player;
    if(chords&&arp){
        chords.knobs=chords.knobs.filter((key:string)=>!['chord_register','chord_voicing','chord_inversion'].map(soundKey).includes(key));
        chords.knobs.push(...arp.knobs.filter((key:string)=>['arp_playback','arp_hold'].map(soundKey).includes(key)));
        arp.knobs=arp.knobs.filter((key:string)=>!['arp_playback','arp_hold'].map(soundKey).includes(key));
    }
    add('cp_comp_library','Comp Library',['cp_style','cp_load','cp_save','cp_user','cp_mapping','cp_gate','cp_register']);
    add('cp_bass_library','Bass Library',['bp_style','bp_velocity','bp_gate','bp_register','bp_mapping','bp_user','bp_save']);
    add('cp_setup','Chord Play Setup',['cp_conductor','cp_bass_track','cp_comp','cp_melody','cp_bass_source','cp_colorView','cp_reset']);
    const rootKeys=['cp_play_mode','cp_track_'+setup.conductor+'_chord_timing','cp_track_'+setup.conductor+'_anticipation','cp_track_'+setup.conductor+'_chord_queue_end','cp_queue_next','cp_queue_count','cp_track_'+setup.conductor+'_chord_queue_depth','cp_off'];
    compactChordSettings(levels,links);
    levels.cp_comp_library.name='Comp T'+(setup.comp+1)+' Clip';
    levels.cp_bass_library.name='Bass T'+(setup.bass+1)+' Clip';
    links.unshift(...links.splice(links.findIndex(link=>link.level==='cp_Sound_output'),1));
    levels.root={name:'Chord Play',knobs:rootKeys,params:[...rootKeys.map(key=>({key})),...links]};
    const retained=new Set(['root',...links.map(link=>link.level)]);
    for(const key of Object.keys(levels))if(!retained.has(key))delete levels[key];
    return hierarchy;
}
export function chordPage():SchwungPage{
    const track=appState.activeTrack.index;
    if(!page||pageTrack!==track){releaseChordTouches();pageTrack=track;page=createSchwungPage(chordPanelPort(track),'midi_fx1',{harmonyMode:3,hierarchy:chordHierarchy});}
    return followPanel(page);
}
export function tickChord():void{
    if(!chordActive())return;
    const melody=appState.activeTrack.index;
    if(melody===setup.comp||melody===setup.conductor||melody===setup.bass){setChordEnabled(false);seqToast('Choose distinct tracks');return;}
    refreshBank();
    if(setup.playMode)performanceStatus('queue_snapshot');
    const followMelody=setup.source===2||(setup.source===0&&!conductorRenders);
    const next=[melody,setup.comp,followMelody?1:setup.source===0&&conductorRenders?2:0].join(',')+(setup.bassClip?','+setup.bass:'');
    if(next!==route){send('chord_route',next);route=next;}
    if(bankPageDirty&&!touches.size&&!controls.size&&!steps.size&&!rangeTouches.size&&!queuePhrase.active){const current=chordPage(),level=current.ctl.page?.level,index=current.pageIndex,navigation=current.ctl.hbNavigation?.state();current.reload();const next=current.ctl.pages.findIndex((entry:any)=>entry.level===level);current.goToPage(next<0?index:next);current.ctl.hbNavigation?.restore(navigation);bankPageDirty=false;}
    if(page&&bankStatus)for(let index=0;index<setup.slots.length;index++){const meta=page.ctl.state.metaIndex.get('cp_slot_'+index);if(meta&&bankStatus.slots[index]){meta.label=meta.name=(index+1)+' '+bankStatus.slots[index].name;meta.short_name=meta.name;}}
    if(!settingsActive()){
        const current=chordPage(),values=()=>JSON.stringify((current.ctl.page?.keys??[]).map((key:string)=>current.ctl.state.values[key]));
        const before=values();if(current.needsTouchPaint)appState.dirty=true;
        current.tick();if(values()!==before)appState.dirty=true;
    }
}
export function chordRecordCommand():string|null{return chordActive()?'jrec '+((1<<setup.conductor)|(1<<appState.activeTrack.index))+' '+(1<<setup.conductor):null;}
export function chordMidi(data:number[],panels=true):boolean{
    const status=data[0]&240,key=data[1],value=data[2],down=status===144&&value>0,up=status===128||(status===144&&!value);
    if(up&&queuePhrase.owns(key)){const phrase=queuePhrase.release(key);if(phrase!==null)endQueuePhrase(phrase.length);steps.delete(key);rangeTouches.delete(key);statusCache=null;return true;}
    if(up&&controls.delete(key)){releasePerformanceTouch(key);return true;}
    if(up&&touches.has(key)){
        touches.get(key)!.knobTouch(key,false);touches.delete(key);
        if(styleTouch?.key===key){const load=!styleTouch.moved,styleTouchKey=styleTouch.control;styleTouch=null;if(load){reviewStyle(styleTouchKey);partModalTouch(key,true);partModalTouch(key,false);}}
        return true;
    }
    if(up&&steps.delete(key)){rangeTouches.delete(key);return true;}
    if(!chordActive())return false;
    const conductorOwner=performanceOwner(setup.conductor),conductorTrack=setup.conductor;
    const currentKey=page?.keyAt(key)??'',controlTarget=alias(currentKey);if(rangeControlMidi(data,page))return true;
    if((down||up)&&key<8&&motifLoaderTouch(conductorOwner,controlTarget?.track===setup.conductor?controlTarget.key:null,key,down,()=>chordActive()&&setup.conductor===conductorTrack)){
        if(key===7&&down)harmonyOff();return true;
    }
    if(motifLoaderActive(conductorOwner)){
        if(status===176&&key>=71&&key<=78)motifLoaderTurn(conductorOwner,key-71,value<64?value:value-128);
        else if(status===176&&key===51&&value)cancelMotifLoader(conductorOwner);
        return true;
    }
    if((down||up)&&key>=16&&key<32&&!seqState.loopMode&&!seqState.trackSelectHold&&!appState.shiftHeld&&!muteHeld()){if(down){steps.add(key);const index=stepSlot(key-16);if(index<0)harmonyOff();else selectChordSlot(index);}return true;}
    if(!panels)return false;
    const current=chordPage();
    if((down||up)&&key<8&&partModalTouch(key,down)){if(key===7&&down)harmonyOff();return true;}
    if(partModalActive()&&status===176){if(key===51&&value)cancelPartReview();return true;}
    if((down||up)&&key<8){
        if(key===7)return true;
        if(current.ctl.hbNavigation?.isMenu())return true;
        if(/^(cp|bp)_(load|save)$/.test(current.keyAt(key)??'')){
            if(down){reviewStyle(current.keyAt(key)!);partModalTouch(key,true);}return true;
        }
        if(current.keyAt(key)==='cp_reset'){if(down){touches.set(key,current);current.knobTouch(key,true);current.ctl.state.triggerFiredAt.cp_reset=[Date.now()];resetChordDefaults();}return true;}
        const match=/^cp_slot_(\d+)$/.exec(current.keyAt(key)??'');
        if(match){if(down){steps.add(key);selectChordSlot(Number(match[1]));}return true;}
        const target=alias(current.keyAt(key)??'');
        if(down&&target&&/^motion_control_\d+$/.test(target.key)){controls.add(key);ownPerformanceTouch(key,beginHbLaneTouch(performanceOwner(target.track),Number(target.key.slice(15))-1));return true;}
        if(down&&target&&['key_center','parallel_mode','dominant_color','key_center_apply'].includes(target.key)){
            const owner=performanceOwner(target.track);
            if(target.key==='key_center_apply')owner.performanceSet(target.key,'Apply');
            else {controls.add(key);ownPerformanceTouch(key,beginControlTouch(owner,target.key));}
            return true;
        }
        if(down&&/^(cp|bp)_style$/.test(current.keyAt(key)??''))styleTouch={key,control:current.keyAt(key)!,moved:false};
        if(down){touches.set(key,current);current.knobTouch(key,true);}return true;
    }
    if(status!==176)return false;
    if(key===14||key===62||key===63){if(key===14||value)current.changePage(key===62?-1:key===63?1:value<64?value:value-128);appState.dirty=true;return true;}
    if(key===78)return true;
    if(key>=71&&key<=77){if(styleTouch?.key===key-71)styleTouch.moved=true;current.knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if(key===MoveMainButton){if(value)current.click(appState.shiftHeld);return true;}
    if(key===51){if(value&&current.back()?.action==='exit')returnPreviousInputView();return true;}
    if(key===86){if(value)recToggle(setup.conductor);return true;}
    return false;
}
/** Bank LEDs belong to the chord painter, not the generic parameter meter. */
export function chordKnobLEDMask():number{
    if(!chordActive()||settingsActive()||!page)return 0;
    let mask=0;for(let knob=0;knob<8;knob++)if(knob===7||/^cp_slot_/.test(page.keyAt(knob)??''))mask|=1<<knob;
    return mask;
}
export function paintChordSteps():boolean{
    if(!chordActive())return false;
    for(let index=0;index<16;index++){const slot=stepSlot(index),color=slot<0?123:chordSlotColor(slot);cachedSetAnimLED(16+index,color,chordSlotQueued(slot)?0:color,chordSlotQueued(slot)?ANIM_PULSE_SLOW:0);}
    const current=!settingsActive()?page:null;
    const keys=Array.from({length:8},(_,knob)=>current?.keyAt(knob)??null),onBank=keys.some(key=>/^cp_slot_/.test(key??''));
    if(onBank){
        for(let knob=0;knob<8;knob++){const index=knob===7?-1:Number(keys[knob]!.slice(8)),color=index<0?123:chordSlotColor(index);cachedSetAnimLED(knob,color,chordSlotQueued(index)?0:color,chordSlotQueued(index)?ANIM_PULSE_SLOW:0);cachedSetAnimLED(71+knob,color,chordSlotQueued(index)?0:color,chordSlotQueued(index)?ANIM_PULSE_SLOW:0,true);}
    }else if(bankKnobs){
        for(let knob=0;knob<8;knob++)if(!current||!(current.knobLEDMask&(1<<knob))){const color=keys[knob]?123:0;cachedSetAnimLED(knob,color,color,0);cachedSetAnimLED(71+knob,color,color,0,true);}
    }
    cachedSetAnimLED(7,123,123,0);cachedSetAnimLED(78,123,123,0,true);
    bankKnobs=onBank;
    return true;
}
/** Context uses the same slot mapping as the step painter and input handler. */
function contextVisible(current:SchwungPage):boolean {
    const state=current.ctl.state;
    return !(current.ctl.hbNavigation?.isMenu()||state.peek||state.pickerOpen||state.hintLines||state.menuEntered||state.touched>=0);
}
export function chordContextTrail():string|null {
    const current=chordPage();if(!contextVisible(current))return null;
    if(setup.playMode)return queueFooterText(performanceStatus('queue_next'),performanceStatus('queue_count'),performanceStatus('queue_snapshot'));if(current.ctl.page?.level==='root')return 'Touch chords / K8:Off';
    if(current.ctl.page?.level==='cp_overview')return 'Chord>Core K8:Off';
    if((current.ctl.page?.keys??[]).some((key:string)=>/^cp_slot_/.test(key))){
        const first=bankNames[Math.floor(stepSlot(0)/7)],second=bankNames[Math.floor(stepSlot(8)/7)];
        return '1:'+first+' 9:'+second+' OFF8/16';
    }
    if(['cp_edit','cp_edit_scale'].includes(current.ctl.page?.level??''))return 'Chord>Core '+editingChord();
    return null;
}
export function renderChord():void{
    if(drawMotifLoader(performanceOwner(setup.conductor))||drawPartReview())return;
    const current=chordPage();clear_screen();drawHeader(current.pageTitle,'C'+(setup.conductor+1)+' P'+(setup.comp+1)+' M'+(appState.activeTrack.index+1));
    drawBankBar(current.pageIndex,current.pageCount);current.render('Chord Play');
    if(current.ctl.page?.level==='cp_overview'&&contextVisible(current)){
        fill_rect(0,10,128,47,0);
        const live=performanceStatus('override'),handoff=performanceStatus('handoff');
        const lines=['Sounds '+performanceStatus('effective'),'Live '+live+(live==='On'?' / '+handoff:''),'Next '+performanceStatus('next'),'Key '+performanceStatus('key'),'Edit '+editingChord()];
        lines.forEach((line,index)=>printContext(12+index*9,line));
    }
    const trail=chordContextTrail();if(trail){fill_rect(0,57,128,7,0);drawHarmonyFooter(trail);}
}
function printContext(y:number,line:string):void {
    if(fontWidth(line)>126){while(fontWidth(line+'~')>126)line=line.slice(0,-1);line+='~';}
    fontPrint(1,y,line,1);
}
function editingChord():string {
    const index=setup.selected,name=bankStatus?.slots[index]?.name??'--';
    return bankNames[Math.floor(index/7)][0]+(index%7+1)+' '+name.replace(/\//g,':');
}
/** Read existing HB state only while this overview is visible; never infer harmony or timing. */
function performanceStatus(field:string):string {
    if(field==='editing')return editingChord();
    if(field==='relation')return !setup.slots[setup.selected].enabled?'Off':bankStatus?(bankStatus.slots[setup.selected]?.chromatic?'Chromatic':'Diatonic'):'--';
    const now=Date.now(),identity=setup.conductor+':'+appState.activeTrack.index+':'+seqState.playing+':'+setup.playMode;
    if(!statusCache||statusCache.identity!==identity||now<statusCache.at||now-statusCache.at>=100){
        const conductor=portFor(setup.conductor),melody=portFor(appState.activeTrack.index);
        const [active,next]=conductor.getMany(['midi_fx1:hb_chord_active','midi_fx1:next_harmony'],true);
        const [effective,key]=melody.getMany(['midi_fx1:final_harmony','midi_fx1:sounding_key'],true);
        const queue=setup.playMode?(conductor.getParam('midi_fx1:hb_chord_queue_status')??'').split('|'):[];
        const queued=queue[0]==='cq1',count=queued?Number(queue[1]):0;
        const live=active==='1',waiting=queued&&queue[6]==='1',depth=queued?Number(queue[7]):Number(conductor.getParam('midi_fx1:chord_queue_depth'))||2;
        const queueState=!setup.playMode?'Off':waiting||!queued?((queued&&queue[3]!=='--'?'Hold ':'Queue ')+count+(depth?'/'+depth:' Release')):(queue[8]==='1'?'Loop ':'Ready ')+count;
        const snapshot=queue.join('|');if(statusCache?.values.queue_snapshot!==snapshot)appState.dirty=true;
        statusCache={at:now,identity,values:{queue_snapshot:snapshot,queue_current:queued?queue[3]:!seqState.playing&&!live?'Off':effective||'--',queue_next:queued?queue[4]:'--',queue_count:queueState,effective:effective||'--',override:live?'On':active==='0'?'Off':'--',next:queued?queue[4]:seqState.playing?(next||'--'):'--',handoff:queued?queueState:live?(seqState.playing?'Next event':'Off button'):'--',key:key||'--'}};
    }
    return statusCache.values[field]??'--';
}

/** Reset shared definitions only; routing and the selected melody track remain intact. */
export function resetChordDefaults():void{
    harmonyOff();setup.slots=defaultSlots();setup.selected=0;bankPageDirty=true;resetBank();
    markUiStateDirty();appState.dirty=true;seqToast('Chord defaults restored');
}
export function harmonyOff():void{
    queuePhrase.cancel();
    // Clearing musical content never changes the user's Immediate/Queued choice.
    if(bankStatus)for(const slot of bankStatus.slots)slot.queued=false;
    send('chord_select','off');activeSlot=-1;statusCache=null;bankPollAt=-Infinity;bankUrgentUntil=Date.now()+100;appState.dirty=true;
}
function stepSlot(index:number):number{
    if(index%8===7)return -1;
    const keys=page?.ctl.page?.keys??[],first=keys.find((key:string|null)=>/^cp_slot_/.test(key??''));
    const bank=first?Math.floor(Number(first.slice(8))/7):0;
    return ((bank+Math.floor(index/8))%3)*7+index%8;
}

function reviewStyle(key:string):void{
    const kind=partKind(key),choice=partChoiceFor(kind);
    preparePart({kind,track:kind==='bass'?setup.bass:setup.comp,conductor:setup.conductor,activate:()=>kind==='bass'?setChordBassClip(true):setChordCompSource(1)},choice.style,key.endsWith('_save')?choice.user:null);
}
function partOwner(key:string):number{return key.startsWith('bp_')?setup.bass:['cp_velocity','cp_form_live','cp_voicing_live'].includes(key)?soundTrack():setup.comp;}
export function chordCompState():string{return JSON.stringify({source:setup.source,directRender:setup.directRender,bassClip:setup.bassClip});}
export function restoreChordCompState(value:string):void{
    try {const state=JSON.parse(value);if(Number.isInteger(state.source)&&state.source>=0&&state.source<3){setup.source=state.source;setup.bassClip=state.bassClip===true;setup.directRender=typeof state.directRender==='string'?state.directRender:null;route='';markUiStateDirty();}}catch{}
}
export function setChordCompSource(source:number):void{
    const change=():void=>{
        const before=chordCompState(),port=portFor(setup.conductor),key='midi_fx1:render_channel',old=port.getParam(key);
        if(old===null||old==='--')return;
        if(source!==0&&old!=='Off')setup.directRender=old;
        const next=source===0?(setup.directRender??old):'Off';
        if(next!==old){recordParamOp(setup.conductor,key,old,next);port.setParam(key,next);}
        setup.source=source;route='';bankPollAt=-Infinity;
        recordUiOp('chordComp',before,chordCompState());markUiStateDirty();appState.dirty=true;
    };
    if(groupOpen())change();else undoableEdit('COMP INPUT','Chord Play',change);
}

/** Bass clip ownership is local to Chord Play and undone with its loaded clip. */
export function setChordBassClip(value:boolean):void{
    const change=():void=>{
        const before=chordCompState();setup.bassClip=value;route='';
        recordUiOp('chordComp',before,chordCompState());markUiStateDirty();appState.dirty=true;
    };
    if(groupOpen())change();else undoableEdit('BASS INPUT','Chord Play',change);
}
