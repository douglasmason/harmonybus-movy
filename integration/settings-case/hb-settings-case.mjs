import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import './hb-chord-settings.mjs';

const shared='../src/vendor/schwung/shared/param_pages/';
const font4=await import(shared+'font4x5.mjs');
const font3=await import(shared+'font5x3.mjs');
const tamzen=await import(shared+'font_tamzen6x12.mjs');
const renderer=await import(shared+'render_page_movy.mjs');
const movy=await import('../dist/esm/font/index.js');
const movy3=await import('../dist/esm/font/index5x3.js');
const {autoShorten,enumSquareLines}=await import('../dist/esm/renderer/shorten.js');
const {schwungLibAvailable,schwungLibError}=await import('../dist/esm/renderer/schwung-lib.js');
assert(schwungLibAvailable(),schwungLibError());

const alphabet='abcdefghijklmnopqrstuvwxyz';
const pixels=new Uint8Array(128*64);
const fillRect=(x,y,w,h,color)=>{
    x=Math.trunc(x);y=Math.trunc(y);w=Math.trunc(w);h=Math.trunc(h);
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
        assert(xx>=0&&xx<128&&yy>=0&&yy<64,'text stays on screen');
        pixels[yy*128+xx]=color?1:0;
    }
};
const ctx={fillRect};
globalThis.fill_rect=fillRect;
globalThis.clear_screen=()=>pixels.fill(0);
const capture=draw=>{pixels.fill(0);draw();return pixels.slice();};
for(const [name,print,height] of [
    ['shared labels',text=>font4.fontPrint4x5(ctx,0,0,text,1),5],
    ['shared condensed',text=>font3.fontPrint5x3(ctx,0,0,text,1),5],
    ['shared value strip',text=>tamzen.fontPrint(ctx,0,0,text,1),7],
    ['Movy chrome',text=>movy.fontPrint(0,0,text,1),5],
    ['Movy condensed',text=>movy3.fontPrint5x3(0,0,text,1),5],
])for(const letter of alphabet){
    const lower=capture(()=>print(letter)),upper=capture(()=>print(letter.toUpperCase()));
    assert(lower.some(Boolean),name+' draws '+letter);
    if('im'.includes(letter))assert.notDeepEqual(lower,upper,name+' distinguishes '+letter);
    assert(!lower.slice(height*128).some(Boolean),name+' keeps its height for '+letter);
    const top='bdfhklt'.includes(letter)?0:1;
    assert(!lower.slice(0,top*128).some(Boolean),name+' keeps '+letter+' below capitals');
    assert(lower.slice(top*128,(top+1)*128).some(Boolean),name+' gives '+letter+' the common body/ascender top');
    assert(lower.slice((height-1)*128,height*128).some(Boolean),name+' gives '+letter+' the common baseline');
}
for(const font of [font4.missingGlyphs4x5,font3.missingGlyphs5x3,tamzen.missingGlyphs])
    assert.equal(font(alphabet+'ABCDEFGHIJKLMNOPQRSTUVWXYZ').size,0);
for(const text of ['Dm','DM','ii','II','vii','VII','Amt','mHz','MIDI']){
    assert.equal(renderer.labelVerbatim(text),text);
    assert.equal(autoShorten(text,126),text);
}
assert.equal(renderer.labelForCell('Reset'),'Reset');
assert.equal(renderer.labelForCell('reset'),'reset');
assert.equal(renderer.labelForCell('RESET'),'RESET');
assert.deepEqual(font3.enumSquareLines('Dm',()=>true),['Dm','']);
assert.deepEqual(font3.enumSquareLines('low-cut'),['low','cut']);
assert.deepEqual(font3.enumSquareLines('-3'),['-3','']);
assert.deepEqual(enumSquareLines('Dm'),['Dm','']);
assert.deepEqual(enumSquareLines('-3'),['-3','']);
assert.notDeepEqual(capture(()=>renderer.drawEnumSquare(ctx,10,0,'Dm')),
                    capture(()=>renderer.drawEnumSquare(ctx,10,0,'DM')));
assert.notDeepEqual(capture(()=>renderer.drawOpaqueBox(ctx,10,0,'Dm')),
                    capture(()=>renderer.drawOpaqueBox(ctx,10,0,'DM')));

// Render the installed controller, not a separate handcrafted settings view.
const chord=await import('../dist/esm/seq/chord-play.js');
const page=chord.chordPage();
const visit=key=>{
    const index=page.ctl.pages.findIndex(candidate=>candidate.keys.includes(key));
    assert(index>=0,key);page.goToPage(index);
    page.ctl.state.touched=-1;page.ctl.state.peek=null;
};
visit('cp_slot_0');
const slot=page.ctl.state.metaIndex.get('cp_slot_1');
Object.assign(slot,{chordName:'Dm',chordRoman:'ii'});
const bank=capture(()=>chord.renderChord());
if(process.env.CASE_PIXELS)writeFileSync(process.env.CASE_PIXELS,JSON.stringify([...bank]));
visit('cp_reset');
const setup=capture(()=>chord.renderChord());
if(process.env.CASE_SETUP_PIXELS)writeFileSync(process.env.CASE_SETUP_PIXELS,JSON.stringify([...setup]));
const {createSchwungPage}=await import('../dist/esm/renderer/schwung-page.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const normal=createSchwungPage(portFor(3),'midi_fx1',{harmonyMode:0});
assert(normal.ready,'Normal Play uses the same packaged renderer');
const normalPixels=capture(()=>normal.render('Normal Play'));
if(process.env.CASE_NORMAL_PIXELS)writeFileSync(process.env.CASE_NORMAL_PIXELS,JSON.stringify([...normalPixels]));
// A raw-device import would silently make these tests pass against a different
// library than the installed bundle. All six entry points must be local.
const door=readFileSync(new URL('../src/renderer/schwung-lib.ts',import.meta.url),'utf8');
assert.equal((door.match(/import\('\.\.\/vendor\/schwung\/shared\/param_pages\//g)||[]).length,6);
assert(!door.includes("import('/data/UserData/schwung/shared/param_pages/"));
console.log('Mixed-case settings: all 26 letters in five fonts, labels, values, enum boxes, shared chord/setup panels and packaged library pass');
