import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const temporary=mkdtempSync(join(tmpdir(),'hb-trails-'));
try {
    await build({entryPoints:[new URL('../src/seq/trail-history.ts',import.meta.url).pathname],bundle:true,format:'esm',outfile:join(temporary,'history.mjs')});
    const {TrailHistory,TRAIL_EXPONENTS}=await import(pathToFileURL(join(temporary,'history.mjs')));
    const history=new TrailHistory();
    const settings={scope:'pitch',window:'infinite',windowBeats:4,curve:'exponential',decayBeats:4,strength:1};
    history.heard(64,0);
    assert.equal(history.intensity(64,0,settings),1);
    assert.equal(history.intensity(64,4,settings),0.5);
    assert.equal(history.intensity(64,8,settings),0.25);
    assert(history.intensity(64,80,settings)>0,'Infinite exponential has no rigid cutoff');
    for(const exponent of TRAIL_EXPONENTS){
        const shaped={...settings,exponent};
        assert.equal(history.intensity(64,0,shaped),1);
        assert.equal(history.intensity(64,4,shaped),0.5,'Shape preserves half-life');
        let previous=1;
        for(let step=1;step<=120;step++){
            const value=history.intensity(64,step/10,shaped);
            assert(value>=0&&value<=previous,'Decay is monotonic and bounded');previous=value;
        }
        assert(history.intensity(64,12,shaped)>0,'No window cutoff at three half-lives');
    }
    assert(history.intensity(64,2,{...settings,exponent:2})>history.intensity(64,2,settings),'Superlinear shape lingers initially');
    assert(history.intensity(64,8,{...settings,exponent:2})<history.intensity(64,8,settings),'Superlinear shape falls faster later');
    assert.equal(history.intensity(76,4,settings),0,'Octaves remain distinct');
    assert.equal(history.intensity(76,4,{...settings,scope:'pitch-class'}),0.5);
    history.chordChanged();
    assert.equal(history.intensity(64,4,{...settings,window:'chord'}),0);
    assert.equal(history.intensity(64,4,{...settings,window:'previous-chord'}),0.5);
    history.chordChanged();assert.equal(history.intensity(64,4,{...settings,window:'previous-chord'}),0);
    assert.equal(history.intensity(64,4,{...settings,window:'beats'}),0);
    assert.equal(history.intensity(64,2,{...settings,curve:'linear'}),0.5);
    history.heard(64,8);assert.equal(history.intensity(64,8,settings),1,'New onset refreshes intensity');
    assert.equal(history.intensity(65,8,settings),0,'New pad mapping does not rewrite heard pitches');
    history.clear();assert.equal(history.intensity(64,8,settings),0);
    console.log('Trail history: half-life, infinite decay, octave scope, chord and beat windows, refresh and reset pass');
} finally {rmSync(temporary,{recursive:true,force:true});}
