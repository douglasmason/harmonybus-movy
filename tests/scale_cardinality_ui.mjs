import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]);
const load=path=>import(pathToFileURL(root+'/'+path));
const {installEnv}=await load('browser-test/env.mjs');installEnv();
const {SCALES}=await load('dist/esm/seq/scales.js');
const {buildPadMap,degreeToPitch,MODE_IN_KEY,LAYOUT_INLINE,LAYOUT_APPROACH,LAYOUT_TRIPLE_APPROACH}=await load('dist/esm/keyboard/layouts.js');
const {parseHarmonySnapshot}=await load('dist/esm/keyboard/harmony-pads.js');
const choices=['Whole Tone','Augmented','Dim H-W','Dim W-H'];
for(const name of choices){
    const scale=SCALES.findIndex(value=>value.name===name);assert(scale>=0);
    const degrees=SCALES[scale].degrees;
    for(let tonic=0;tonic<12;tonic++)for(const layout of [LAYOUT_INLINE,LAYOUT_APPROACH,LAYOUT_TRIPLE_APPROACH]){
        const base=48+tonic,map=buildPadMap(MODE_IN_KEY,layout,scale,base);
        assert.deepEqual([...map.slice(0,8)],Array.from({length:8},(_,index)=>degreeToPitch(base,degrees,index)));
        if(degrees.length===8)assert.equal(new Set([...map.slice(0,8)].map(note=>note%12)).size,8);
        else assert.deepEqual([...map.slice(6,8)],[base+12,base+12+degrees[1]]);
        if(layout===LAYOUT_APPROACH)assert.deepEqual([...map.slice(16,24)],[...map.slice(0,8)].map(note=>note+12));
        if(layout===LAYOUT_TRIPLE_APPROACH)assert([...map.slice(8)].every(note=>note===-1));
        assert([...buildPadMap(MODE_IN_KEY,layout,scale,124)].every(note=>note===-1||note<=127));
    }
}
for(const scale of [20,21])assert(parseHarmonySnapshot(`0,0,1755,1,0,0,0,0,0,0|input1,0,${scale},${scale},1755,0|key1,${scale},${scale}`));
console.log('Six/eight-note pads: every tonic, row wrap, unique eighth degree, MIDI boundary and HB snapshot IDs pass');
