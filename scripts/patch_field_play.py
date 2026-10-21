"""Connect Field Play through existing native, external, and remote UI paths."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_field_play(root: Path) -> None:
    """Install the shared controller and patch explicit mode/input/display seams."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/field'
    (root / 'browser-test/hb-field.mjs').write_text((assets / 'hb-field.mjs').read_text())
    (root / 'src/seq/field-play.ts').write_text((assets / 'field-play.ts').read_text())
    (root / 'src/seq/field-outputs.ts').write_text((assets / 'field-outputs.ts').read_text())
    path: Path = root / 'src/seq/router-buttons.ts'
    source: str = "import { fieldEnabled, setFieldEnabled } from './field-play.js';\n" + path.read_text()
    source = replace_once(source, 'seqState.sessionMode ? 0 : gridEnabled()', 'seqState.sessionMode ? 0 : fieldEnabled() ? 5 : gridEnabled()')
    source = replace_once(source, '(previous + 1) % 5','(previous + 1) % 6')
    source = source.replace('    setJointEnabled(next === 3);','    setFieldEnabled(next === 5);\n    setJointEnabled(next === 3);')
    source = replace_once(source, "'Grid Sequencer'][next]", "'Grid Sequencer', 'Field Play'][next]")
    path.write_text(source)
    path = root / 'src/seq/router-pads.ts'
    source = "import { fieldActive } from './field-play.js';\n" + path.read_text()
    path.write_text(source.replace('!seqState.sessionMode && !gridActive()', '!seqState.sessionMode && !gridActive() && !fieldActive()'))
    path = root / 'src/seq/router.ts'
    source = "import { fieldMidi } from './field-play.js';\n" + path.read_text()
    path.write_text(source.replace('    if (gridMidi(data))', '    if (fieldMidi(data)) return true;\n    if (gridMidi(data))'))
    path = root / 'src/app/tick.ts'
    source = "import { fieldActive, tickField, paintField, renderField } from '../seq/field-play.js';\n" + path.read_text()
    source = source.replace('    tickLaunchpad();','    tickField();\n    tickLaunchpad();')
    source = source.replace('    if(jointActive()){paintJointPads();return;}', '    if(fieldActive()){paintField();return;}\n    if(jointActive()){paintJointPads();return;}')
    source = source.replace('        } else if (gridActive()) {','        } else if (fieldActive()) {\n            renderField();\n        } else if (gridActive()) {')
    path.write_text(source)
    path = root / 'src/app/input-reset.ts'
    path.write_text("import { releaseField } from '../seq/field-play.js';\n" + path.read_text().replace('    resetJointInput();','    releaseField();\n    resetJointInput();'))
    path = root / 'src/app/globals.ts'
    source = "import { fieldPad, fieldPressure, fieldSnapshot, clearFieldOutput, releaseFieldSource } from '../seq/field-play.js';\n" + path.read_text()
    source += "\nObject.assign(globalThis, { fieldPad, fieldPressure, fieldSnapshot, clearFieldOutput, releaseFieldSource });\n"
    path.write_text(source)
    path = root / 'src/surfaces/launchpad.ts'
    source = "import { fieldActive, fieldPad, fieldPressure, fieldColors, clearFieldOutput, releaseFieldSource } from '../seq/field-play.js';\n" + path.read_text()
    source = source.replace('export function releaseLaunchpad(): void {', "export function releaseLaunchpad(): void {\n    releaseFieldSource('launchpad');")
    source = source.replace('if(gridActive()){frameReady=true;}else sample(now);','if(fieldActive()||gridActive()){frameReady=true;}else sample(now);')
    source = source.replace('const desired = gridActive()?', "const desired = fieldActive()?fieldColors('launchpad',8,8):gridActive()?")
    source = replace_once(source,'    const top = type === 176 ?', '''    if(fieldActive()&&index>=0){if(type===160)fieldPressure('launchpad',index,value);else if(type===128||type===144)fieldPad('launchpad',index,type===144&&value>0,8,8,modifier);return;}
    const top = type === 176 ?''')
    source = source.replace('    if (top >= 0 && top < 8) {', '    if(fieldActive()&&modifier&&top===7){if(value)clearFieldOutput();return;}\n    if (top >= 0 && top < 8) {')
    path.write_text(source)
    path = root / 'build/browser.mjs'
    path.write_text(path.read_text().replace('    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/field-play.ts'),\n        resolve(root, 'src/seq/field-outputs.ts'),"))

    path = root / 'src/seq/engine.ts'
    path.write_text(path.read_text().replace('function engineSet(key: string, value: string): void {', 'export const fieldEngineSet = (key: string, value: string): void => engineSet(key, value);\nfunction engineSet(key: string, value: string): void {'))
    # The field samples update a runtime overlay, never the saved clip configs.
    path = root / 'engine/crates/seq-core/src/hb_clip_performance.rs'
    source = path.read_text().replace('    auto_tick: Option<u64>,', '''    auto_tick: Option<u64>,
    pub field_values: [Option<(u8,i32)>;16],
    field_decisions: [Option<(u64,bool,i32)>;16],''')
    source = source.replace('let Some(config)=config.filter(|_|allowed)', 'let Some(mut config)=config.filter(|_|allowed)')
    source = source.replace('let continuous=config.from==1', 'let continuous=self.field_values[lane].is_none()&&config.from==1')
    anchor: str = '            if position<config.from as u64||position>config.through as u64||seed%100>=config.probability as u32 {'
    source = replace_once(source, anchor, '''            if let Some((target,value))=self.field_values[lane] {
                if self.field_decisions[lane].map_or(true,|decision|decision.0!=window) {
                    let probability=if target==1 {value.clamp(0,100) as u8}else{config.probability};
                    let amount=if target==2 {value}else{config.amount};
                    self.field_decisions[lane]=Some((window,seed%100<(probability as u32),amount));
                }
                let (_,accepted,amount)=self.field_decisions[lane].unwrap();
                config.probability=if accepted {100}else{0};config.amount=amount;
            }
''' + anchor)
    source = source.replace('self.automatic.fill(None); }', 'self.automatic.fill(None);self.field_decisions.fill(None); }')
    source = source.replace('pub fn config_changed(&mut self, lane: usize) {', 'pub fn config_changed(&mut self, lane: usize) { self.field_decisions[lane]=None;')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/engine.rs'
    source = replace_once(path.read_text(), '    pub fn hb_auto_config(', '''    /// Shared global lane field values; sampled by existing phrase decisions.
    pub fn hb_field_values(&mut self, message: &str) {
        let mut values=[None;16];
        let Some(entries)=message.strip_prefix("nfv1") else {return;};
        for entry in entries.split(';').filter(|entry|!entry.is_empty()) {
            let Ok(fields)=entry.split(',').map(str::parse::<i32>).collect::<Result<Vec<_>,_>>() else {return;};
            if fields.len()!=3||!(0..16).contains(&fields[0])||!(1..=2).contains(&fields[1])||!(-400..=400).contains(&fields[2]){return;}
            values[fields[0] as usize]=Some((fields[1] as u8,fields[2]));
        }
        for performance in &mut self.hb_performance {performance.field_values=values;}
    }
    pub fn hb_auto_config(''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = path.read_text().replace('    hb_config_generation: u32,', '    hb_config_generation: u32,\n    hb_field_enabled: bool,')
    source = source.replace('            hb_config_generation: u32::MAX,', '            hb_config_generation: u32::MAX,\n            hb_field_enabled: false,')
    source = source.replace('        let message=instance.get_param("midi_fx1:motion_clip_config");', '        self.hb_field_enabled=instance.get_param("midi_fx1:motion_field_active").as_deref()==Some("1");\n        let message=instance.get_param("midi_fx1:motion_clip_config");')
    source = replace_once(source, '    pub fn hb_invalidate_auto(', '''    /// In-process read, at most 20 Hz total, only with field-mapped clip lanes.
    pub fn hb_field_values(&mut self) -> Option<String> {
        if !self.hb_field_enabled {return Some("nfv1".into());}
        for instance in self.slots.iter_mut().flatten() {
            if let Some(value)=instance.get_param("midi_fx1:motion_field_values") {
                if value.starts_with("nfv1") {return Some(value);}
            }
        }None
    }
    pub fn hb_invalidate_auto(''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text().replace('    pads: PadRoute,', '    pads: PadRoute,\n    field_frames: usize,')
    source = source.replace('            pads: PadRoute::new(),','            pads: PadRoute::new(),\n            field_frames: 0,')
    source = replace_once(source, '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 0);', '''        self.field_frames+=out_audio.len()/2;
        if self.field_frames>=host::sample_rate().max(1) as usize/20 {
            self.field_frames=0;
            if let Some(values)=self.chains.hb_field_values(){self.engine.hb_field_values(&values);}
        }
        self.profile.mark(&mut profile_stamp, &mut profile_spans, 0);''')
    path.write_text(source)

    path = root / 'browser-test/hb-joint-panels.mjs'
    path.write_text(path.read_text().replace('[1,2,3,4,0,1,2,3,4,0]', '[1,2,3,4,5,0,1,2,3,4,5,0]').replace('five-mode Session cycle','six-mode Session cycle'))
    path = root / 'engine/crates/seq-core/src/hb_clip_performance.rs'
    source = path.read_text() + '''
#[cfg(test)]
mod field_tests {
    use super::*;
    #[test]
    fn field_probability_is_sampled_once_per_window_without_resetting_phase() {
        let configs=AutoConfig::parse("mca1;0,65,2,6,3,1,1,1,100,0").unwrap();
        let mut performance=Performance::default();
        performance.field_values[0]=Some((1,0));
        performance.update_auto(&configs,0,0,0,0,true);
        assert!(performance.automatic[0].is_none());
        performance.field_values[0]=Some((1,100));
        performance.update_auto(&configs,1,1,0,0,true);
        assert!(performance.automatic[0].is_none());
        performance.update_auto(&configs,384,384,0,0,true);
        let origin=performance.automatic[0].unwrap().origin;
        performance.field_values[0]=Some((1,0));
        performance.update_auto(&configs,385,385,0,0,true);
        assert_eq!(performance.automatic[0].unwrap().origin,origin);
        performance.update_auto(&configs,768,768,0,0,true);
        assert!(performance.automatic[0].is_none());
    }
}
'''
    path.write_text(source)
    # A changed DSP contract must not be mistaken for an already running build.
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-hb200', '0.71.0-hb209-field5'))
