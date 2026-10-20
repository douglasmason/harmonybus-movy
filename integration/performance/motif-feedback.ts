/* One short, dim confirmation wave. Palette approximation and frame-rate
   limiting affect only display colors, never musical time or MIDI output. */
import { PAD_PALETTE } from '../keyboard/pad-palette.js';
let splash: {track: number; pitch: number; step: number; at: number} | null = null;
const blends=new Map<string,number>();
export function motifSplash(track: number,pitch: number,step: number,now=Date.now()): void {
    splash={track,pitch,step,at:now};
}
export function clearMotifSplash(): void { splash=null; }
export function motifBlend(base: number,accent: number,amount: number): number {
    const level=Math.max(0,Math.min(8,Math.round(amount*8)));
    if(!level)return base;
    const key=base+':'+accent+':'+level,cached=blends.get(key);if(cached!==undefined)return cached;
    const weight=level/8;let best=base,error=Infinity;
    for(let index=0;index<PAD_PALETTE.length;index++){
        let distance=0;
        for(let channel=0;channel<3;channel++){
            const target=PAD_PALETTE[base][channel]*(1-weight)+PAD_PALETTE[accent][channel]*weight;
            distance+=(PAD_PALETTE[index][channel]-target)**2;
        }
        if(distance<error){error=distance;best=index;}
    }
    if(blends.size>2048)blends.clear();blends.set(key,best);return best;
}
export function motifFeedbackColor(base: number,track: number,position: number,axis: 'pitch'|'step',now=Date.now()): number {
    if(!splash||splash.track!==track)return base;
    // 20 fps maximum, 420 ms total; at most six semitones / three steps out.
    const age=Math.floor((now-splash.at)/50)*50;
    if(age<0||age>=420)return base;
    const distance=Math.abs(position-(axis==='pitch'?splash.pitch:splash.step));
    const extent=axis==='pitch'?6:3;if(distance>extent)return base;
    const wave=age/420*extent;
    const strength=Math.max(0,1-Math.abs(distance-wave)/1.4)*(1-age/420)*0.45;
    return motifBlend(base,13,strength);
}
