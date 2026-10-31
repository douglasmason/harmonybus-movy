import './hb-pad-position.mjs';
import assert from 'node:assert/strict';
const {appState,VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {keyboardState}=await import('../dist/esm/keyboard/state.js');
const {positionHighlight,POSITION_HIGHLIGHT_MS}=await import('../dist/esm/keyboard/position-highlight.js');
const {setPadPosition}=await import('../dist/esm/seq/pad-position.js');
const {padColor,refreshHarmonyPads}=await import('../dist/esm/seq/pads.js');
const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
const {C_WHITE}=await import('../dist/esm/seq/colors.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {tickLaunchpad,unloadLaunchpad}=await import('../dist/esm/surfaces/launchpad.js');
const {launchpadIndex}=await import('../dist/esm/surfaces/protocol.js');
const {PAD_PALETTE}=await import('../dist/esm/keyboard/pad-palette.js');
const joint=await import('../dist/esm/seq/joint-play.js');
const {ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
const {bumpGen}=await import('../dist/esm/seq/set-session.js');
const realNow=Date.now;
let now=1000000,reads=0;
Date.now=()=>now;
const snapshot='0,0,2741,0,0,7,0,0,4,2|input1,0,1,1,2741,0|piano1,1|toniccolor1,0';
try{
    selectTrack(3);seqState.sessionMode=false;appState.currentView=VIEW_KNOBS;
    Object.assign(keyboardState,{columnOffset:0,mode:1,layout:3,rootPc:0,scale:0});
    keyboardState.octave.fill(5);
    for(let track=0;track<16;track++){
        const port=portFor(track),get=port.getParam;
        port.getParam=key=>{reads++;return /:(pad_view|surface_view[01])$/.test(key)?snapshot:get(key);};
    }
    refreshHarmonyPads(3,now);
    const arrow=direction=>{seqHandleMidi([176,direction>0?63:62,127],false);seqHandleMidi([176,direction>0?63:62,0],false);};
    arrow(1);assert.equal(keyboardState.columnOffset,1);
    const queried=reads;
    const lit=Array.from({length:32},(_,index)=>padColor(68+index,68,3,false));
    for(const index of [1,9,17,25])assert.equal(lit[index],C_WHITE,'Move highlights all tonic approach rows');
    now+=POSITION_HIGHLIGHT_MS-1;assert(positionHighlight(60));
    arrow(1);assert.equal(keyboardState.columnOffset,2);
    assert.equal(padColor(70,68,3,false),C_WHITE);
    assert.notEqual(padColor(69,68,3,false),C_WHITE,'old column clears immediately');
    now+=POSITION_HIGHLIGHT_MS-1;assert(positionHighlight(60),'repeat movement renews the cue');
    now++;assert(!positionHighlight(60));assert.notEqual(padColor(70,68,3,false),C_WHITE,'normal colors return at expiry');
    assert.equal(reads,queried,'LED cue does not poll the host');
    setPadPosition(7);now+=1000;arrow(1);now+=200;
    assert(!positionHighlight(60),'blocked boundary does not prolong the cue');
    setPadPosition(1);selectTrack(2);assert(!positionHighlight(60));selectTrack(3);assert(!positionHighlight(60),'owner change cancels permanently');
    setPadPosition(3);bumpGen();assert(!positionHighlight(60),'Set/engine generation change cancels the cue');
    setPadPosition(2);keyboardState.rootPc=2;assert(!positionHighlight(62),'key change cancels old cue');
    keyboardState.rootPc=0;setPadPosition(3);now--;assert(!positionHighlight(60),'clock rollback expires safely');now++;
    keyboardState.layout=0;setPadPosition(2);
    assert(positionHighlight(60));assert(!positionHighlight(61));assert(!positionHighlight(-1),'fourths highlight tonic pitches only');

    // Decode actual outgoing LED packets, including the Mini's bounded queue.
    keyboardState.layout=3;setPadPosition(0);now+=2000;
    const sent=[];globalThis.move_midi_external_send=packet=>{sent.push([...packet]);return true;};
    const unpack=packet=>packet.flatMap((_,index)=>index%4===0?packet.slice(index+1,index+1+(packet[index]===4?3:packet[index]-4)):[]);
    const colorsFor=model=>{
        const colors=new Map();
        for(const packet of sent){
            if(model===1){for(let i=0;i<packet.length;i+=4)if(packet[i+1]===144){const index=launchpadIndex(1,packet[i+2]);if(index>=0)colors.set(index,packet[i+3]);}}
            else {const bytes=unpack(packet);if(bytes[6]!==3)continue;for(let i=7;i<bytes.length-1;i+=5){const index=launchpadIndex(2,bytes[i+1]);if(index>=0)colors.set(index,bytes.slice(i+2,i+5));}}
        }
        return colors;
    };
    for(const model of [1,2]){
        unloadLaunchpad();setPadPosition(0);now+=2000;setFlag('hblaunchpad',model);
        for(let i=0;i<60;i++){now+=10;tickLaunchpad(now);}
        sent.length=0;arrow(1);
        for(let i=0;i<60;i++){now+=10;tickLaunchpad(now);}
        const lit=colorsFor(model),expected=model===1?63:PAD_PALETTE[C_WHITE].map(value=>Math.round(value*127/255));
        for(let row=0;row<8;row++)assert.deepEqual(lit.get(row*8+1),expected,'surface '+model+' tonic column '+row);
        now+=POSITION_HIGHLIGHT_MS;sent.length=0;
        for(let i=0;i<60;i++){now+=10;tickLaunchpad(now);}
        assert.notDeepEqual(colorsFor(model).get(1),expected,'surface restores resting LEDs');
    }
    unloadLaunchpad();setFlag('hblaunchpad',0);

    // Joint's role overlay still yields to the same temporary cue.
    joint.restoreJoint([{pads:8,lower:0,upper:2,bass:0,comp:0}]);joint.setJointEnabled(true);
    setPadPosition(0);now+=2000;joint.syncJoint(()=>{},now);
    arrow(1);now+=50;joint.syncJoint(()=>{},now);
    const move=[];globalThis.move_midi_internal_send=packet=>{move.push([...packet]);return true;};
    for(let i=0;i<20;i++){ledFrameReset();joint.paintJointPads(i===0);}
    const colors=new Map(move.flatMap(packet=>{const entries=[];for(let i=0;i<packet.length;i+=4)if((packet[i+1]&240)===144)entries.push([packet[i+2],packet[i+3]]);return entries;}));
    assert.equal(colors.get(69),C_WHITE,'Joint tonic follows the shared cue');
    joint.setJointEnabled(false);
}finally{Date.now=realNow;}
console.log('Position cue: real arrows, full tonic columns, expiry/retrigger, boundaries, owner/key/clock changes, no extra reads, Move/Joint/X/Mini LED packets pass');
