/** Compact musical context from the existing pad snapshot. ASCII fits Move's font. */
import { fontPrint, fontWidth } from '../font/index.js';
import { G } from '../font/glyphs.js';
import { drawGlyphRun } from '../font/blit.js';
import { FOLLOWER_SCALE_NAMES } from '../scale-catalog.js';
const roots=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
/** Chromatic degrees use the major reference; chord tones determine quality. */
export function romanHarmony(key:number,root:number,mask:number):string{
    if(root<0||!mask)return '--';
    const degree=(root-key+12)%12;
    const labels=['I','bII','II','bIII','III','IV','#IV','V','bVI','VI','bVII','VII'];
    const has=(interval:number):boolean=>!!(mask&(1<<((root+interval)%12)));
    let numeral=labels[degree];
    const minor=has(3)&&!has(4),dim=minor&&has(6)&&!has(7),aug=has(4)&&has(8)&&!has(7);
    if(minor)numeral=numeral.toLowerCase();
    if(dim)return numeral+(has(10)?'h7':has(9)?'o7':'o');
    if(aug)numeral+='+';
    if(!has(3)&&!has(4))numeral+=has(5)?'sus4':has(2)?'sus2':'5';
    return numeral+(has(11)?'M7':has(10)?'7':'');
}
export function harmonyFooterText(mode:number,track:number,data?:readonly number[]):string{
    const prefix=(mode?'P'+mode:'S')+' T'+(track+1);
    if(!data)return prefix;
    const [key,scale,current,currentMask,next,nextMask]=data;
    const raw=scale===-1?'Blues':scale===0?'Custom':FOLLOWER_SCALE_NAMES[scale-1]??'Custom';
    let label=raw.replace('Harmonic','Harm').replace('Melodic','Mel').replace('Natural Minor','Min').replace('Major','Maj').replace('Minor','Min').replace('Dorian','Dor').replace('Phrygian','Phr').replace('Lydian','Lyd').replace('Mixolydian','Mix').replace('Locrian','Loc').replace('Dominant','Dom').replace('Augmented','Aug').replace(/ /g,'');
    const suffix=romanHarmony(key,current,currentMask)+'>'+romanHarmony(key,next,nextMask);
    const text=():string=>prefix+' '+roots[key]+' '+label+' '+suffix;
    while(fontWidth(text())>126&&label.length>2)label=label.slice(0,-1);
    return text();
}

/** The stock font uppercases letters; small i/v preserve Roman chord quality. */
export function drawHarmonyFooter(text:string):void{
    const split=text.lastIndexOf(' ')+1;
    const prefix=text.slice(0,split),roman=text.slice(split);
    fontPrint(1,58,prefix,1);
    drawGlyphRun(1+fontWidth(prefix)-1,58,roman,1,code=>{
        const base=code>=32&&code<=126?G[code-32]:null;
        if(code===105)return [base![0],0,1,5,1,0,1,1,1];
        if(code===118)return [base![0],2,3,3,5,5,2];
        return base;
    },5,-1);
}
