import { OPERATION_TOKEN_LABELS } from '../operation-catalog.js';
import type { RelativeFeedback } from '../keyboard/relative-feedback.js';
/** Compact musical context from the existing pad snapshot. ASCII fits Move's font. */
import { fontWidth } from '../font/index.js';
import { G } from '../font/glyphs.js';
import { notationGlyph } from '../font/notation.js';
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
/** Ordinary harmony carries a name; secondary intent retains its explicit target. */
export function chordLabel(name:string,roman=''):string {
    if(!name||name==='--')return '--';
    return roman.includes('/')?roman:roman?name+' '+roman:name;
}
export function harmonyLabel(key:number,root:number,mask:number,kind=0,target=0):string {
    const secondary=({2:'V',3:'vii',4:'subV',8:'ii',9:'IV',10:'VI'} as Record<number,string>)[kind];
    const degrees=['I','bII','II','bIII','III','IV','#IV','V','bVI','VI','bVII','VII'];
    return chordLabel(chordName(root,mask),secondary?secondary+'/'+degrees[(target-key+12)%12]:romanHarmony(key,root,mask));
}
export function chordName(root:number,mask:number,name=roots[root]):string {
    if(root<0||!mask)return '--';
    const quality=romanHarmony(root,root,mask).replace(/^[b#]?[ivIV]+/,'');
    const minor=!!(mask&(1<<((root+3)%12)))&&!(mask&(1<<((root+4)%12)));
    return name+(minor&&!quality.startsWith('o')&&!quality.startsWith('h')?'m':'')+quality;
}
export function fitFooter(text:string):string {
    if(fontWidth(text)<=126)return text;
    while(text&&fontWidth(text+'~')>126)text=text.slice(0,-1);
    return text+'~';
}
export function queueFooterText(next:string,status:string,snapshot=''):string {
    const fields=snapshot.split('|'),cursor=Number(fields[9]),count=Number(fields[10]);
    const names=fields.slice(11),loop=fields[8]==='1'&&fields[6]==='0';
    if(fields[0]!=='cq1'||!Number.isInteger(count)||count<1||count>17||names.length!==count||!Number.isInteger(cursor)||cursor< -1||cursor>=count)
        return fitFooter('Next '+chordLabel(next)+'  '+status);
    const token=(index:number)=>index===cursor?'['+names[index]+']':names[index];
    const jump=loop&&cursor>=0&&next!=='--'&&next!==names[(cursor+1)%count]?' >'+next:'';
    const full=(loop?'Loop ':status+' ')+names.map((_,index)=>token(index)).join(' ')+jump;
    if(fontWidth(full)<=126)return full;
    const anchor=Math.max(0,cursor),prefix=loop?'L'+(cursor+1)+'/'+count+' ':status+' ';
    let left=anchor,right=anchor;
    const index=(value:number)=>(value+count)%count;
    const line=(start:number,end:number)=>prefix+Array.from({length:end-start+1},(_,offset)=>token(index(start+offset))).join(' ')+jump;
    // Keep the sounding chord visible. Add its next and previous neighbors,
    // wrapping only for Loop; position changes come from native activation.
    for(let step=0;step<count-1;step++){
        const forward=step%2===0;
        let start=left,end=right;
        if(forward&&(loop||right<count-1))end++;
        else if(loop||left>0)start--;
        else if(right<count-1)end++;
        else break;
        if(fontWidth(line(start,end))>126)break;
        left=start;right=end;
    }
    return fitFooter(line(left,right));
}
export function relativeFeedbackText(feedback:RelativeFeedback):string {
    const operation=OPERATION_TOKEN_LABELS[feedback.token];
    if(!operation)return '';
    const result=feedback.chord?chordName(feedback.root,feedback.mask,feedback.rootName).replace(/o(7)?$/, 'dim$1').replace(/h7$/, 'm7b5'):feedback.rootName;
    return fitFooter(feedback.targetName+' > '+operation+' '+result);
}
export function harmonyFooterText(mode:number,track:number,data?:readonly number[],feedback?:RelativeFeedback):string{
    if(feedback){const text=relativeFeedbackText(feedback);if(text)return text;}
    const prefix=(mode?'P'+mode:'S')+' T'+(track+1);
    if(!data)return prefix;
    const [key,scale,current,currentMask,next,nextMask,currentKind,currentTarget,nextKind,nextTarget]=data;
    const raw=scale===-1?'Blues':scale===0?'Custom':FOLLOWER_SCALE_NAMES[scale-1]??'Custom';
    const label=raw.replace('Natural Minor','Min').replace('Major','Maj').replace('Minor','Min').replace(/ /g,'');
    const suffix=harmonyLabel(key,current,currentMask,currentKind,currentTarget)+' > '+harmonyLabel(key,next,nextMask,nextKind,nextTarget);
    // Preserve chord names before mode/scale context on the small display.
    for(const context of [prefix+' '+roots[key]+' '+label,prefix,roots[key]]){
        const text=context+' '+suffix;if(fontWidth(text)<=126)return text;
    }
    return fitFooter(suffix);
}

/** Musical footers opt in only for complete Roman or spelled-chord tokens.
 * Words such as Min, Live and Overdub retain normal lowercase. */
export function drawHarmonyFooter(text:string):void{
    let x=1;
    for(const token of fitFooter(text).split(/(\s+)/)){
        if(!token)continue;
        const bare=token.replace(/^[\[>]+|[\]]+$/g,'');
        const roman=/^(?:sub)?[b#]?[ivIV]+(?:maj|min|sus|dim|aug|[0-9ho+#-])*(?:\/[b#]?[ivIV]+)?$/.test(bare);
        const chord=/^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|h|o|[0-9b#+-])*(?:\/[A-G][#b]?)?$/.test(bare);
        drawGlyphRun(x,58,token,1,roman||chord?notationGlyph:code=>G[code-32]??null,5,-1);
        x+=fontWidth(token)-1;
    }
}
