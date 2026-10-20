import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
installEnv();
const { songTrackColors, syncNativeTrackColors } = await import('../dist/esm/seq/native-track-colors.js');
const { trackColor, trackColorDim, TRACK_COLOR, setNativeTrackColors } = await import('../dist/esm/seq/colors.js');
const { PAD_PALETTE } = await import('../dist/esm/keyboard/pad-palette.js');
const song = ids => JSON.stringify({tracks:ids.map(color=>({color,clips:[{color:25}]})),returnTracks:[{color:1}]});
for(let id=1;id<=25;id++){
    const pairs=songTrackColors(song([id,id,id,id]));assert(pairs);
    assert(pairs.every(([bright,dim])=>Number.isInteger(bright)&&Number.isInteger(dim)));
    assert(PAD_PALETTE[pairs[0][1]].reduce((a,b)=>a+b)<PAD_PALETTE[pairs[0][0]].reduce((a,b)=>a+b));
}
for(const raw of ['{',song([1,2,3]),song([1,2,3,26]),song([1,2,3,0]),song([1,2,3,'7']),JSON.stringify({tracks:[{clips:[{color:3}]}]})])assert.equal(songTrackColors(raw),null);
assert.deepEqual(songTrackColors(song([8,9,10,11])),[[9,81],[10,83],[11,85],[9,81]],'Native greens use green hardware entries and paired dim shades, never Muted Teal');
let reads=[];
let saved=song([6,20,19,4]);
globalThis.host_read_file=path=>{reads.push(path);return path.endsWith('/Example/Song.abl')?saved:null;};
syncNativeTrackColors('set-a','Example');
assert.equal(reads.length,1);
const expected=songTrackColors(saved);
for(let track=0;track<16;track++){
    assert.equal(trackColor(track),expected[track%4][0]);
    assert.equal(trackColorDim(track),expected[track%4][1]);
}
for(let tick=0;tick<1000;tick++)syncNativeTrackColors('set-a','Example');
assert.equal(reads.length,1,'No Song.abl reads on normal ticks');
saved=song([1,2,3,4]);syncNativeTrackColors('set-a','Example',true);
assert.equal(trackColor(12),songTrackColors(saved)[0][0],'Return from native UI refreshes the saved assignment');
saved='{';syncNativeTrackColors('set-a','Example',true);
assert.equal(trackColor(12),songTrackColors(song([1,2,3,4]))[0][0],'A partial save retains the last valid assignment');
syncNativeTrackColors('set-b','Missing');
assert.equal(trackColor(12),TRACK_COLOR[0],'A different set cannot inherit the previous set colors');
// A save that lands after resume is picked up without restarting Movy.
const realNow=Date.now;let now=realNow();Date.now=()=>now;
try {
    saved=song([1,2,3,4]);syncNativeTrackColors('set-c','Example',true);
    saved=song([10,9,8,11]);now+=1100;syncNativeTrackColors('set-c','Example');
    assert.equal(trackColor(0),11,'Delayed native save refreshes the visible colors');
    for(const delay of [2100,5000,12000]){now+=delay;syncNativeTrackColors('set-c','Example');}
    const settledReads=reads.length;now+=60000;syncNativeTrackColors('set-c','Example');
    assert.equal(reads.length,settledReads,'Retry window ends; no perpetual file polling');
} finally {Date.now=realNow;}
setNativeTrackColors(null);
// Live values win over stale saved files and keep following unsaved edits.
let liveIds = [8,9,10,11];
globalThis.host_get_move_info = () => ({valid:true,tracks:liveIds.map(colorId=>({colorId}))});
const beforeLiveReads = reads.length;
syncNativeTrackColors('set-live','Example');
assert.equal(trackColor(0),9);
assert.equal(reads.length,beforeLiveReads,'Valid live data avoids file IO');
liveIds = [10,8,9,11];
syncNativeTrackColors('set-live','Example');
assert.equal(trackColor(0),11,'Unsaved native edits are reflected');
assert.equal(trackColor(12),11,'Native colors repeat across all banks');
assert.equal(reads.length,beforeLiveReads);
saved=song([1,2,3,4]);
for (const unavailable of [null,{valid:false,tracks:[]},{valid:true,tracks:[{colorId:-1}]}]) {
    globalThis.host_get_move_info=()=>unavailable;
    syncNativeTrackColors('set-live','Example',true);
    assert.equal(trackColor(0),songTrackColors(saved)[0][0],'Invalid live data falls back to saved colors');
}
globalThis.host_get_move_info=()=>{throw new Error('host unavailable');};
syncNativeTrackColors('set-live','Example',true);
assert.equal(trackColor(0),songTrackColors(saved)[0][0]);
delete globalThis.host_get_move_info;
setNativeTrackColors(null);
console.log('Native track colors: palette, bank mapping, live unsaved edits, older-host fallback and bounded file reads pass');
