/** Global user entries live outside the installed module and every individual Set. */
export interface UserPart { payload:string; synth:string; }
export type PartKind='comp'|'bass';
const path='/data/UserData/schwung/harmonybus-parts.json';
let entries:Record<PartKind,(UserPart|null)[]>|null=null;
function validated(value:unknown):(UserPart|null)[]{
    return Array.from({length:8},(_,index)=>{
        const entry=Array.isArray(value)?value[index]:null;
        return entry&&typeof entry.synth==='string'&&entry.synth.length<128&&typeof entry.payload==='string'&&/^[0-9a-f]{2,36000}$/.test(entry.payload)?{payload:entry.payload,synth:entry.synth}:null;
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
    const next={comp:[...entries!.comp],bass:[...entries!.bass]};next[kind][index]=entry;
    const text=JSON.stringify({version:2,...next});
    try {host_write_file(path,text);if(host_read_file(path)!==text)return false;entries=next;return true;}catch{return false;}
}
