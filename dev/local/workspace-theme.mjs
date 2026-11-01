import {appearance,defaultAppearance,palette,wheelPosition} from './workspace-palette.mjs';
const storageKey='hb-movy-appearance-v1';
const root=document.documentElement,wheel=document.querySelector('#appearance-wheel'),thumb=document.querySelector('#appearance-thumb');
const controls=Object.fromEntries(['hue','saturation','brightness'].map(key=>[key,document.querySelector('#appearance-'+key)]));
const status=document.querySelector('#appearance-status'),neutral=document.querySelector('#appearance-neutral');
let state=appearance(null),pointer=null;
try{state=appearance(JSON.parse(localStorage.getItem(storageKey)));}catch{}
function render(save=false){
 neutral.checked=state.neutral;
 for(const [key,value]of Object.entries(palette(state)))root.style.setProperty(key,value);
 for(const [key,control]of Object.entries(controls)){control.value=String(Math.round(state[key]));document.querySelector('#appearance-'+key+'-value').value=Math.round(state[key])+(key==='hue'?'°':'%');}
 thumb.style.left=(50+Math.cos(state.hue*Math.PI/180)*state.saturation*.48)+'%';
 thumb.style.top=(50+Math.sin(state.hue*Math.PI/180)*state.saturation*.48)+'%';
 status.textContent='Appearance stays on this browser. Musical colors and device pixels stay original.';
 if(save)try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{status.textContent='Appearance applied for this visit; browser storage is unavailable.';}
}
neutral.addEventListener('change',()=>{state=appearance({...state,neutral:neutral.checked});render(true);});
for(const [key,control]of Object.entries(controls))control.addEventListener('input',()=>{state=appearance({...state,[key]:Number(control.value)});render(true);});
function point(event){const bounds=wheel.getBoundingClientRect(),radius=Math.min(bounds.width,bounds.height)/2;state=appearance({...state,...wheelPosition((event.clientX-bounds.left-bounds.width/2)/radius,(event.clientY-bounds.top-bounds.height/2)/radius)});render();}
wheel.addEventListener('pointerdown',event=>{if(pointer!==null||event.button!==0)return;event.preventDefault();pointer=event.pointerId;wheel.setPointerCapture(pointer);point(event);});
wheel.addEventListener('pointermove',event=>{if(event.pointerId===pointer)point(event);});
const release=event=>{if(event.pointerId!==pointer)return;pointer=null;render(true);};
for(const event of ['pointerup','pointercancel','lostpointercapture'])wheel.addEventListener(event,release);
window.addEventListener('blur',()=>{if(pointer===null)return;const previous=pointer;pointer=null;if(wheel.hasPointerCapture(previous))wheel.releasePointerCapture(previous);render(true);});
document.querySelector('#appearance-reset').onclick=()=>{state={...defaultAppearance};render(true);};
window.addEventListener('storage',event=>{if(event.key!==storageKey)return;try{state=appearance(JSON.parse(event.newValue));render();}catch{}});
render();
