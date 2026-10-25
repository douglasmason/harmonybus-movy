import {defaultSettings,defaultSamples} from './lighting.mjs';

export const lightingStorageKey='harmonybus.lighting.v1';
const choices={source:['terrain','lanes'],palette:['blend','scale','chord'],position:['degree','pitch','voice'],hueTurns:[1,2,3,4],phraseBars:[0,4,8,16],sectionCue:['off','arrival','rotate']};
for(let voice=0;voice<4;voice++)choices[`voiceHome${voice}`]=[0,1,2,3];
/** Validate the complete profile before replacing any active controls or samples. */
export function lightingProfile(value){
 if(!value||value.schema!==1||!value.settings||typeof value.settings!=='object'||Array.isArray(value.settings))return null;
 const settings={...defaultSettings};
 for(const key of Object.keys(settings)){
  if(value.settings[key]===undefined)continue;
  const candidate=value.settings[key];
  if(choices[key]){if(!choices[key].includes(candidate))return null;}
  else if(key==='blackout'){if(typeof candidate!=='boolean')return null;}
  else if(typeof candidate!=='number'||!Number.isFinite(candidate)||candidate<(key==='spread'?.25:0)||candidate>(key==='spread'?2:1))return null;
  settings[key]=candidate;
 }
 const samples=value.samples??defaultSamples;
 if(!Array.isArray(samples)||samples.length!==4||samples.some(row=>!Array.isArray(row)||row.length!==3||row.some(index=>!Number.isInteger(index)||index<0||index>=64)))return null;
 return {schema:1,settings,samples:samples.map(row=>row.slice())};
}

/** Storage denial/corruption must never prevent the live preview from mounting. */
export function loadLightingProfile(storage){
 try{
  const text=storage.getItem(lightingStorageKey);
  if(text===null)return {profile:null,message:'Lighting changes save on this browser.'};
  const profile=text.length<=16384?lightingProfile(JSON.parse(text)):null;
  return {profile,message:profile?'Lighting settings restored.':'Saved lighting settings are invalid; using defaults.'};
 }catch{return {profile:null,message:'Lighting storage is unavailable; changes last for this visit.'};}
}

export function saveLightingProfile(storage,profile){
 const checked=lightingProfile(profile);
 if(!checked)return 'Lighting settings could not be saved.';
 try{storage.setItem(lightingStorageKey,JSON.stringify(checked));return 'Lighting settings saved on this browser.';}
 catch{return 'Lighting storage is unavailable; changes last for this visit.';}
}
