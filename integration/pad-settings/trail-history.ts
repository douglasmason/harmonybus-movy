/** Per-track target history in sounding pitch space, independent of pad layout.
 * The caller supplies monotonic musical time and actual target onset events.
 * Display mapping and palette blending deliberately live outside this class.
 */
export type TrailWindow = 'infinite' | 'beats' | 'chord' | 'previous-chord';
export type TrailCurve = 'none' | 'linear' | 'exponential';
export const TRAIL_EXPONENTS = [0.5, 1, 2, 4] as const;
export type TrailExponent = typeof TRAIL_EXPONENTS[number];
export interface TrailSettings {
    scope: 'pitch' | 'pitch-class';
    window: TrailWindow;
    windowBeats: number;
    curve: TrailCurve;
    decayBeats: number;
    exponent?: TrailExponent;
    peak?: number;
    strength: number;
    floor?: number;
}
export class TrailHistory {
    private readonly heardAt = new Float64Array(128).fill(-Infinity);
    private readonly chordAt = new Float64Array(128).fill(-Infinity);
    private readonly previousAt = new Float64Array(128).fill(-Infinity);
    private readonly previousChord = new Float64Array(128).fill(-Infinity);
    private chord = 0;
    /** A boundary is an effective harmony event, never a lookahead repaint. */
    chordChanged(): void { this.chord++; }
    clear(): void { this.heardAt.fill(-Infinity);this.chordAt.fill(-Infinity);this.previousAt.fill(-Infinity);this.previousChord.fill(-Infinity);this.chord=0; }
    /** Record the resolved input target once at onset, not generated arp hits. */
    heard(pitch: number, beat: number): void {
        if (!Number.isInteger(pitch) || pitch<0 || pitch>127 || !Number.isFinite(beat)) return;
        this.previousAt[pitch]=this.heardAt[pitch];this.previousChord[pitch]=this.chordAt[pitch];
        this.heardAt[pitch]=beat;this.chordAt[pitch]=this.chord;
    }
    /** Atomically replace a native snapshot; malformed reads retain history. */
    readSnapshot(raw: string): number | null {
        const [header,...records]=raw.split(';');const head=header.split(',');
        const beat=Number(head[1]),chord=Number(head[2]);
        const extended=head[0]==='th2';
        if(head.length!==3||(!extended&&head[0]!=='th1')||!Number.isFinite(beat)||!Number.isInteger(chord)||chord<0)return null;
        const parsed=records.map(record=>record.split(',').map(Number));
        if(parsed.some(r=>r.length!==(extended?5:3)||!Number.isInteger(r[0])||r[0]<0||r[0]>127||!Number.isFinite(r[1])||r[1]>beat||!Number.isInteger(r[2])||r[2]>chord||r[2]<0||
            (extended&&(!Number.isFinite(r[3])||!Number.isInteger(r[4])||r[4]<-1||r[4]>r[2]||(r[4]>=0&&r[3]>r[1])))))return null;
        if(new Set(parsed.map(record=>record[0])).size!==parsed.length)return null;
        this.clear();this.chord=chord;
        for(const [pitch,at,generation,previous,previousGeneration] of parsed){
            this.heardAt[pitch]=at;this.chordAt[pitch]=generation;
            if(extended&&previousGeneration>=0){this.previousAt[pitch]=previous;this.previousChord[pitch]=previousGeneration;}
        }
        return beat;
    }
    /** Query a pad's resolved displayed-context target; history never remaps. */
    intensity(pitch: number, beat: number, settings: TrailSettings): number {
        if (!Number.isInteger(pitch)||pitch<0||pitch>127||!Number.isFinite(beat)) return 0;
        const first=settings.scope==='pitch-class'?pitch%12:pitch;
        const stride=settings.scope==='pitch-class'?12:128;
        let latest=-Infinity,latestChord=-Infinity,previous=-Infinity,previousChord=-Infinity;
        for(let candidate=first;candidate<128;candidate+=stride){
            for(let entry=0;entry<2;entry++){
                const at=entry===0?this.heardAt[candidate]:this.previousAt[candidate];
                const generation=entry===0?this.chordAt[candidate]:this.previousChord[candidate];
                if(at>=latest){previous=latest;previousChord=latestChord;latest=at;latestChord=generation;}
                else if(at>previous){previous=at;previousChord=generation;}
            }
        }
        const inside=(at:number,generation:number,now:number,chord:number):boolean=>Number.isFinite(at)&&at<=now&&
            (settings.window!=='beats'||now-at<settings.windowBeats)&&
            (settings.window!=='chord'||generation===chord)&&
            (settings.window!=='previous-chord'||generation>=chord-1);
        if(!inside(latest,latestChord,beat,this.chord))return 0;
        const peak=inside(previous,previousChord,latest,latestChord)?1:(settings.peak??0.8);
        const fade=trailFade(beat-latest,settings.decayBeats,settings.curve,settings.exponent,settings.floor,peak);
        return fade*Math.max(0,Math.min(1,settings.strength));
    }
}

/** Shared with the display so the drawn curve matches the audible-time history fade. */
export function trailFade(age:number,duration:number,curve:TrailCurve,exponent:TrailExponent=1,floor=0,peak=0.8):number{
    const elapsed=age/Math.max(0.000001,duration);
    const fade=curve==='none'?1:curve==='linear'?Math.max(0,1-elapsed):Math.pow(2,-Math.pow(elapsed,exponent));
    return floor+(peak-floor)*fade;
}
