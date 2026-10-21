/** Movy owns trail presentation; HB supplies onset history and pad targets. */
import { appState } from '../app/state.js';
import { portFor } from '../track/registry.js';
import { paramCell } from './param-vm.js';
import { markUiStateDirty } from './ui-dirty.js';
import { TrailHistory, TrailSettings, TRAIL_EXPONENTS } from './trail-history.js';

const percentages=Array.from({length:21},(_,index)=>`${index*5}%`);
const decayIndices=[8,9,10,-1,12,13];
const specs = [
    ['TRAILS','Played Target Trails',['Off','On'],0],
    ['MATCH','Match Sounding Target',['Pitch','Pitch Class'],0],
    ['WINDOW','History Window',['Current Chord','Previous + Current','Infinite','1/4 Beat','1/2 Beat','1 Beat','2 Beats','4 Beats','8 Beats','16 Beats','32 Beats','64 Beats'],0],
    ['BEATS','Rolling Window Beats',['1/4','1/2','1','2','4','8','16','32','64'],4],
    ['COLOR','Trail Color',['Blue','Cyan','Purple','Red','Green','White'],0],
    ['LEVEL','Trail Strength',['25%','50%','75%','100%'],3],
    ['PULSE','Trail Pulse',['Off','1/4','1/2','1','2','4','8'],0],
    ['DECAY','Intensity Decay',['None','Linear','Exponential'],0],
    ['BEATS','Half-life / Linear Duration',['1/4','1/2','1','2','4','8','16','32','64'],4],
    ['CURVE','Exponential Curve',['0.5','1','2','4'],1],
    ['APPR','Trails on Approach Rows',['Off','On'],1],
    ['FADE','Trail Fade Style',['Dim Trail','Blend into Background'],0],
    ['START','Single-hit Trail Start',percentages,16],
    ['FLOOR','Trail Brightness Floor',percentages,6],
] as const;
const beats=[.25,.5,1,2,4,8,16,32,64];
let choices:number[]=specs.map(spec=>spec[3]);
export const trailHistory=new TrailHistory();
let cachedStyle:{settings:TrailSettings;color:number;pulse:number;approachRows:boolean;blend:boolean}|undefined;
export function trailEnabled():boolean{return choices[0]===1;}
export function trailStyle():{settings:TrailSettings;color:number;pulse:number;approachRows:boolean;blend:boolean}{
    if(cachedStyle)return cachedStyle;
    return cachedStyle={settings:{floor:choices[11]===1?0:choices[13]/20,peak:choices[12]/20,scope:choices[1]?'pitch-class':'pitch',window:choices[2]>2?'beats':(['chord','previous-chord','infinite'] as TrailSettings['window'][])[choices[2]],windowBeats:beats[Math.max(0,choices[2]-3)],strength:(choices[5]+1)/4,curve:(['none','linear','exponential'] as TrailSettings['curve'][])[choices[7]],decayBeats:beats[choices[8]],exponent:TRAIL_EXPONENTS[choices[9]]},approachRows:choices[10]===1,blend:choices[11]===1,color:[125,16,23,127,126,120][choices[4]],pulse:[0,.25,.5,1,2,4,8][choices[6]]};
}
export function trailSettingsSnapshot():number[]{return choices.slice();}
export function restoreTrailSettings(value:unknown):void{
    cachedStyle=undefined;
    if(Array.isArray(value)&&value.length<12){const old=value;const migrated=old.slice();migrated[2]=[2,3+(old[3]??4),0,1][old[2]??2];value=migrated;}
    choices=specs.map((spec,index)=>Array.isArray(value)&&Number.isInteger(value[index])&&value[index]>=0&&value[index]<spec[2].length?value[index]:spec[3]);
    choices[13]=Math.min(choices[13],choices[12]);
    trailHistory.clear();
}
export function trailSettingsCells(page:number,touched:number):any[]{
    const indices=page===2?[0,1,2,11,4,5,6,7]:decayIndices;
    const cells:any[]=indices.map((index,knob)=>{
        if(index<0)return paramCell({shortName:'CLEAR',fullName:'Tap to clear track history',trigger:touched===knob?'fired':'armed',displayValue:'Tap',normalizedValue:0,touched:touched===knob});
        const [shortName,title,rawOptions]=specs[index],selected=choices[index];
        const fullName=index===8?(choices[7]===2?'Half-life (beats)':'Decay Duration (beats)'):title;
        const options=index===8?rawOptions.map(value=>value+' beats'):rawOptions;
        const cell=paramCell({shortName,fullName,type:'enum',options:[...options],isLongEnum:true,enumIndex:selected,displayValue:index===8?rawOptions[selected]+'b':options[selected],normalizedValue:selected/(options.length-1)});
        cell.touched=touched===knob;return cell;
    });
    while(cells.length<8)cells.push(null);return cells;
}
export function trailSettingsTurn(page:number,knob:number,delta:number):void{
    if(page===3&&knob===3)return;
    const index=page===2?[0,1,2,11,4,5,6,7][knob]:decayIndices[knob];if(index===undefined||index<0||index>=specs.length)return;
    cachedStyle=undefined;
    choices[index]=Math.max(0,Math.min(specs[index][2].length-1,choices[index]+delta));
    if(index===12)choices[13]=Math.min(choices[13],choices[12]);
    if(index===13)choices[13]=Math.min(choices[13],choices[12]);
    markUiStateDirty();appState.dirty=true;
}

export function clearTrailHistory():void{
    portFor(appState.activeTrack.index).setParam('midi_fx1:trail_clear','1');
    trailHistory.clear();appState.dirty=true;
}
