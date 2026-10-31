/** Global user entries live outside the installed module and every individual Set. */
export interface PartMetadata {name?:string; genres?:string[]; steps?:number; automation?:number;}
export interface UserPart extends PartMetadata { payload:string; synth:string; generator?:'Comp'|'Bass'; }
export type PartKind='comp'|'bass';
export const isGeneratorPart=(entry:UserPart|null|undefined):boolean=>!!entry?.payload.startsWith('70617274320a');
const path='/data/UserData/schwung/harmonybus-parts.json';
let entries:Record<PartKind,(UserPart|null)[]>|null=null;
let revision=0;
export const partLibraryRevision=():number=>revision;
export const cleanPartName=(value:string):string=>value.replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim().slice(0,32);
/** Display metadata is optional; old payloads retain their slot and identity. */
function metadata(value:any):PartMetadata {
    const name=typeof value?.name==='string'?cleanPartName(value.name):'';
    const genres=Array.isArray(value?.genres)?[...new Set<string>(value.genres.filter((tag:unknown)=>typeof tag==='string'&&/^[A-Za-z][A-Za-z /-]{0,23}$/.test(tag)))].slice(0,16):undefined;
    return {...(name?{name}:{}),...(genres?{genres}:{}),...(Number.isInteger(value?.steps)&&value.steps>0&&value.steps<=256?{steps:value.steps}:{}),...(Number.isInteger(value?.automation)&&value.automation>=0&&value.automation<=7?{automation:value.automation}:{})};
}
export function userPartLabel(kind:PartKind,index:number):string {const name=userParts(kind)[index]?.name;return 'User '+(index+1)+(name?': '+name:'');}
export function userPartDetails(entry:PartMetadata|null|undefined):string {
    if(!entry)return 'Empty slot';
    const length=entry.steps===undefined?'Length unknown':entry.steps%16?entry.steps+' steps':entry.steps/16+' bars';
    return length+(entry.automation===undefined?'':' / '+(entry.automation?'Auto '+['C','I','S'].filter((_,index)=>entry.automation!&(1<<index)).join(''):'Fixed controls'));
}
function validated(value:unknown):(UserPart|null)[]{
    return Array.from({length:8},(_,index)=>{
        const entry=Array.isArray(value)?value[index]:null;
        return entry&&typeof entry.synth==='string'&&entry.synth.length<128&&typeof entry.payload==='string'&&/^[0-9a-f]{2,36000}$/.test(entry.payload)?{payload:entry.payload,synth:entry.synth,...(['Comp','Bass'].includes(entry.generator)?{generator:entry.generator}:{}),...metadata(entry)}:null;
    });
}
export function userParts(kind:PartKind='comp'):(UserPart|null)[]{
    if(entries)return entries[kind];
    entries={comp:validated(null),bass:validated(null)};
    try {
        const parsed=JSON.parse(host_read_file(path)??'null');
        if(parsed?.version===1)entries.comp=validated(parsed.entries);
        if(parsed?.version===2)entries={comp:validated(parsed.comp),bass:validated(parsed.bass)};
    }catch{}
    return entries[kind];
}
export function saveUserPart(index:number,entry:UserPart,kind:PartKind='comp'):boolean {
    if(!Number.isInteger(index)||index<0||index>=8)return false;
    userParts(kind);
    const next={comp:[...entries!.comp],bass:[...entries!.bass]};next[kind][index]={payload:entry.payload,synth:entry.synth,...(entry.generator?{generator:entry.generator}:{}),...metadata(entry)};
    const text=JSON.stringify({version:2,...next});
    try {host_write_file(path,text);if(host_read_file(path)!==text)return false;entries=next;revision++;return true;}catch{return false;}
}
