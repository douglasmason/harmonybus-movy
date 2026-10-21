import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
import { installMockEngine } from './mock-engine.mjs';
installEnv();
const engine = installMockEngine();
const { seqEngineTick } = await import('../dist/esm/seq/engine.js');
const { seqState } = await import('../dist/esm/seq/state.js');
const { cpuDetail, toggleCpuDetail, clearCpuPage } = await import('../dist/esm/seq/cpu-page.js');
const { renderCpuView } = await import('../dist/esm/renderer/cpu-view.js');
const { buildCpuPageVM } = await import('../dist/esm/seq/cpu-page-vm.js');
const { appState, VIEW_CPU } = await import('../dist/esm/app/state.js');
engine.status.aprof = '1,1000,0,1,2748,2902,97,1,282,8,434,1,1922,100,3,282,20,500,2,1922,5,1500';
engine.status.rprof = '1,1900,4,1200,ch4:midi_fx1:surface_view0,650,surface_events,50,midi';
seqEngineTick();seqEngineTick();
assert.equal(seqState.cpuRequests, engine.status.rprof);
assert.equal(seqState.cpuProfile, engine.status.aprof);
const pixels = new Uint8Array(128 * 64);
let overflow = false;
globalThis.clear_screen = () => pixels.fill(0);
globalThis.fill_rect = (x, y, width, height, value) => {
    if (x < 0 || y < 0 || x + width > 128 || y + height > 64) overflow = true;
    for (let row = Math.max(0,y); row < Math.min(64,y+height); row++)
        for (let column = Math.max(0,x); column < Math.min(128,x+width); column++) pixels[row*128+column] = Number(!!value);
};
toggleCpuDetail();assert.equal(cpuDetail.page,1);
renderCpuView(buildCpuPageVM());
const audioFrame = pixels.slice();
assert(pixels.slice(59*128).some(Boolean),'same-block track attribution appears in the footer');
toggleCpuDetail();assert.equal(cpuDetail.page,2);
renderCpuView(buildCpuPageVM());
assert.notDeepEqual(pixels,audioFrame);
assert(pixels.slice(17*128,22*128).some(Boolean),'the read name renders in the uppercase-only device font');
assert(pixels.slice(33*128,38*128).some(Boolean),'the write name is visible');
assert.equal(overflow,false,'diagnostics fit the physical 128x64 display');
if (process.env.HB_PROFILE_PREVIEW) {
    const { PNG } = await import('pngjs');
    const { writeFileSync } = await import('node:fs');
    const preview = new PNG({width:128,height:64});
    for (let index=0; index<pixels.length; index++) {
        preview.data.set(pixels[index]?[212,208,200,255]:[0,0,0,255],index*4);
    }
    writeFileSync(process.env.HB_PROFILE_PREVIEW,PNG.sync.write(preview));
}
toggleCpuDetail();assert.equal(cpuDetail.page,0);
appState.currentView=VIEW_CPU;clearCpuPage();assert.equal(cpuDetail.page,0);
console.log('Audio diagnostics: real status parsing, three-page navigation, visible request names and screen bounds pass');
