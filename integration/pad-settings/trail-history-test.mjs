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
    assert.equal(history.intensity(64,0,settings),0.8);
    assert.equal(history.intensity(64,4,settings),0.4);
    assert.equal(history.intensity(64,8,settings),0.2);
    assert(history.intensity(64,80,settings)>0,'Infinite exponential has no rigid cutoff');
    for(const exponent of TRAIL_EXPONENTS){
        const shaped={...settings,exponent};
        assert.equal(history.intensity(64,0,shaped),0.8);
        assert.equal(history.intensity(64,4,shaped),0.4,'Shape preserves half-life');
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
    assert.equal(history.intensity(76,4,{...settings,scope:'pitch-class'}),0.4);
    history.chordChanged();
    assert.equal(history.intensity(64,4,{...settings,window:'chord'}),0);
    assert.equal(history.intensity(64,4,{...settings,window:'previous-chord'}),0.4);
    history.chordChanged();assert.equal(history.intensity(64,4,{...settings,window:'previous-chord'}),0);
    assert.equal(history.intensity(64,4,{...settings,window:'beats'}),0);
    assert.equal(history.intensity(64,2,{...settings,curve:'linear'}),0.4);
    history.heard(64,8);assert.equal(history.intensity(64,8,settings),1,'New onset refreshes intensity');
    assert.equal(history.intensity(65,8,settings),0,'New pad mapping does not rewrite heard pitches');
    history.clear();assert.equal(history.intensity(64,8,settings),0);
    console.log('Trail history: half-life, infinite decay, octave scope, chord and beat windows, refresh and reset pass');


{
    const history=new TrailHistory();history.heard(60,0);
    const floor={scope:'pitch',window:'infinite',windowBeats:4,curve:'linear',decayBeats:4,strength:1,floor:0.3};
    assert.equal(history.intensity(60,100,floor),0.3,'Dim decay stops at 30% brightness');
    assert.equal(history.intensity(61,100,floor),0,'Unplayed notes have no floor');
    assert.equal(history.intensity(60,4,{...floor,window:'beats'}),0,'Window expiry clears even floor-level trails');
    assert.equal(history.intensity(60,4,{...floor,curve:'exponential'}),0.55,'Half-life halves the distance to the floor');
}

{
    const history=new TrailHistory();
    const options={...settings,floor:0.3,curve:'linear',window:'beats'};
    history.heard(60,0);assert.equal(history.intensity(60,0,options),0.8);
    history.heard(60,1);assert.equal(history.intensity(60,1,options),1);
    assert(Math.abs(history.intensity(60,4.5,options)-0.3875)<1e-12,'Boost decays continuously after previous hit expires');
    history.heard(60,6);assert.equal(history.intensity(60,6,options),0.8,'Expired history starts a single hit');
    history.clear();history.heard(60,0);history.chordChanged();history.heard(60,1);
    assert.equal(history.intensity(60,1,{...options,window:'chord'}),0.8);
    assert.equal(history.intensity(60,1,{...options,window:'previous-chord'}),1);
    history.clear();history.heard(60,0);history.heard(72,0.01);
    assert.equal(history.intensity(72,0.01,{...options,scope:'pitch-class'}),1);
    assert.equal(history.intensity(72,0.01,options),0.8);
    history.readSnapshot('th2,1,0;60,0.02,0,0.01,0');
    assert.equal(history.intensity(60,1,{...options,curve:'none'}),1,'Rapid hits survive one snapshot');
    assert.equal(history.readSnapshot('th2,1,0;60,0.02,0,0.03,0'),null);
    assert.equal(history.intensity(60,1,{...options,curve:'none'}),1,'Malformed snapshot retains valid history');
    history.readSnapshot('th1,1,0;60,0.02,0');
    assert.equal(history.intensity(60,1,{...options,curve:'none'}),0.8,'Old host history is a single hit');
    console.log('Trail reinforcement: repeat, expiry, chord scope, octave scope, rapid snapshots and legacy host pass');
}
} finally {rmSync(temporary,{recursive:true,force:true});}
