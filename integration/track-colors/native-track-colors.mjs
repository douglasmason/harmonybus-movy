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
assert.equal(trackColor(12),TRACK_COLOR[12],'A different set cannot inherit the previous set colors');
setNativeTrackColors(null);
console.log('Native track colors: all 25 IDs, bank mapping, dim variants, saved changes, invalid data and no per-tick file reads pass');
