// Count work at the actual port/parser boundary, using the real shared controller.
import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {appState}=await import('../dist/esm/app/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {setSettingsOpen}=await import('../dist/esm/seq/hb-settings.js');
selectTrack(3);setSettingsOpen(false);seqState.sessionMode=false;
chord.restoreChord(null);chord.setChordEnabled(true);
const frame='cb1|2741|-1,0,0,0,0,0|'+Array.from({length:21},()=> '0,145,2741,1,0,0,1,0,C,1').join('|');
let bankFrame=frame,queueFrame='cq1|2|0|C|C|0|0|2|1',now=100000;
Date.now=()=>now;
let reads={},writes=[],payloadBuilds=0,bankSerializations=0,bankParses=0;
for(let track=0;track<16;track++){
    const port=portFor(track),get=port.getParam.bind(port),set=port.setParam.bind(port);
    port.getParam=key=>{
        reads[key]=(reads[key]??0)+1;
        if(key==='midi_fx1:hb_chord_bank_snapshot')return bankFrame;
        if(key==='midi_fx1:hb_chord_queue_status')return queueFrame;
        return get(key);
    };
    port.setParam=(key,value)=>{writes.push([track,key,value]);return set(key,value);};
}
const originalJoin=Array.prototype.join,originalStringify=JSON.stringify,originalSplit=String.prototype.split;
Array.prototype.join=function(separator){if(separator===';'&&this.length===21)payloadBuilds++;return originalJoin.call(this,separator);};
JSON.stringify=function(value,...args){if(value?.slots?.length===21&&Array.isArray(value.active))bankSerializations++;return originalStringify.call(JSON,value,...args);};
String.prototype.split=function(separator,...args){if(separator==='|'&&String(this).startsWith('cb1|'))bankParses++;return originalSplit.call(this,separator,...args);};
const resetCounts=()=>{reads={};writes=[];payloadBuilds=bankSerializations=bankParses=0;};
const tick=(elapsed=10)=>{now+=elapsed;chord.tickChord();};
const panel=chord.chordPanelPort(3),metadata=JSON.parse(panel.getParam('midi_fx1:chain_params'));
const put=(key,value)=>assert(panel.setParam('midi_fx1:'+key,value));
try{
    for(const playing of [false,true])for(const queued of [false,true]){
        seqState.playing=playing;put('cp_play_mode',queued?'Queued':'Immediate');tick(1000);resetCounts();
        for(let index=0;index<100;index++)tick();
        const metrics={playing,queued,ticks:100,simulatedMs:1000,payloadBuilds,bankParses,bankSerializations,
            snapshotReads:reads['midi_fx1:hb_chord_bank_snapshot']??0,routingReads:reads['midi_fx1:render_channel']??0,
            queueReads:reads['midi_fx1:hb_chord_queue_status']??0};
        assert.equal(payloadBuilds,0,'unchanged definitions are not rebuilt');
        assert.equal(bankParses,0,'unchanged native wire is not reparsed');
        assert.equal(bankSerializations,0,'no parsed-bank serialization comparisons');
        assert.equal(metrics.snapshotReads,playing?20:4,'live snapshot cadence is preserved');
        assert.equal(metrics.routingReads,4,'routing retains external-change discovery');
        assert.equal(metrics.queueReads,queued?10:0,'queue feedback retains its cadence');
        for(const key of ['hb_chord_active','next_harmony','final_harmony','sounding_key'])assert.equal(reads['midi_fx1:'+key]??0,0,'hidden overview does not read '+key);
        assert(!writes.some(([,key])=>key==='midi_fx1:hb_chord_bank'));
        console.log('UI overhead: '+originalStringify(metrics));
    }

    // Every editor mutation travels through the same virtual port as knob turns.
    const wireFor=slots=>slots.map(slot=>[slot.root,slot.quality,slot.form,slot.policy,slot.tonic,slot.scale,slot.bass,slot.intent,slot.target].join(',')).join(';');
    for(const key of ['cp_intent','cp_target','cp_root','cp_quality','cp_form','cp_policy','cp_tonic','cp_scale','cp_bass','cp_enabled','cp_slot_7']){
        const meta=metadata.find(item=>item.key===key),previous=panel.getParam('midi_fx1:'+key);
        const value=meta.options.find(option=>option!==previous);
        const before=wireFor(chord.chordSnapshot().slots);
        resetCounts();put(key,value);tick(0);
        assert.equal(payloadBuilds,1,key+' invalidates definitions');
        const expected=wireFor(chord.chordSnapshot().slots);
        if(before!==expected)assert.equal(writes.find(([,key])=>key==='midi_fx1:hb_chord_bank')?.[2],expected,key+' reaches native bank immediately');
    }
    resetCounts();put('cp_selected','1');put('cp_colorView','Intent + Scale');tick(0);
    assert.equal(payloadBuilds,0,'selection and color display do not alter definitions');

    // External routing changes still take effect within the bounded 250 ms poll.
    const conductor=portFor(0);
    conductor.setParam('midi_fx1:render_channel','3');tick(250);
    assert.equal(panel.getParam('midi_fx1:cp_sound_path'),'C1>3');
    conductor.setParam('midi_fx1:render_channel','Off');tick(250);
    assert.equal(panel.getParam('midi_fx1:cp_sound_path'),'Comp T3');
    put('cp_track_0_render_channel','4');tick(0);
    assert.equal(panel.getParam('midi_fx1:cp_sound_path'),'C1>4','local alias invalidates routing immediately');
    const compState=chord.chordCompState();chord.setChordCompSource(1);tick(0);
    assert.equal(panel.getParam('midi_fx1:cp_sound_path'),'Comp T3');
    conductor.setParam('midi_fx1:render_channel','4');chord.restoreChordCompState(compState);tick(0);
    assert.equal(panel.getParam('midi_fx1:cp_sound_path'),'C1>4','Undo restore refreshes routing immediately');

    const saved=chord.chordSnapshot();chord.restoreChord(saved);chord.setChordEnabled(true);resetCounts();tick(0);
    assert.equal(payloadBuilds,1);assert.equal(bankParses,1,'restore rehydrates identical native wire');
    resetCounts();chord.resetChordDefaults();tick(0);assert.equal(payloadBuilds,1);assert.equal(bankParses,1);
    put('cp_play_mode','Queued');tick(100);
    assert(chord.chordSlotQueued(0));chord.harmonyOff();assert(!chord.chordSlotQueued(0));
    resetCounts();tick(0);assert.equal(bankParses,1,'local Off mutation forces a fresh native snapshot');assert(chord.chordSlotQueued(0));
    bankFrame='--';tick(50);assert(!chord.chordSlotQueued(0));
    bankFrame=frame;resetCounts();tick(50);assert.equal(bankParses,1,'unavailable snapshot recovers even to the same wire');
    bankFrame='cb1|invalid';tick(50);assert(chord.chordSlotQueued(0),'malformed snapshot preserves last accepted state');
    bankFrame=frame.replaceAll(',C,1',',Dm,1');tick(50);
    assert.equal(panel.getParam('midi_fx1:cp_resolved'),'Dm','changed names still reach the shared control');
    resetCounts();chord.setJointChordConductor(5);chord.tickChordSurface(chord.chordPage());
    assert(writes.some(([track,key])=>track===5&&key==='midi_fx1:hb_chord_bank'),'owner change sends definitions to the new conductor');
    chord.setJointChordConductor(null);tick(100);

    appState.dirty=false;queueFrame='cq1|2|1|C|C|0|0|2|1';tick(100);
    assert(appState.dirty,'queue cursor advances repaint even when names match');
    resetCounts();assert.equal(panel.getParam('midi_fx1:cp_status_effective')!==undefined,true);
    assert.equal(reads['midi_fx1:final_harmony'],1,'overview data remains available on demand');
    panel.getParam('midi_fx1:cp_status_key');assert.equal(reads['midi_fx1:final_harmony'],1,'overview fields share one read');
    queueFrame='';conductor.setParam('midi_fx1:chord_queue_depth','3');tick(100);
    assert.equal(panel.getParam('midi_fx1:cp_queue_count'),'Fill 0/3','older/missing queue snapshot retains depth fallback');
    resetCounts();panel.getParam('midi_fx1:cp_queue_current');assert.equal(reads['midi_fx1:final_harmony'],1,'current-chord fallback reads harmony only when requested');
    resetCounts();tick(-1000);assert.equal(reads['midi_fx1:hb_chord_bank_snapshot'],1);assert.equal(reads['midi_fx1:render_channel'],1,'clock rewind refreshes bounded caches');
}finally{Array.prototype.join=originalJoin;JSON.stringify=originalStringify;String.prototype.split=originalSplit;}
console.log('UI overhead: editor/reset/restore/owner/Off invalidation, external routing, queue cursor/fallback and overview demand pass');
