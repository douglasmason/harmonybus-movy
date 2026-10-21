"""Integrate Session Joint Play with the native pad and recording paths."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_joint_play(root: Path) -> None:
    """Install isolated modules, then connect explicit upstream seams."""
    assets: Path = Path(__file__).resolve().parent.parent / "integration/joint-play"
    for filename, destination in {
        "joint-play.ts": "src/seq/joint-play.ts",
        "joint-panels.ts": "src/seq/joint-panels.ts",
        "hb-joint-panels.mjs": "browser-test/hb-joint-panels.mjs",
        "hb-joint-play.mjs": "browser-test/hb-joint-play.mjs",
        "hb-joint-defaults.mjs": "browser-test/hb-joint-defaults.mjs",
        "joint_route.rs": "engine/crates/movy-dsp/src/joint_route.rs",
        "joint_links.rs": "engine/crates/movy-dsp/src/joint_links.rs",
        "joint_record.rs": "engine/crates/seq-core/src/joint_record.rs",
    }.items():
        (root / destination).write_text((assets / filename).read_text())

    path: Path = root / "engine/crates/seq-core/src/engine.rs"
    source: str = path.read_text()
    source = replace_once(source, "    rec_track: usize,", "    rec_track: usize,\n    joint_record_mask: u16,\n    joint_overwrite_mask: u16,\n    joint_queued_mask: u16,")
    source = replace_once(source, "            rec_track: 0,", "            rec_track: 0,\n            joint_record_mask: 0,\n            joint_overwrite_mask: 0,\n            joint_queued_mask: 0,")
    source = replace_once(source, "            if self.pending_rec {\n                self.tracks[self.rec_track].queued_slot = None;", "            if self.pending_rec {\n                self.joint_cancel_queued();\n                self.tracks[self.rec_track].queued_slot = None;")
    source = source.replace("track != self.rec_track", "!self.records_track(track)")
    source = source.replace("track == self.rec_track", "self.records_track(track)")
    source = source.replace("self.rec_track!=track", "!self.records_track(track)")
    source = source.replace("self.rec_track==track", "self.records_track(track)")
    source = source.replace("self.rec_track == ti", "self.records_track(ti)")
    source = source.replace("self.rec_track==ti", "self.records_track(ti)")
    source = source.replace("ti == self.rec_track", "self.records_track(ti)")
    # Releases are owned by the capture, even after a later take is armed.
    source = replace_once(source, "        self.capture_push(track, pitch, 0, false, false);\n        if track >= NUM_TRACKS || !self.records_track(track) {", "        self.capture_push(track, pitch, 0, false, false);\n        if track >= NUM_TRACKS {")
    source = source.replace(".rposition(|p| p.pitch == pitch)", ".rposition(|p| p.track == track && p.pitch == pitch)")
    source = replace_once(source, "            slot: self.tracks[track].active_clip,\n            start_cycle:", "            slot: if self.joint_record_mask != 0 {self.tracks[track].playing_slot.unwrap_or(self.tracks[track].active_clip)} else {self.tracks[track].active_clip},\n            start_cycle:")
    source = replace_once(source, "        self.commit_rec_tail();\n        self.rec_track = track;", "        self.commit_rec_tail();\n        self.joint_record_mask = 0; self.joint_overwrite_mask = 0;\n        self.rec_track = track;")
    source = replace_once(source, "            for (index,(t,performance)) in self.tracks.iter_mut().zip(self.hb_performance.iter_mut()).enumerate() {", "            self.joint_before_launch();\n            for (index,(t,performance)) in self.tracks.iter_mut().zip(self.hb_performance.iter_mut()).enumerate() {")
    source = replace_once(source, "        self.shared_track(ti,out);", "        if let Some(slot)=self.tracks[ti].playing_slot {self.joint_erase_tick(ti,slot,out);}\n        self.shared_track(ti,out);")
    source = source.replace('            self.hb_performance[ti].update_auto', '            let joint_recording_here = self.recording && self.records_track(ti);\n            self.hb_performance[ti].update_auto').replace('ti,!(self.recording && self.records_track(ti)))', 'ti,!joint_recording_here)')
    source = source.replace('            let muted = self.tracks[ti].muted;', '            let muted = self.tracks[ti].muted || (self.recording && self.joint_overwrite_mask & (1 << ti) != 0 && self.records_track(ti));')
    source += '\ninclude!("joint_record.rs");\n'
    path.write_text(source)

    path = root / "engine/crates/seq-core/src/command.rs"
    source = path.read_text().replace('"rec"', '"rec" | "jrec"', 1)
    source = replace_once(source, '"play" | "stop" | "rec" | "metro"', '"play" | "stop" | "rec" | "jrec" | "metro"')
    source = replace_once(source, '        "rec" => {', '''        "jrec" => {
            if let (Some(mask),Some(overwrite))=(next(),next()) {
                if (1..=65535).contains(&mask) && (0..=65535).contains(&overwrite) {
                    engine.toggle_joint_record(mask as u16,overwrite as u16);
                }
            }
        }
        "rec" => {''')
    path.write_text(source)

    path = root / "engine/crates/movy-dsp/src/lib.rs"
    source = path.read_text()
    source = replace_once(source, 'mod pad_route;', 'mod pad_route;\nmod joint_route;\nmod joint_links;')
    source = replace_once(source, '    pads: PadRoute,', '    pads: PadRoute,\n    joint: joint_route::JointRoute,\n    joint_links: joint_links::JointLinks,')
    source = replace_once(source, '            pads: PadRoute::new(),', '            pads: PadRoute::new(),\n            joint: joint_route::JointRoute::new(),\n            joint_links: joint_links::JointLinks::new(),')
    source = replace_once(source, '    fn surface_event(&mut self, event: surface_route::Event) {', '''    fn joint_follow(&mut self, event: surface_route::Event, playback: bool) {
        if let Some(derived)=self.joint_links.route(event,playback) {
            if playback {self.chains.hb_playback(derived.track,false);}
            if derived.status==0xa0 {self.chains.set_param(derived.track,"midi_fx1:hb_pressure_full_velocity",if derived.full_velocity {"1"} else {"0"});}
            self.chains.on_midi(derived.track,&[derived.status,derived.pitch,derived.value],MOVE_MIDI_SOURCE_INTERNAL);
            if playback {self.chains.hb_playback_done(derived.track);} else if derived.status==0x90 {
                // A derived gesture is regenerated from its source, never captured
                // into the destination clip or left queued for a later pad take.
                for _ in 0..64 {
                    let Some(action)=self.chains.get_param(derived.track,"midi_fx1:hb_record_action") else {break;};
                    if !["ra1,","ra2,","ra3,","ra4,"].iter().any(|prefix|action.starts_with(prefix)){break;}
                }
            }
        }
    }
    fn surface_event(&mut self, event: surface_route::Event) {''')
    source = replace_once(source, '        self.chains.on_midi(track, &[event.status, event.pitch, event.value], MOVE_MIDI_SOURCE_INTERNAL);', '        self.chains.on_midi(track, &[event.status, event.pitch, event.value], MOVE_MIDI_SOURCE_INTERNAL);\n        self.joint_follow(event,false);')
    source = replace_once(source, '            "padpressure" => {', '''            "joint_map" => {self.joint.set_map(val);}
            "joint_release" => {
                for event in self.joint.release_all().into_iter().flatten() {self.surface_event(event);}
            }
            "joint_links" => {
                // Release old derived voices before changing their source.
                if self.joint_links.set(val) {for (event,playback) in self.joint_links.drain() {if playback {self.chains.hb_playback(event.track,false);}self.chains.on_midi(event.track,&[0x80,event.pitch,0],MOVE_MIDI_SOURCE_INTERNAL);if playback {self.chains.hb_playback_done(event.track);}}}
            }
            "padpressure" => {''')
    source = replace_once(source, '                    if let Some((chain, pitch, pressure)) = self.pads.pressure(pad, pressure) {', '''                    for event in self.joint.route(0xa0,pad,pressure,self.pads.full_velocity()).into_iter().flatten() {self.surface_event(event);}
                    if let Some((chain, pitch, pressure)) = self.pads.pressure(pad, pressure) {''')
    source = replace_once(source, '                if let Some((chain, pitch, vel, on)) = i.pads.route(status, d1, d2) {', '''                if (68..100).contains(&d1) && matches!(status & 0xf0,0x80|0x90|0xa0) {
                    let active=i.joint.active();
                    let events=i.joint.route(status,d1,d2,i.pads.full_velocity());
                    let owned=events.iter().any(Option::is_some);
                    for event in events.into_iter().flatten() {i.surface_event(event);}
                    if active || owned {return;}
                }
                if let Some((chain, pitch, vel, on)) = i.pads.route(status, d1, d2) {''')
    # Playback-derived events take the same HB input path, without re-recording.
    for on, event_name in ((True, "NoteOn"), (False, "NoteOff")):
        marker: str = f'                OutEvent::{event_name} {{ track, pitch' + (', vel } | OutEvent::RenderedOn { track,pitch,vel } => {' if on else ' } | OutEvent::RenderedOff { track,pitch } => {')
        extra: str = '\n                    if self.joint_links.derived(track as usize) {continue;}\n'
        extra += f'                    self.joint_follow(surface_route::Event{{track:track as usize,pitch,status:{"0x90" if on else "0x80"},value:{"vel" if on else "0"},approach:None,full_velocity:false}},true);'
        # Conductor must be processed before a dependent follower attack.
        # Hook after its own chain dispatch, below the match arm.
        start: int = source.index(marker)
        end: int = source.index('\n                OutEvent::', start + len(marker))
        block: str = source[start:end]
        block = block.replace(marker, marker + '\n                    let Some(pitch)=self.joint_links.playback_pitch(track as usize,pitch,' + ('true' if on else 'false') + ') else {continue;};', 1)
        close: int = block.rfind('\n                }')
        block = block[:close] + '\n' + extra.split('\n', 2)[2] + block[close:]
        source = source[:start] + block + source[end:]
    source = replace_once(source, '                    i.chains.on_midi(chain, &m, MOVE_MIDI_SOURCE_INTERNAL);', '                    i.chains.on_midi(chain, &m, MOVE_MIDI_SOURCE_INTERNAL);\n                    i.joint_follow(surface_route::Event{track:chain,pitch,status:m[0],value:m[2],approach:if on {i.pads.approach(d1).map(|(_,shift)|(shift,i.pads.approach_row(d1) as u8))} else {None},full_velocity:i.pads.full_velocity()},false);')
    source = replace_once(source, '                OutEvent::PolyPressure { track,pitch,value } => {', '                OutEvent::PolyPressure { track,pitch,value } => {\n                    let Some(pitch)=self.joint_links.playback_pressure(track as usize,pitch) else {continue;};')
    start = source.index('                OutEvent::PolyPressure { track,pitch,value } => {')
    end = source.index('                OutEvent::Click { accent } => {',start)
    block = source[start:end]
    close = block.rfind('                }')
    block = block[:close] + '                    self.joint_follow(surface_route::Event{track:track as usize,pitch,status:0xa0,value,approach:None,full_velocity:self.pads.full_velocity()},true);\n' + block[close:]
    source = source[:start] + block + source[end:]
    path.write_text(source)

    path = root / "src/seq/router.ts"
    source = "import { jointMidi } from './joint-play.js';\n" + path.read_text()
    source = replace_once(source, '    /* Session mode owns the 32 pads as the clip grid. */', '    if (jointMidi(data)) return true;\n\n    /* Session mode owns the 32 pads as the clip grid. */')
    path.write_text(source)

    path = root / "src/seq/router-buttons.ts"
    source = "import { jointAvailable, jointEnabled, setJointEnabled } from './joint-play.js';\n" + path.read_text()
    source = replace_once(source, '            seqState.sessionMode = false; // tap while already in Session → back to Note', '            seqState.sessionMode = false;\n            if (jointAvailable()) setJointEnabled(true); // Session -> Joint Play')
    path.write_text(source)

    path = root / "src/track/pad-route.ts"
    source = "import { jointActive } from '../seq/joint-play.js';\n" + path.read_text()
    source = replace_once(source, '    const owns = padsPlayNotes()', '    const owns = !jointActive() && padsPlayNotes()')
    path.write_text(source)
    path = root / "src/seq/engine.ts"
    source = "import { syncJoint } from './joint-play.js';\n" + path.read_text()
    source = replace_once(source, '    syncPadRoute(engineSet);', '    syncPadRoute(engineSet);\n    syncJoint(engineSet);')
    path.write_text(source)
    path = root / "src/undo/rec-pass.ts"
    source = "import { jointRecordCommand } from '../seq/joint-play.js';\n" + path.read_text()
    source = replace_once(source, "    seqCtl('rec ' + track);", "    seqCtl(jointRecordCommand() ?? ('rec ' + track));")
    path.write_text(source)
    path = root / "src/undo/verbs.ts"
    path.write_text(path.read_text().replace("'play', 'stop', 'rec',", "'play', 'stop', 'rec', 'jrec',"))
    path = root / "src/app/input-reset.ts"
    source = "import { resetJointInput } from '../seq/joint-play.js';\n" + path.read_text()
    source = replace_once(source, 'export function resetHeldInput(notifyEngine: boolean): void {', 'export function resetHeldInput(notifyEngine: boolean): void {\n    resetJointInput();')
    path.write_text(source)
    path = root / "src/app/tick.ts"
    source = "import { jointActive, paintJointPads, renderJoint } from '../seq/joint-play.js';\n" + path.read_text()
    source = replace_once(source, 'export function paintMelodicPads(): void {', 'export function paintMelodicPads(): void {\n    if(jointActive()){paintJointPads();return;}')
    source = source.replace('refreshHarmonyPads(appState.activeTrack.index);', 'if(!jointActive())refreshHarmonyPads(appState.activeTrack.index);')
    source = replace_once(source, '        } else if (appState.currentView === VIEW_MAIN_PARAMS) {', '        } else if (jointActive()) {\n            renderJoint();\n        } else if (appState.currentView === VIEW_MAIN_PARAMS) {')
    path.write_text(source)
    path = root / "src/seq/ui-state.ts"
    source = "import { jointSnapshot, restoreJoint } from './joint-play.js';\n" + path.read_text()
    source = replace_once(source, '        padTrails: trailSettingsSnapshot(),', '        jointPlay: jointSnapshot(),\n        padTrails: trailSettingsSnapshot(),')
    source = replace_once(source, '        restoreTrailSettings(o.padTrails);', '        restoreTrailSettings(o.padTrails);\n        restoreJoint(o.jointPlay ?? Array.from({length:4},()=>({bass:1,comp:1})));')
    source = replace_once(source, 'export function resetUiState(): void {', 'export function resetUiState(): void {\n    restoreJoint(null);')
    source = replace_once(source, "s: t === 0 ? HB_FRESH_CONDUCTOR + ';freshrole1' : t >= 12 ? HB_FRESH_RECEIVERS[pos] : pos === 0 ? HB_FRESH_CONDUCTOR : HB_FRESH_FOLLOWERS[pos - 1]", "s: jointFreshState(pos) + (t === 0 ? ';freshrole1' : '')")
    source = replace_once(source, "...(t < 12 ? [{ c: 'synth', m: 'plaits' }] : []),", "{ c: 'synth', m: 'plaits' },")
    source = replace_once(source, 'function freshHarmonyBusChains() {', '''export function jointFreshState(role: number): string {
    const sections=(role===0?HB_FRESH_CONDUCTOR:HB_FRESH_FOLLOWERS[role-1]).split(';');
    const prefix=sections[0].split(',');
    prefix[12]=String(role===0?-1:role); // render channel, zero based
    prefix[23]=String(role===1?3:7); // stored travel enum: Closest Split / None
    sections[0]=prefix.join(',');
    const chord=sections.findIndex(section=>section.startsWith('cp1,'));
    const values=sections[chord].split(',');
    if(role===2){values[1]='2';values[3]='8';} // Conductor Chord, Played Top Note
    sections[chord]=values.join(',');
    return sections.join(';');
}

function freshHarmonyBusChains() {''')
    path.write_text(source)

    path = root / "build/browser.mjs"
    source = replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/joint-play.ts'),\n        resolve(root, 'src/seq/joint-panels.ts'),")
    path.write_text(source)

    path = root / "browser-test/logic/tracks-chain.mjs"
    source = path.read_text().replace('(12 * 2 + 4) * 3', '16 * 2 * 3')
    source = source.replace('track < 12 ? track * 6 : 72 + (track - 12) * 3', 'track * 6')
    source = source.replace("if (track < 12) eq('fresh synth", "eq('fresh synth")
    source = source.replace('track >= 12 ? 3 : track % 4 === 0 ? 0 : 1', 'track % 4 === 0 ? 0 : 1')
    source = source.replace('track % 4 === 0 ? 2 : track % 4', 'track % 4 === 0 ? -1 : track % 4')
    path.write_text(source)

    path = root / "src/surfaces/controls.ts"
    source = path.read_text()
    source = replace_once(source, "function laneFor(page: SchwungPage, key: string): number {", """/** Shared latch ownership for every surface, including Joint Play. */
export function setControlLatch(owner: PerformancePort, touchKey: string, latchKey: string, on: boolean): void {
    const actions = touches.get(owner.performanceTrack ?? owner), action = actions?.get(touchKey);
    if (action) { action.done = true; actions!.delete(touchKey); }
    owner.performanceSet(latchKey, on ? 'LatchOn' : 'LatchOff'); approachTouched(owner);
}
function laneFor(page: SchwungPage, key: string): number {""")
    source = replace_once(source, """    const actions = touches.get(page.performanceTrack ?? page), action = actions?.get(touchKey);
    if (action) { action.done = true; actions!.delete(touchKey); }
    page.performanceSet(latchKey, on ? 'LatchOn' : 'LatchOff'); approachTouched(page);""", "    setControlLatch(page, touchKey, latchKey, on);")
    path.write_text(source)

    path = root / "src/renderer/schwung-page.ts"
    source = path.read_text()
    source = replace_once(source, "export function createSchwungPage(port: TrackPort, componentKey = 'synth'): SchwungPage {", "export function createSchwungPage(port: TrackPort, componentKey = 'synth', options: {harmonyMode?: number; hierarchy?: (value:any)=>any} = {}): SchwungPage {\n    const harmonyMode=():number=>options.harmonyMode ?? flagValue('hbsteprow');")
    source = source.replace("plannedStepMode = flagValue('hbsteprow')", "plannedStepMode = harmonyMode()")
    source = source.replace("plannedStepMode !== flagValue('hbsteprow')", "plannedStepMode !== harmonyMode()")
    source = source.replace("hbStepHierarchy(hierarchy, flagValue('hbsteprow'), motifEditorFor(port.track.index))", "(options.hierarchy ?? ((value:any)=>value))(hbStepHierarchy(hierarchy, harmonyMode(), motifEditorFor(port.track.index)))")
    source = source.replace("keyContext==='key_center'||keyContext==='parallel_mode'||keyContext==='dominant_color'", "keyContext==='key_center'||keyContext==='parallel_mode'||keyContext==='dominant_color'||keyContext==='joint_chromatic_below'")
    source = source.replace("key==='key_center'||key==='parallel_mode'||key==='dominant_color'", "key==='key_center'||key==='parallel_mode'||key==='dominant_color'||key==='joint_chromatic_below'")
    source = source.replace("if(appState.shiftHeld){editKeyContextSetting(key,slot,0);return;}", "if(appState.shiftHeld){if(key!=='joint_chromatic_below')editKeyContextSetting(key,slot,0);return;}")
    source = source.replace("                    editKeyContextSetting(keyContext,slot,delta);", "                    if(keyContext!=='joint_chromatic_below')editKeyContextSetting(keyContext,slot,delta);")
    path.write_text(source)

    path = root / "src/renderer/hb-performance.ts"
    source = "import { jointActive } from '../seq/joint-play.js';\nimport { jointPage } from '../seq/joint-panels.js';\n" + path.read_text()
    source = replace_once(source, "    const mode = flagValue('hbsteprow');", "    const mode = jointActive()?2:flagValue('hbsteprow');")
    source = replace_once(source, "export function hbPerformancePage(): PerformancePort | null {", "export function hbPerformancePage(): PerformancePort | null {\n    if(jointActive()){syncHbPerformanceMode();const page=jointPage();syncApproachOwner(page);return page;}")
    source = source.replace("if (flagValue('hbsteprow') === 2) return approachStep(data,owner);", "if (jointActive() || flagValue('hbsteprow') === 2) return approachStep(data,owner);")
    path.write_text(source)
    source = source.replace("if(flagValue('hbsteprow')===2)return paintApproach(owner);", "if(jointActive()||flagValue('hbsteprow')===2)return paintApproach(owner);")
    source = source.replace("const active = hbPerformancePage() !== null;", "const performancePage=hbPerformancePage(),active=performancePage!==null;\n    const footerTrack=jointActive()?performancePage?.performanceTrack??appState.activeTrack.index:appState.activeTrack.index;")
    source = source.replace("harmonyFooterText(active?flagValue('hbsteprow'):0,appState.activeTrack.index,harmonyFooterSnapshot(appState.activeTrack.index))", "harmonyFooterText(active?(jointActive()?2:flagValue('hbsteprow')):0,footerTrack,harmonyFooterSnapshot(footerTrack))")
    path.write_text(source)
    path = root / "src/renderer/hb-approach.ts"
    source = "import { jointActive, jointApproachRowsActive } from '../seq/joint-play.js';\n" + path.read_text()
    source = replace_once(source, "return keyboardState.layout===2||keyboardState.layout===3;", "return jointActive()?jointApproachRowsActive():keyboardState.layout===2||keyboardState.layout===3;")
    path.write_text(source)
