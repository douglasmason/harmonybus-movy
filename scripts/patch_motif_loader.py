"""Install the bounded motif-to-clip writer and its preview panel."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_motif_loader(root: Path) -> None:
    integration = Path(__file__).resolve().parents[1] / 'integration/performance'
    core = root / 'engine/crates/seq-core/src'
    (core / 'motif_load.rs').write_text((integration / 'motif_load.rs').read_text())
    path = core / 'lib.rs'
    path.write_text(replace_once(path.read_text(), 'pub mod clip_tools;', 'pub mod clip_tools;\npub mod motif_load;'))
    path = core / 'engine.rs'
    source = replace_once(path.read_text(), '    pub hb_performance:', '    pub motif_load_result: String,\n    pub hb_performance:')
    source = replace_once(source, '            hb_performance:', '            motif_load_result: String::new(),\n            hb_performance:')
    path.write_text(source)
    path = core / 'command.rs'
    source = path.read_text().replace('| "cfill" |', '| "cfill" | "mload" |')
    source = replace_once(source, '        "cfill" => {', '        "mload" => engine.motif_load(op, out),\n        "cfill" => {')
    path.write_text(source)
    path = core / 'follower_input.rs'
    source = path.read_text().replace('[&[i32];17]', '[&[i32];19]').replace('(1..=17)', '(1..=19)')
    source = replace_once(source, '    &[0,2,4,6,8,10], &[0,3,4,7,8,11],', '    &[0,2,4,6,8,10], &[0,3,4,7,8,11],\n    &[0,2,3,5,7,9,10], &[0,2,4,5,7,8,11],')
    path.write_text(source)
    path = core / 'recorded_actions.rs'
    source = path.read_text().replace('8063| (4095u64<<43)', '8063| (1u64<<63) | (4095u64<<43)')
    source = source.replace('((actions[LANES]>>5)&8))>13', '((actions[LANES]>>5)&8)|((actions[LANES]>>59)&16))>17')
    source = source.replace('((approach&63)>58 && (approach&63)!=60)', '(approach&63)>63')
    source = source.replace('(approach&63)==60', '(approach&63)>=59').replace('scale<=17', 'scale<=19')
    source = source.replace('for code in 1..=60u64', 'for code in 1..=63u64').replace('            if code==59 {continue;}\n', '').replace('code==60 {1}else{32}', 'code>=59 {1}else{32}').replace('[59,61,63,64,65]', '[64,65,123,125,127]')
    source = source.replace('else{word>>55==0}', 'else{(word>>55)&255==0}').replace(' || (approach&63)>63', '').replace('operation(*word)!=52)', 'operation(*word)!=52 && !(57..=60).contains(&operation(*word)))')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = replace_once(path.read_text(), '            "clip_input_info" =>', '            "motif_load_result" => Some(self.engine.motif_load_result.clone()),\n            key if key.starts_with("motif_clip_info_") => key[16..].parse::<usize>().ok().map(|track|self.engine.motif_clip_info(track)),\n            "clip_input_info" =>')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(path.read_text().replace("'cq', 'cfill',", "'cq', 'cfill', 'mload',"))
    (root / 'src/renderer/hb-motif-loader.ts').write_text((integration / 'hb-motif-loader.ts').read_text())
    path = root / 'src/renderer/schwung-page.ts'
    source = "import { motifLoaderPanels, motifLoaderTouch, motifLoaderTurn, drawMotifLoader } from './hb-motif-loader.js';\n" + path.read_text()
    source = replace_once(source, '                    const hierarchy = JSON.parse(v), operation = hierarchy.levels?.motion_operation;', '                    const hierarchy = JSON.parse(v), operation = hierarchy.levels?.motion_operation;\n                    motifLoaderPanels(hierarchy);')
    source = replace_once(source, '        knobTouch: (slot: number, down: boolean) => {', '        knobTouch: (slot: number, down: boolean) => {\n            if(hostedModuleId===\'harmonybus\'&&motifLoaderTouch(lanePort,ctl.keyAt(slot),slot,down)){touchPaintPending=true;return;}')
    source = replace_once(source, '        knobTurn: (slot: number, delta: number) => {', '        knobTurn: (slot: number, delta: number) => {\n            if(motifLoaderTurn(lanePort,slot,delta))return;')
    source = replace_once(source, '        render(title: string, auto?: AutomationView, _touched = -1) {', '        render(title: string, auto?: AutomationView, _touched = -1) {\n            if(drawMotifLoader(lanePort))return;')
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    path.write_text(replace_once(path.read_text(), "const commonPanels = new Set(['root', 'follower_source']);", "const commonPanels = new Set(['root', 'follower_source', 'motif_load', 'motif_targets']);"))
    path = root / 'src/renderer/hb-approach.ts'
    source = replace_once(path.read_text(), '        release,\n    ];', "        release,\n        {key:'motif_placement',name:'Motif Target',type:'enum',options:['Saved','End','Start','Both','Omit'],options_as_string:true,default:'Saved'},\n    ];")
    path.write_text(source)
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), "        resolve(root, 'src/renderer/hb-motif.ts'),", "        resolve(root, 'src/renderer/hb-motif.ts'),\n        resolve(root, 'src/renderer/hb-motif-loader.ts'),\n        resolve(root, 'src/renderer/hb-step-panels.ts'),"))

    (root / "browser-test/hb-motif-loader.mjs").write_text((integration.parent / "hb-motif-loader.mjs").read_text())
