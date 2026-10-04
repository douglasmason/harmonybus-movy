import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temporary=mkdtempSync(join(tmpdir(),'hb-footer-'));
try{
    await build({entryPoints:[new URL('../src/renderer/hb-footer.ts',import.meta.url).pathname],bundle:true,format:'esm',outfile:join(temporary,'footer.mjs')});
    const {romanHarmony,harmonyFooterText}=await import(pathToFileURL(join(temporary,'footer.mjs')));
    const mask=(root,intervals)=>intervals.reduce((bits,interval)=>bits|1<<((root+interval)%12),0);
    assert.equal(romanHarmony(0,2,mask(2,[0,3,7,10])),'ii7');
    assert.equal(romanHarmony(0,7,mask(7,[0,4,7,10])),'V7');
    assert.equal(romanHarmony(0,11,mask(11,[0,3,6,10])),'viih7');
    assert.equal(romanHarmony(0,1,mask(1,[0,4,7])),'bII');
    assert.equal(romanHarmony(2,9,mask(9,[0,4,7,10])),'V7');
    assert.equal(romanHarmony(0,-1,0),'--');
    assert.equal(harmonyFooterText(1,3,[0,1,2,mask(2,[0,3,7,10]),7,mask(7,[0,4,7,10])]),'P1 T4 C Maj ii7>V7');
    assert.equal(harmonyFooterText(2,15,[0,9,-1,0,-1,0]),'P2 T16 C MelMin -->--');
    assert.equal(harmonyFooterText(1,3),'P1 T4');
    console.log('Footer: Roman quality, chromatic degrees, key-relative roots, scale and unknown next pass');
}finally{rmSync(temporary,{recursive:true,force:true});}
