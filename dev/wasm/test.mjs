import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createEngine} from './engine.mjs';
const seqBytes=await readFile(new URL('./build/seq.wasm',import.meta.url));
const hbBytes=await readFile(new URL('./build/hb.wasm',import.meta.url));
function oracle(name,lines){
 const result=spawnSync(fileURLToPath(new URL(name,import.meta.url)),{input:lines.join('\n')+'\n',encoding:'utf8',maxBuffer:10_000_000});
 assert.equal(result.status,0,result.stderr);
 return result.stdout.trim().split('\n').map(line=>JSON.parse(line));
}
test('production sequencer -> production HB matches native builds over clip loops and Stop',async()=>{
 const engine=await createEngine({seqBytes,hbBytes});
 const commands=['link 0; tog 0 0 60 100 64 100 67 100; tog 1 1 62 90; tog 1 4 65 80; play',...Array(800).fill('@128'),'stop'];
 const source=[],output=[],hbInput=[],groupSizes=[];
 for(const command of commands){
  const result=command.startsWith('@')?engine.advance(128):engine.command(command);
  source.push(result.source);output.push(result.output);
  let size=0;
  for(const event of result.source){hbInput.push(`m ${event>>>24} ${(event>>>16)&255} ${(event>>>8)&255} ${event&255}`);size++;}
  if(command.startsWith('@'))for(let track=0;track<4;track++){hbInput.push(`t ${track} 128`);size++;}
  groupSizes.push(size);
 }
 assert.deepEqual(source,oracle('./build/seq/target/release/seq-oracle',commands));
 const nativeHB=oracle('./build/hb-oracle',hbInput);let offset=0;
 assert.deepEqual(output,groupSizes.map(size=>{const events=nativeHB.slice(offset,offset+size).flat();offset+=size;return events;}));
 assert(source.flat().some(event=>((event>>>16)&255)===144),'must emit real notes');
 assert(output.flat().some(event=>((event>>>16)&255)===145),'must render follower notes');
 const active=new Map();
 for(const event of output.flat()){
  const status=event>>>16,pitch=(event>>>8)&255,key=`${status&15}:${pitch}`;
  const on=(status&240)===144&&(event&255)>0;
  if(on)active.set(key,(active.get(key)||0)+1);
  else if((status&240)===128||(status&240)===144)active.set(key,(active.get(key)||0)-1);
 }
 assert([...active.values()].every(count=>count===0),'Stop must balance rendered note ownership');
});
test('HB maps follower input, releases it, and rejects invalid MIDI',async()=>{
 const engine=await createEngine({seqBytes,hbBytes});
 const lines=['m 0 144 62 100','m 0 144 65 100','m 0 144 69 100',...Array(64).fill('t 0 128'),'t 1 128','m 1 144 60 90',...Array(64).fill('t 1 128'),'m 1 128 60 0','m 0 128 62 0','m 0 128 65 0','m 0 128 69 0'];
 const result=lines.map(line=>{const args=line.slice(2).split(' ').map(Number);if(line[0]==='m')return engine.midi(...args);const count=engine.hb._hb_tick(...args);return Array.from({length:count},(_,index)=>engine.hb._hb_event(index)>>>0);});
 assert.deepEqual(result,oracle('./build/hb-oracle',lines));
 const follower=result.flat().find(event=>((event>>>16)&255)===145);
 assert(follower);
 assert.notEqual((follower>>>8)&255,60,'C input must travel under D minor');
 assert.throws(()=>engine.midi(4,144,60,100));
 assert.throws(()=>engine.advance(44101));
 assert.throws(()=>engine.command('x'.repeat(4097)));
});
