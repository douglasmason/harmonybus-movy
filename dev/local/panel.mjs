import {parseHarmonySnapshot,withSurfacePreview,harmonyPadColor} from 'movy/keyboard/harmony-pads.ts';
import {PAD_PALETTE} from 'movy/keyboard/pad-palette.ts';
import {previewPayload} from 'movy/surfaces/protocol.ts';
const remote=window.schwungRemote;
const notes=Int16Array.from({length:32},(_,index)=>48+index);
const preview={notes,targets:Array(32).fill(-1),rows:Array(32).fill(0)};
const payload=previewPayload(Array.from(notes,pitch=>({pitch,target:-1,row:0})),false);
const buttons=[];const pointers=new Map();let chord=[];let parameters={};
const track=()=>Number(document.querySelector('#track').value);
const send=(key,value)=>remote.setParam(`overtake_dsp:${key}`,value);
let eventSerial=0;
const note=(track,pitch,velocity)=>send('surface_events',[++eventSerial,track,velocity?144:128,track*32+pitch-48,pitch,velocity,0,-1,0].join(','));
function releasePointer(pointer) {const held=pointers.get(pointer);if(!held)return;note(held.track,held.pitch,0);held.button.dataset.held='false';pointers.delete(pointer)}
function releaseAll(){for(const pointer of [...pointers.keys()])releasePointer(pointer);for(const pitch of chord)note(0,pitch,0);chord=[]}
for(let index=0;index<32;index++) {
  const button=document.createElement('button');button.className='pad';button.textContent=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][notes[index]%12]+(Math.floor(notes[index]/12)-1);button.dataset.pitch=notes[index];
  button.onpointerdown=event=>{event.preventDefault();if(event.isTrusted)button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{track:track(),pitch:notes[index],button});button.dataset.held='true';note(track(),notes[index],100)};
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=event=>releasePointer(event.pointerId);
  button.onkeydown=event=>{if([' ','Enter'].includes(event.key)&&!event.repeat){event.preventDefault();pointers.set(`key${index}`,{track:track(),pitch:notes[index],button});button.dataset.held='true';note(track(),notes[index],100)}};
  button.onkeyup=event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();releasePointer(`key${index}`)}};
  buttons.push(button);document.querySelector('#pads').append(button);
}
document.querySelectorAll('[data-chord]').forEach(button=>button.onclick=()=>{for(const pitch of chord)note(0,pitch,0);chord=button.dataset.chord?button.dataset.chord.split(',').map(Number):[];for(const pitch of chord)note(0,pitch,100)});
document.querySelector('#release').onclick=releaseAll;
document.querySelector('#track').onchange=()=>{releaseAll();paint()};
document.querySelector('#travel').onchange=event=>send(`ch${track()}:midi_fx1:travel_map`,event.target.value);
document.querySelector('#transpose').onchange=event=>send('ch0:midi_fx1:master_transpose',event.target.value);
window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll()});
function paint() {
  const prefix=`ch${track()}:midi_fx1:`;const snapshot=parseHarmonySnapshot(parameters[prefix+'pad_view']);
  if(snapshot)withSurfacePreview(track(),snapshot,preview,()=>buttons.forEach((button,index)=>{const color=harmonyPadColor(notes[index],track(),button.dataset.held==='true')??0;const rgb=PAD_PALETTE[color]??[30,30,30];button.style.backgroundColor=`rgb(${rgb.join(',')})`;button.style.color=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722>150?'#142019':'#fff';button.style.textShadow='none'}));
  document.querySelector('#harmony').textContent=(parameters['ch0:midi_fx1:harmony_snapshot']??'').split('|').slice(1).join('  ·  ');
  document.querySelector('#state').textContent=JSON.stringify(Object.fromEntries(Object.entries(parameters).filter(([key])=>key.startsWith(prefix)&&!key.endsWith('pad_view'))),null,2);
  document.querySelector('#travel').value=parameters[prefix+'travel_map']??'Closest Scale Tone';
}
let initialized=false;
remote.onParamChange(values=>{parameters={...parameters,...values};document.querySelector('#connection').textContent='Processor connected';if(!initialized){initialized=true;for(let index=0;index<4;index++)send(`ch${index}:midi_fx1:pad_preview_inputs`,payload)}paint()});
// Diagnostic output is a development-only extension; controls use Schwung's unmodified client.
const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/remote-ui`);
socket.onopen=()=>socket.send(JSON.stringify({type:'subscribe_tool'}));
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.type==='error')document.querySelector('#error').textContent=message.message;if(message.events){document.querySelector('#events').textContent=message.events.slice(-24).map(item=>`${item.sequence}  ${item.packet.map(value=>value.toString(16).padStart(2,'0')).join(' ')}`).join('\n');document.querySelector('#clock').textContent=`Beat ${(message.beat??0).toFixed(3)} · 44.1 kHz / 128 frames`}};
socket.onclose=()=>{document.querySelector('#connection').textContent='Disconnected';releaseAll()};
