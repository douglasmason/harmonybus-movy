"""Add a held-arrow step move while retaining short-arrow timing nudges."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_step_move(root: Path) -> None:
    """Move step anchors and preserve per-note data through ordinary undo."""
    path: Path = root / 'engine/crates/seq-core/src/clip.rs'
    source: str = path.read_text()
    marker: str = '    /// Sub-step nudge:'
    offset: int = source.index(marker)
    source = source[:offset]+'''    /// Move note entries by whole steps, retaining their timing offsets and
    /// owned metadata. Reject out-of-range group moves instead of collapsing
    /// several source steps onto the same boundary.
    pub fn move_steps(&mut self, s0: u16, s1: u16, lane: Option<u8>, delta: i32) {
        let max_step = (self.length_ticks() / TICKS_PER_STEP).saturating_sub(1) as i32;
        if s0 as i32 + delta < 0 || s1 as i32 + delta > max_step { return; }
        let end = self.length_ticks().saturating_sub(1) as i32;
        for note in &mut self.notes {
            if !Self::note_matches(note, s0, s1, lane) { continue; }
            note.step = (note.step as i32 + delta) as u16;
            note.tick = (note.tick as i32 + delta * TICKS_PER_STEP as i32).clamp(0,end) as u32;
        }
        let mut moved_trigs: Vec<Trig> = self.trigs.iter().copied().filter(|trig|
            trig.step >= s0 && trig.step <= s1 && (lane.is_none() || trig.lane == lane)).collect();
        if let Some(pitch) = lane {
            // A drum note inherits the source step's probability/condition when
            // there is no pitch-specific override. Preserve that resolved value.
            for step in s0..=s1 {
                if !moved_trigs.iter().any(|trig| trig.step == step) {
                    moved_trigs.push(Trig {step,lane:Some(pitch),props:self.governing_trig(step,pitch)});
                }
            }
        }
        self.trigs.retain(|trig| !(trig.step >= s0 && trig.step <= s1 && (lane.is_none() || trig.lane == lane)));
        for mut trig in moved_trigs {
            trig.step = (trig.step as i32 + delta) as u16;
            self.trigs.retain(|existing| existing.step != trig.step || existing.lane != trig.lane);
            if self.trigs.len() < MAX_TRIGS { self.trigs.push(trig); }
        }
        if lane.is_none() {
            let moved_locks: Vec<Lock> = self.locks.iter().copied().filter(|lock| lock.step >= s0 && lock.step <= s1).collect();
            self.locks.retain(|lock| lock.step < s0 || lock.step > s1);
            for mut lock in moved_locks {
                lock.step = (lock.step as i32 + delta) as u16;
                self.locks.retain(|existing| existing.step != lock.step || existing.lane != lock.lane);
                self.locks.push(lock);
            }
        }
    }

'''+source[offset:]
    source += """
#[cfg(test)]
mod hb_step_move_tests {
    use super::*;
    #[test]
    fn moves_anchor_offset_and_metadata_without_touching_other_lane() {
        let mut clip = Clip::new();
        clip.push_note(4,60,91,false);
        clip.push_note(4,64,73,false);
        clip.notes[0].tick += 3;
        clip.notes[0].pressure.push((2,55));
        clip.trigs.push(Trig {step:4,lane:None,props:TrigProps{prob:42,..TrigProps::DEFAULT}});
        clip.move_steps(4,4,Some(60),1);
        assert_eq!((clip.notes[0].step,clip.notes[0].tick),(5,123));
        assert_eq!(clip.notes[0].pressure,vec![(2,55)]);
        assert_eq!(clip.notes[1].step,4);
        assert_eq!(clip.governing_trig(5,60).prob,42);
        assert_eq!(clip.governing_trig(4,64).prob,42);
        clip.move_steps(5,5,Some(60),-1);
        assert_eq!((clip.notes[0].step,clip.notes[0].tick),(4,99));
        let before=clip.clone();clip.move_steps(4,4,None,-5);
        assert_eq!(clip.notes,before.notes);
    }
}
"""
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/command.rs' 
    source = path.read_text().replace('"enudge" | "etrn"','"enudge" | "emove" | "etrn"')
    source = replace_once(source, '"enudge" => clip.nudge(a, b, lane, dv),','"enudge" => clip.nudge(a, b, lane, dv),\n                        "emove" => clip.move_steps(a, b, lane, dv),')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(path.read_text().replace("'enudge', 'etrn'", "'enudge', 'emove', 'etrn'"))
    path = root / 'src/seq/step-edit.ts'
    source = path.read_text()
    source = replace_once(source, 'export function stepAutoTick(): void {', '''export function stepAutoTick(): void {
    stepArrowTick();''')
    source = replace_once(source, 'export function resetStepEdit(): void {','export function resetStepEdit(): void {\n    heldArrow = null;')
    addition: str = '''let heldArrow: {dir: number; shift: boolean; started: number; repeated: boolean; at: number} | null = null;

/** Delay short nudges until release so a long hold never adds a timing offset. */
export function editStepArrow(dir: number, down: boolean, shift: boolean): boolean {
    if (!down) {
        if (!heldArrow || heldArrow.dir !== dir) return false;
        const gesture = heldArrow; heldArrow = null;
        if (!gesture.repeated && anyStepHeld()) editNudge(dir, gesture.shift);
        return true;
    }
    if (!anyStepHeld()) return false;
    if (heldArrow) return true;
    markHeldGestured();
    heldArrow = {dir, shift, started:Date.now(), repeated:false, at:0};
    return true;
}

function stepArrowTick(): void {
    if (!heldArrow) return;
    if (!anyStepHeld()) { heldArrow = null; return; }
    const now = Date.now(), gesture = heldArrow;
    if (now - gesture.started < 350 || (gesture.repeated && now - gesture.at < 180)) return;
    gesture.repeated = true; gesture.at = now;
    const ranges = [...heldRanges.values()].sort((first,second) => gesture.dir > 0 ? second.s0-first.s0 : first.s0-second.s0);
    if (ranges.some(range => range.s0 + gesture.dir < 0 || range.s1 + gesture.dir >= seqState.lenSteps)) return;
    beginGesture('move-held-step:' + watchedTrack(), 'MOVE STEP', trackLabel(watchedTrack()));
    for (const range of ranges) {
        seqCmd(`emove ${watchedTrack()} ${range.s0} ${range.s1} ${lane()} ${gesture.dir}`);
        range.s0 += gesture.dir; range.s1 += gesture.dir;
    }
    seqState.holdStep = heldStepAbs();
    if (seqState.stepAutoMode) seqCmd(`hold ${watchedTrack()} ${seqState.holdStep}`);
    if (seqState.holdStep >= 0) seqState.barOffset = Math.floor(seqState.holdStep / NUM_STEP_BUTTONS);
    seqToast(gesture.dir > 0 ? 'Move step >' : 'Move step <');
}

'''
    source = replace_once(source, '/* Left/Right arrow → nudge (Shift = fine). */',addition+'/* Left/Right arrow → nudge (Shift = fine). */')
    path.write_text(source)
    path = root / 'src/seq/router.ts'
    source = "import { editStepArrow } from './step-edit.js';\n" + path.read_text()
    source = replace_once(source, '    if ((d1 === CC_LEFT || d1 === CC_RIGHT) && d2 > 0) {', '    if ((d1 === CC_LEFT || d1 === CC_RIGHT) && d2 === 0 && editStepArrow(d1 === CC_RIGHT ? 1 : -1, false, shiftHeld)) return true;\n    if ((d1 === CC_LEFT || d1 === CC_RIGHT) && d2 > 0) {')
    source = replace_once(source, '        if (anyStepHeld()) return editNudge(dir, shiftHeld);','        if (anyStepHeld()) return editStepArrow(dir, true, shiftHeld);')
    path.write_text(source)

    path = root / 'browser-test/logic/seq-edit.mjs'
    source = path.read_text()
    source = source.replace("seqHandleMidi([0xB0, 63, 127], false);       // right arrow", "seqHandleMidi([0xB0, 63, 127], false);       // right arrow\n    seqHandleMidi([0xB0, 63, 0], false);")
    source = source.replace("seqHandleMidi([0xB0, 62, 127], true);        // left arrow + shift = fine", "seqHandleMidi([0xB0, 62, 127], true);        // left arrow + shift = fine\n    seqHandleMidi([0xB0, 62, 0], true);")
    path.write_text(source)

    source = path.read_text()
    marker: str = "    // Hold step + plus = transpose (melodic). Drum lane disables transpose."
    regression: str = """    reset(); seqEngineTick();
    seqState.lenSteps = 16;
    seqHandleMidi([0x90, 16 + 4, 127], false);
    const arrowClock = Date.now;
    let arrowNow = arrowClock();
    Date.now = () => arrowNow;
    try {
        const { stepAutoTick, heldStepAbs } = await import('../../dist/esm/seq/step-edit.js');
        seqHandleMidi([0xB0,63,127],false);
        arrowNow += 349;stepAutoTick();seqEngineTick();
        eq('hold threshold does not nudge or move early',engine.ops.some(op=>op.startsWith('emove')||op.startsWith('enudge')),false);
        arrowNow += 1;stepAutoTick();seqEngineTick();
        eq('long right moves one step',engine.ops.filter(op=>op.startsWith('emove')).at(-1),'emove 0 4 4 -1 1');
        eq('held selection follows the note',heldStepAbs(),5);
        arrowNow += 180;stepAutoTick();seqEngineTick();
        eq('held right repeats from moved position',engine.ops.filter(op=>op.startsWith('emove')).at(-1),'emove 0 5 5 -1 1');
        seqHandleMidi([0xB0,63,0],false);seqEngineTick();
        eq('long release never adds a timing nudge',engine.ops.some(op=>op.startsWith('enudge')),false);
    } finally { Date.now = arrowClock; }
    seqHandleMidi([0x80,20,0],false);

"""
    source = replace_once(source, marker, regression+marker)
    path.write_text(source)
