/** Adapt the upstream browser harness at build time; keep its model and renderers. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function buildMovy({root,source,esbuild}) {
  let harness=await readFile(resolve(source,'browser-test/harness.mjs'),'utf8');
  function replace(before,after){if(!harness.includes(before))throw new Error(`Upstream browser harness changed: ${before}`);harness=harness.replace(before,after)}
  harness=harness.replaceAll(/'\.\.\/dist\/esm\/([^']+)\.js'/g,"'movy/$1.ts'");
  replace("import { MOCK_SYNTHS }     from './mock-synth.mjs';","import { bridge } from '../movy-bridge.mjs';\nawait bridge.connect(); bridge.install();");
  replace('let mockState = {};','');
  replace('globalThis.host_read_file  = () => null;', 'globalThis.host_read_file  = path => path.endsWith("/harmonybus/module.json") ? JSON.stringify(bridge.metadata) : null;');
  replace('mockState[key] ?? null','bridge.read(key)');
  replace('mockState[key] = val; return true;','return bridge.write(key,val);');
  replace("const COMPONENT_KEYS = ['midi_fx1', 'synth', 'fx1', 'fx2'];","const COMPONENT_KEYS = ['midi_fx1'];");
  replace('createModel(portFor(0), k)','createModel(bridge.port(), k)');
  replace('chainModels[chainIndex ?? 1]', 'chainModels[0]');
  replace('const model          = chainModels[1];','const model          = chainModels[0];');
  replace('mockState = { ...MOCK_SYNTHS[id] };','bridge.select(id);');
  replace("loadPreset(sel?.value ?? 'test8');","loadPreset(sel?.value ?? '0');");
  // Pointer capture, rather than mouse-button state, supports touch drags on iPad.
  replace('if (!(e.buttons & 1)) return;', 'if (!el.hasPointerCapture(e.pointerId)) return;');
  replace("el.addEventListener('pointercancel', () => {", "el.addEventListener('lostpointercapture', () => { el.classList.remove('active'); model.handleKnobRelease(); });\n    el.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); model.handleKnobDelta(k, e.key === 'ArrowUp' ? 4 : -4); } });\n    el.addEventListener('keyup', e => { if (e.key.startsWith('Arrow')) model.handleKnobRelease(); });\n    el.addEventListener('pointercancel', () => {");
  replace("el.classList.add('active');", "el.focus(); el.classList.add('active');");
  await writeFile(resolve(root,'build/movy-harness.mjs'),harness);
  await esbuild.build({entryPoints:[resolve(root,'build/movy-harness.mjs')],bundle:true,format:'esm',platform:'browser',external:['/data/*'],outfile:resolve(root,'build/movy.js'),alias:{movy:resolve(source,'src')}});
  let html=await readFile(resolve(source,'browser-test/index.html'),'utf8');
  html=html.replace('<title>Movy Browser Test</title>','<title>Movy · Native HB</title><meta name="viewport" content="width=device-width,initial-scale=1">');
  html=html.replace('<h1>Movy Browser Test</h1>','<h1>Movy browser interface · Native HarmonyBus</h1><p id="native-status">Connecting…</p><p>Existing Movy display and knobs, driven by the real processor. <a href="/">Pad / MIDI diagnostic panel</a></p>');
  html=html.replace('<label>Synth:</label>','<label>Track:</label>').replace(/<select id="preset-select">[\s\S]*?<\/select>/,'<select id="preset-select"><option value="0">1 · Conductor</option><option value="1" selected>2 · Follower</option><option value="2">3 · Follower</option><option value="3">4 · Follower</option></select>');
  html=html.replace('src="harness.mjs"','src="/movy.js"').replaceAll(/class="knob" id="knob-(\d)"/g,'class="knob" id="knob-$1" tabindex="0" role="group" aria-label="Knob $1"');
  html=html.replace('</style>','a{color:#a9ddc0}p{margin-bottom:12px}.toolbar{flex-wrap:wrap}.knob{touch-action:none}.knob:focus-visible{outline:2px solid #9dceab}#display{max-width:100%;height:auto;aspect-ratio:2}.display-wrap,.knob-section,.vm-section{width:640px;max-width:100%}.knob-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.knob-name,.knob-val{max-width:100%;overflow:hidden;text-overflow:ellipsis}.vm-params{width:100%;table-layout:fixed}.vm-params td{overflow-wrap:anywhere}@media(max-width:500px){body{padding:10px}.knob{min-height:95px}.knob-name{font-size:10px}}\n</style>');
  await writeFile(resolve(root,'build/movy.html'),html);
}
