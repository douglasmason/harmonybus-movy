/** Movy owns trail presentation; HB supplies onset history and pad targets. */
import { appState } from '../app/state.js';
import { portFor } from '../track/registry.js';
import { paramCell } from './param-vm.js';
import { markUiStateDirty } from './ui-dirty.js';
import { TrailHistory, TrailSettings, TRAIL_EXPONENTS } from './trail-history.js';

const specs = [
    ['TRAILS','Played Target Trails',['Off','On'],0],
    ['MATCH','Match Sounding Target',['Pitch','Pitch Class'],0],
    ['WINDOW','History Window',['Infinite','Rolling Beats','Current Chord','Previous + Current'],0],
    ['BEATS','Rolling Window Beats',['1/4','1/2','1','2','4','8','16','32','64'],4],
    ['COLOR','Trail Color',['Blue','Cyan','Purple','Red','Green','White'],0],
    ['STRENGTH','Trail Strength',['25%','50%','75%','100%'],3],
    ['PULSE','Trail Pulse',['Off','1/4','1/2','1','2','4','8'],0],
    ['DECAY','Intensity Decay',['None','Linear','Exponential'],2],
    ['DURATION','Half-life / Linear Duration',['1/4','1/2','1','2','4','8','16','32','64'],4],
    ['CURVE','Exponential Curve',['0.5','1','2','4'],1],
] as const;
const beats=[.25,.5,1,2,4,8,16,32,64];
let choices:number[]=specs.map(spec=>spec[3]);
export const trailHistory=new TrailHistory();
let cachedStyle:{settings:TrailSettings;color:number;pulse:number}|undefined;
export function trailEnabled():boolean{return choices[0]===1;}
export function trailStyle():{settings:TrailSettings;color:number;pulse:number}{
    if(cachedStyle)return cachedStyle;
    return cachedStyle={settings:{scope:choices[1]?'pitch-class':'pitch',window:(['infinite','beats','chord','previous-chord'] as TrailSettings['window'][])[choices[2]],windowBeats:beats[choices[3]],strength:(choices[5]+1)/4,curve:(['none','linear','exponential'] as TrailSettings['curve'][])[choices[7]],decayBeats:beats[choices[8]],exponent:TRAIL_EXPONENTS[choices[9]]},color:[45,37,49,5,21,127][choices[4]],pulse:[0,.25,.5,1,2,4,8][choices[6]]};
}
export function trailSettingsSnapshot():number[]{return choices.slice();}
export function restoreTrailSettings(value:unknown):void{
    cachedStyle=undefined;
    choices=specs.map((spec,index)=>Array.isArray(value)&&Number.isInteger(value[index])&&value[index]>=0&&value[index]<spec[2].length?value[index]:spec[3]);
    trailHistory.clear();
}
export function trailSettingsCells(page:number,touched:number):any[]{
    const indices=page===2?[0,1,2,3,4,5,6,7]:[8,9];
    const cells:any[]=indices.map((index,knob)=>{
        const [shortName,fullName,options]=specs[index],selected=choices[index];
        const cell=paramCell({shortName,fullName,type:'enum',options:[...options],isLongEnum:true,enumIndex:selected,displayValue:options[selected],normalizedValue:selected/(options.length-1)});
        cell.touched=touched===knob;return cell;
    });
    if(page===3)cells.push(paramCell({shortName:'CLEAR',fullName:'Turn to clear this track history',type:'enum',options:['TURN'],enumIndex:0,displayValue:'TURN',normalizedValue:0}));
    while(cells.length<8)cells.push(null);return cells;
}
export function trailSettingsTurn(page:number,knob:number,delta:number):void{
    if(page===3&&knob===2){portFor(appState.activeTrack.index).setParam('midi_fx1:trail_clear','1');trailHistory.clear();appState.dirty=true;return;}
    const index=page===2?knob:knob+8;if(index>=specs.length)return;
    cachedStyle=undefined;
    choices[index]=Math.max(0,Math.min(specs[index][2].length-1,choices[index]+delta));
    markUiStateDirty();appState.dirty=true;
}
