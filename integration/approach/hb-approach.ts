import type { PerformancePort } from './hb-performance.js';
import { appState } from '../app/state.js';
import { cachedSetAnimLED } from '../seq/led-cache.js';
import { ANIM_NONE } from '../seq/colors.js';
import { seqToast } from '../seq/render.js';
export const APPROACH_CHOICES = ['Chromatic Below','Chromatic Above','Scale Above','Secondary II','Secondary V','Secondary VI','Backdoor II','Backdoor V','Tritone II','Tritone V','Secondary III','Secondary IV','Secondary VII',...Array.from({length:16},(_,index)=>'Motif '+(index+1))];
export const APPROACH_MOTIFS = ['V-Target','ii-V-Target','iv-bVII-Target','bII7-Target','ii-bII7-Target','bVI-bVII-I','bVI-V-I','bIII-IV-I','vi-V-I','iii-vi-ii-V-I','IV-iv-I','ii halfdim-V-i','I-VI7-ii-V-I','V/V-V-I','ii/V-V/V-V-I','V/ii-ii-V-I','V/vi-vi-ii-V-I','vii dim/V-V-I','III7-VI7-II7-V7-I',...Array.from({length:16},(_,index)=>'User '+(index+1))];
let owner: PerformancePort | null = null;
const releases = new Set<number>();
let statusAt = -Infinity, status: number[] = [];
export function syncApproachOwner(next: PerformancePort | null): void {
    if (owner?.performanceTrack === next?.performanceTrack && !!owner === !!next) return;
    owner?.performanceSet('approach_mode_active','0');
    owner=next;owner?.performanceSet('approach_mode_active','1');statusAt=-Infinity;status=[];
}
export function approachStep(data: number[], port: PerformancePort | null): boolean {
    const step=data[1]-16,type=data[0]&0xf0;
    if(step<0||step>=16||(type!==0x80&&type!==0x90))return false;
    const down=type===0x90&&data[2]>0;
    if(!down&&releases.delete(step))return true;
    if(!port)return false;
    if(down&&!releases.has(step)){
        releases.add(step);port.performanceSet('approach_trigger',String(step+1));
        statusAt=-Infinity;seqToast('Motif '+(step+1)+' · play target');appState.dirty=true;
    }
    return true;
}
export function paintApproach(port: PerformancePort | null): boolean {
    if(!port)return false;
    const now=Date.now();
    if(now<statusAt||now-statusAt>=50){status=port.performanceGet('approach_row_status').split(',').map(Number);statusAt=now;}
    for(let step=0;step<16;step++){
        const color=status[4]===step?13:releases.has(step)?120:22;
        cachedSetAnimLED(16+step,color,color,ANIM_NONE);
    }
    return true;
}
export function paintApproachKnobs(port: PerformancePort, keys: (string | null)[]): boolean {
    if(!keys.some(key=>/^approach_knob_/.test(key ?? '')))return false;
    const down=status[3]||0;
    for(let knob=0;knob<8;knob++){
        const color=down&(1<<knob)?120:(status[5]||0)&(1<<knob)?13:22;
        cachedSetAnimLED(knob,color,color,ANIM_NONE);cachedSetAnimLED(71+knob,color,color,ANIM_NONE,true);
    }
    return true;
}
export function approachPanels(hierarchy: any, mode: number): void {
    if(mode!==2)return;
    const levels=hierarchy.levels;
    const panel=(name:string,keys:string[],params:any[])=>({name,knobs:keys,params});
    const knobs=Array.from({length:8},(_,index)=>({key:'approach_knob_'+(index+1),name:'Approach '+(index+1),type:'enum',options_as_string:true,options:APPROACH_CHOICES,default:'Motif '+(index+1)}));
    levels.approach_rows=panel('Approach Rows',knobs.map(parameter=>parameter.key),knobs);
    for(let bank=0;bank<2;bank++){
        const params=Array.from({length:8},(_,index)=>({key:'approach_bank_'+(bank*8+index+1),name:'Motif '+(bank*8+index+1),type:'enum',options_as_string:true,options:APPROACH_MOTIFS.map((name,index)=>index<19?'Stock: '+name:name),default:'Stock: '+APPROACH_MOTIFS[bank*8+index]}));
        levels['approach_bank_'+bank]=panel('Motif Bank '+(bank*8+1)+'–'+(bank*8+8),params.map(parameter=>parameter.key),params);
    }
    levels.root.params.unshift({level:'approach_rows'},{level:'approach_bank_0'},{level:'approach_bank_1'});
}
