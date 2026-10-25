/** Global user entries live outside the installed module and every individual Set. */
export interface UserPart { payload:string; synth:string; }
const path='/data/UserData/schwung/harmonybus-parts.json';
let entries:(UserPart|null)[]|null=null;
export function userParts():(UserPart|null)[]{
    if(entries)return entries;
    entries=Array(8).fill(null);
    try {
        const parsed=JSON.parse(host_read_file(path)??'null');
        if(parsed?.version===1&&Array.isArray(parsed.entries))entries=entries.map((_,index)=>{
            const entry=parsed.entries[index];
            return entry&&typeof entry.synth==='string'&&entry.synth.length<128&&typeof entry.payload==='string'&&/^[0-9a-f]{2,36000}$/.test(entry.payload)?entry:null;
        });
    }catch{}
    return entries;
}
export function saveUserPart(index:number,entry:UserPart):boolean {
    if(!Number.isInteger(index)||index<0||index>=8)return false;
    const next=[...userParts()];next[index]=entry;
    const text=JSON.stringify({version:1,entries:next});
    try {host_write_file(path,text);if(host_read_file(path)!==text)return false;entries=next;return true;}catch{return false;}
}
