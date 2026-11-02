/** Display consumes native resolved harmony. No chord or scale inference here. */
export type ChordStatus={root:number;mask:number;scale:number;kind:number;target:number;bass:number;family:number;chromatic:boolean;name:string;queued?:boolean};
export type ChordBankStatus={reference:number;active:number[];slots:ChordStatus[]};
export const chordIntents=['Literal','Scale Degree','Secondary ii','Secondary V','Leading vii','Tritone V','Secondary IV','Secondary VI','Borrowed bIII','Borrowed iv','Borrowed bVI','Borrowed bVII','Parallel Degree','Blues Dominant'];
export const chordDegrees=['I','II','III','IV','V','VI','VII'];
const intentSymbols=['','Degree','ii','V','vii dim','subV','IV','VI','bIII','iv','bVI','bVII','Parallel','Blues'];
export function intentLabel(intent:number,degree:number):string{return intent===1?chordDegrees[degree]:intentSymbols[intent]+'/'+chordDegrees[degree];}
// Native Move 128-color palette; red is never the recording indicator.
// Chord function beats the chromatic accent: implied dominants stay red.
// Chromatic, diminished and augmented harmonies are violet, not magenta.
// The active slot uses white, applied before any harmonic classification.
const RED_DARK=65,RED_BRIGHT=126;
const VIOLET_DARK=110,VIOLET_BRIGHT=23;
const qualityColors:readonly (readonly [number,number])[]=[
    [123,122], // unresolved
    [77,7],    // major amber
    [97,17],   // minor blue
    [RED_DARK,RED_BRIGHT], // implied dominant
    [VIOLET_DARK,VIOLET_BRIGHT], // diminished
    [VIOLET_DARK,VIOLET_BRIGHT], // augmented
    [VIOLET_DARK,VIOLET_BRIGHT], // dissonant 1-3-5
];
const intentColors:readonly (readonly [number,number])[]=[[123,122],[81,9],[109,23],[95,16],[77,7]];
export function chordColor(status:ChordStatus|undefined,intent:number,view:number,active:boolean,enabled:boolean):number{
    if(!enabled)return 0;
    if(active)return 120;
    if(!status)return 123;
    // Red always marks dominant function (even a power/sus voicing).
    if(status.family===3)return status.chromatic?RED_BRIGHT:RED_DARK;
    // Chromatic relations use violet regardless of their expressed chord.
    if(status.chromatic)return VIOLET_BRIGHT;
    if(status.family>=4)return VIOLET_DARK;
    const family=intent===0?0:intent===1?1:intent===5?3:intent>=8?4:2;
    const pair=view===2?[123,8]:view===1?intentColors[family]:qualityColors[status.family]??qualityColors[0];
    return pair[0];
}
export function parseChordBank(text:string|null):ChordBankStatus|null{
    const fields=text?.split('|');if(!fields||![19,24].includes(fields.length)||fields[0]!=='cb1')return null;
    const reference=Number(fields[1]),active=fields[2].split(',').map(Number);
    const valid=(values:number[],limits:number[]):boolean=>values.length===limits.length&&values.every((value,index)=>Number.isInteger(value)&&value>=(index===0?-1:0)&&value<=limits[index]);
    if(!Number.isInteger(reference)||reference<1||reference>4095||!valid(active,[11,4095,4095,10,11,11]))return null;
    const slots:ChordStatus[]=[];
    for(const field of fields.slice(3)){
        const cells=field.split(',');if(cells.length!==9&&cells.length!==10)return null;
        const values=cells.slice(0,8).map(Number);
        if(!valid(values,[11,4095,4095,10,11,11,6,1])||!cells[8])return null;
        const [root,mask,scale,kind,target,bass,family,chromatic]=values;
        slots.push({root,mask,scale,kind,target,bass,family,chromatic:!!chromatic,name:cells[8],queued:cells[9]==='1'});
    }
    return {reference,active,slots};
}
export function matchesHarmony(status:ChordStatus|undefined,active:number[]):boolean{
    return !!status&&status.root>=0&&status.root===active[0]&&
        status.mask===active[1]&&status.scale===active[2]&&
        status.kind===active[3]&&status.target===active[4]&&status.bass===active[5];
}
