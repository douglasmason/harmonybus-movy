//! Sparse-safe event grains for the existing Clip Fill preview/commit boundary.
//! Every head reads source NOTE/CHORD GROUPS, not arbitrary time slices.
//! This is an offline, deterministic clip transform; it owns no playback clock,
//! MIDI voice, synthesized audio, or runtime allocation in the audio callback.
use std::collections::BTreeSet;
use crate::{clip::{Clip, MAX_NOTES, MAX_STEPS}, TICKS_PER_STEP};

/// Musical attack density is independent of the source's original note spacing.
pub const SPACING_STEPS: [u32; 5] = [1, 2, 4, 8, 16];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventHeads {
    pub bars: usize,
    pub spacing_index: usize,
    /// 0 single forward, 1 forward + reverse, 2 forward + ping-pong,
    /// 3 two independent forward readers.
    pub second_mode: usize,
    pub first_offset: usize,
    pub second_offset: usize,
}

pub(crate) fn event_index(attack: usize, offset: usize, count: usize, mode: usize) -> usize {
    debug_assert!(count > 0);
    let position = (attack + offset) % count;
    match mode {
        1 => count - 1 - position,
        2 if count > 1 => {
            let period = 2 * (count - 1);
            let excursion = (attack + offset) % period;
            if excursion < count { excursion } else { period - excursion }
        }
        _ => position,
    }
}

/// Advance through sparse non-rendered note groups using existing
/// sequential Source Weaving cursor semantics: rejected donor attacks never
/// call this function, and it never mutates the source or advances a clock.
pub(crate) fn live_next_onset(source: &Clip, previous: Option<u32>) -> Option<u32> {
    let start = source.loop_start_ticks();
    let end = source.loop_end_ticks();
    let events = || source.notes.iter().take(MAX_NOTES).filter(|note| {
        note.vel > 0 && !note.suppress && !note.rendered &&
            note.tick >= start && note.tick < end
    }).map(|note| note.tick);
    events().filter(|tick| previous.map_or(true, |last| *tick > last)).min()
        .or_else(|| events().min())
}

/// Two independent event-group readers for live Source Weaving.
/// This mirrors the offline EventHeads ordering without copying a clip or
/// allocating a collection in the audio callback. The selected `cursor_onset`
/// is the *un-offset* next event group; offsets only move the two readers.
/// Up to MAX_NOTES tick positions are stack-sorted once per accepted attack,
/// never per audio sample or browser poll. Chord groups remain indivisible.
/// The caller owns note-off pairing, rhythm gates, and live source availability.
pub(crate) fn live_head_onsets(
    source: &Clip,
    cursor_onset: u32,
    second_mode: usize,
    first_offset: usize,
    second_offset: usize,
) -> Option<(u32, Option<u32>)> {
    live_head_onsets_driven(source,cursor_onset,second_mode,first_offset,
        second_offset,None,[None,None])
}

/// At each *accepted rhythm attack*, sample the existing 14-bit LFO/Field
/// observations and read the closest ordinal in the sparse source. A missing
/// driver restores the ordinary advancing event cursor independently per head.
/// Position 0 selects the first event; 16383 selects the last. Directions and
/// saved offsets are applied after choosing the position. Only accepted donor
/// attacks advance the unmodulated bounce phase; observing Field never does.
pub(crate) fn live_head_onsets_driven(
    source: &Clip,
    cursor_onset: u32,
    second_mode: usize,
    first_offset: usize,
    second_offset: usize,
    accepted_attack: Option<usize>,
    head_positions: [Option<u16>;2],
) -> Option<(u32, Option<u32>)> {
    if second_mode > 3 || first_offset >= 16 || second_offset >= 16 {
        return None;
    }
    let start = source.loop_start_ticks();
    let end = source.loop_end_ticks();
    let mut onsets = [0_u32; MAX_NOTES];
    let mut total = 0_usize;
    for note in source.notes.iter().take(MAX_NOTES) {
        if note.vel > 0 && !note.suppress && !note.rendered &&
            note.tick >= start && note.tick < end {
            onsets[total] = note.tick;
            total += 1;
        }
    }
    if total == 0 { return None; }
    onsets[..total].sort_unstable();
    let mut distinct = 0_usize;
    for index in 0..total {
        if distinct == 0 || onsets[index] != onsets[distinct - 1] {
            onsets[distinct] = onsets[index];
            distinct += 1;
        }
    }
    let ordinal = onsets[..distinct].binary_search(&cursor_onset).ok()?;
    // Group indices, not raw ticks: long source rests never create blank
    // intervals during a touch sweep. Avoid overflow and preserve endpoints.
    let position_index = |position:u16| -> usize {
        (u32::from(position) * (distinct as u32 - 1)
            + u32::from(crate::position_inputs::POSITION_MAX / 2))
            as usize / usize::from(crate::position_inputs::POSITION_MAX)
    };
    let first_phase=head_positions[0].map_or(ordinal,position_index);
    let second_phase=head_positions[1].map_or(accepted_attack.unwrap_or(ordinal),position_index);
    let first = onsets[event_index(first_phase, first_offset, distinct, 0)];
    let second = (second_mode != 0).then(|| {
        onsets[event_index(second_phase, second_offset, distinct, second_mode)]
    });
    Some((first, second))
}

/// Prepare at edit/preview time and reuse the existing Clip Fill, Undo, and
/// stock-Move note emitter. Never call on the audio thread.
///
/// Notes with the same onset form one indivisible chord grain. A sparse source
/// (including a single note) is re-articulated on the selected rhythmic grid;
/// its rests are intentionally NOT preserved in this mode. Choose Original
/// Fill to retain the authored silence. Head collisions on the same output
/// pitch/tick are collapsed so the ordinary per-pitch gate owner remains sound.
pub fn event_grains(source: &Clip, config: EventHeads) -> Result<Clip, &'static str> {
    if config.bars == 0 || config.bars * 16 > MAX_STEPS as usize
        || config.spacing_index >= SPACING_STEPS.len() || config.second_mode > 3
        || config.first_offset >= 16 || config.second_offset >= 16 {
        return Err("Invalid event grain settings");
    }
    if source.length_ticks() == 0 {
        return Err("Empty source clip");
    }
    // These are not equivalent after rearranging onsets. Never silently erase
    // a recorded generator, timed operation, automation, or transport condition.
    if source.generator.is_some() || !source.trigs.is_empty()
        || !source.operation_intervals.is_empty() || !source.grid_gates.is_empty()
        || !source.shared_events.is_empty() || !source.locks.is_empty()
        || source.quant != 0 || source.scale_num != source.scale_den {
        return Err("Grains need plain source notes without timed controls");
    }
    let start = source.loop_start_ticks();
    let end = source.loop_end_ticks();
    let eligible = |note: &&crate::clip::Note| {
        note.vel > 0 && !note.rendered
            && note.tick >= start && note.tick < end
    };
    // Sorted unique note onsets: polyphonic chords stay intact, and unrelated
    // long silences do not shrink the usable source into empty fragments.
    let onsets: Vec<u32> = source.notes.iter().take(MAX_NOTES)
        .filter(eligible).map(|note| note.tick).collect::<BTreeSet<_>>()
        .into_iter().collect();
    if onsets.is_empty() {
        return Err("Event grain source has no editable notes");
    }
    let mut clip = Clip::new();
    clip.length_steps = (config.bars * 16) as u16;
    clip.loop_start_steps = 0;
    clip.input_key = source.input_key;
    clip.transpose = source.transpose;
    clip.recipe = source.recipe.clone();
    let spacing_ticks = SPACING_STEPS[config.spacing_index] * TICKS_PER_STEP;
    let duration_ticks = config.bars as u32 * 16 * TICKS_PER_STEP;
    let heads = if config.second_mode == 0 { 1 } else { 2 };
    let mut seen: BTreeSet<(u32, u8)> = BTreeSet::new();

    for (attack, tick) in (0..duration_ticks).step_by(spacing_ticks as usize).enumerate() {
        for head in 0..heads {
            let onset_index = if head == 0 {
                event_index(attack, config.first_offset, onsets.len(), 0)
            } else {
                event_index(attack, config.second_offset, onsets.len(), config.second_mode)
            };
            let selected_onset = onsets[onset_index];
            for source_note in source.notes.iter().take(MAX_NOTES)
                .filter(|note| note.tick == selected_onset && eligible(note)) {
                if !seen.insert((tick, source_note.pitch)) { continue; }
                if clip.notes.len() >= MAX_NOTES {
                    return Err("Event grains exceed clip note capacity; reduce density");
                }
                let mut note = source_note.clone();
                note.tick = tick;
                note.step = (tick / TICKS_PER_STEP) as u16;
                // Leave a release before the next repeated attack. The normal
                // scheduler still owns every note-off and source-key mapping.
                note.gate = note.gate.max(1)
                    .min(spacing_ticks.saturating_sub(1).max(1))
                    .min(duration_ticks - tick);
                note.pressure.retain(|(offset, _)| *offset < note.gate);
                note.fired = false;
                note.suppress = false;
                note.input_key = note.input_key.or(source.input_key);
                clip.notes.push(note);
            }
        }
    }
    Ok(clip)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::follower_input::InputKey;

    fn sparse() -> Clip {
        let mut source = Clip::new();
        source.input_key = InputKey::new(2, 1);
        source.set_loop(0, 16);
        source.add_note_raw(0, 0, 170, 60, 100);
        source.add_note_raw(8, 192, 170, 64, 90);
        source.add_note_raw(12, 288, 170, 67, 80);
        source
    }
    fn config(second_mode: usize) -> EventHeads {
        EventHeads { bars: 1, spacing_index: 2, second_mode,
            first_offset: 0, second_offset: 0 }
    }
    fn pitches_at(clip: &Clip, tick: u32) -> Vec<u8> {
        clip.notes.iter().filter(|note| note.tick == tick)
            .map(|note| note.pitch).collect()
    }
    #[test]
    fn sparse_notes_rearticulate_without_requiring_dense_source_audio() {
        let source = sparse();
        let original = source.notes.clone();
        let grain = event_grains(&source, EventHeads { spacing_index: 0,
            ..config(0) }).unwrap();
        assert_eq!(grain.notes.len(), 16);
        assert_eq!(grain.notes.iter().take(7)
            .map(|note| note.pitch).collect::<Vec<_>>(),
            vec![60, 64, 67, 60, 64, 67, 60]);
        assert!(grain.notes.iter().all(|note| note.gate <= 23));
        assert_eq!(source.notes, original, "read-only source");
        assert_eq!(grain.input_key, source.input_key);
    }
    #[test]
    fn reverse_head_collisions_merge_without_double_retrigger() {
        let grain = event_grains(&sparse(), config(1)).unwrap();
        assert_eq!(pitches_at(&grain, 0), vec![60, 67]);
        assert_eq!(pitches_at(&grain, 96), vec![64]);
        assert_eq!(pitches_at(&grain, 192), vec![67, 60]);
        assert_eq!(grain.notes.len(), 7);
    }
    #[test]
    fn ping_pong_and_offsets_keep_independent_head_phases() {
        let grain = event_grains(&sparse(), EventHeads {
            first_offset: 1, second_offset: 0, ..config(2)
        }).unwrap();
        assert_eq!(pitches_at(&grain, 0), vec![64, 60]);
        assert_eq!(pitches_at(&grain, 96), vec![67, 64]);
        assert_eq!(pitches_at(&grain, 192), vec![60, 67]);
        assert_eq!(pitches_at(&grain, 288), vec![64]);
    }
    #[test]
    fn one_note_source_is_valid_and_pressure_is_bounded_by_gate() {
        let mut source = sparse();
        source.notes.truncate(1);
        source.notes[0].pressure = vec![(10, 90), (150, 20)];
        let grain = event_grains(&source, EventHeads { spacing_index: 1,
            ..config(1) }).unwrap();
        assert_eq!(grain.notes.len(), 8, "heads deduplicate identical notes");
        assert!(grain.notes.iter().all(|note| note.pressure == vec![(10, 90)]));
        assert!(grain.notes.iter().all(|note| note.gate <= 47));
    }
    #[test]
    fn chord_grains_preserve_simultaneity_and_reject_overflow_atomically() {
        let mut source = sparse();
        source.notes.truncate(1);
        for pitch in [64, 67, 71] { source.add_note_raw(0, 0, 170, pitch, 100); }
        let short = event_grains(&source, config(1)).unwrap();
        assert_eq!(short.notes.len(), 16);
        assert_eq!(pitches_at(&short, 0), vec![60, 64, 67, 71]);
        assert!(event_grains(&source, EventHeads { bars: 16,
            spacing_index: 0, ..config(1) }).is_err());
    }
    #[test]
    fn live_cursor_tracks_unique_groups_and_ignores_rendered_source_notes() {
        let mut source = sparse();
        assert_eq!(live_next_onset(&source, None), Some(0));
        assert_eq!(live_next_onset(&source, Some(0)), Some(192));
        assert_eq!(live_next_onset(&source, Some(192)), Some(288));
        assert_eq!(live_next_onset(&source, Some(288)), Some(0));
        source.notes[1].rendered = true;
        assert_eq!(live_next_onset(&source, Some(0)), Some(288));
        source.notes.iter_mut().for_each(|note|note.rendered=true);
        assert_eq!(live_next_onset(&source, None), None);
    }
    #[test]
    fn field_drivers_select_sparse_event_groups_and_preserve_independent_fallback() {
        let source=sparse();
        let pick=|left:Option<u16>,right:Option<u16>,attack:usize|{
            live_head_onsets_driven(&source,0,1,0,0,Some(attack),[left,right])
        };
        assert_eq!(pick(Some(0),Some(0),0),Some((0,Some(288))));
        assert_eq!(pick(Some(8192),Some(8192),0),Some((192,Some(192))));
        assert_eq!(pick(Some(16383),Some(16383),0),Some((288,Some(0))));
        // Missing one driver never disables the other head or invents a note.
        assert_eq!(pick(Some(16383),None,0),Some((288,Some(288))));
        assert_eq!(pick(None,Some(16383),1),Some((0,Some(0))));
        // Directions and manual offsets follow the same offline indexing.
        assert_eq!(live_head_onsets_driven(&source,0,1,1,1,Some(0),
            [Some(0),Some(0)]),Some((192,Some(192))));
    }
    #[test]
    fn undriven_pingpong_uses_accepted_attacks_instead_of_wrapping_early() {
        let source=sparse();
        let pitches=(0..7).map(|attack|{
            let onset=[0,192,288][attack%3];
            live_head_onsets_driven(&source,onset,2,0,0,Some(attack),
                [None,None]).unwrap().1.unwrap()
        }).collect::<Vec<_>>();
        assert_eq!(pitches,vec![0,192,288,192,0,192,288]);
        // A held Field head can be scrubbed in either direction at the
        // next clocked note-on without retriggering at an idle read.
        assert_eq!(live_head_onsets_driven(&source,288,2,0,0,Some(6),
            [None,Some(0)]).unwrap().1,Some(0));
    }
    #[test]
    fn one_note_position_drivers_never_create_extra_pitch_groups() {
        let mut source=sparse();source.notes.truncate(1);
        for value in [0,1,8192,16383] {
            assert_eq!(live_head_onsets_driven(&source,0,1,15,14,Some(4),
                [Some(value),Some(16383)]),Some((0,Some(0))));
        }
    }
    #[test]
    fn live_head_selection_matches_offline_pitch_groups_on_sparse_unsorted_sources() {
        let mut source = sparse();
        source.add_note_raw(0, 0, 24, 72, 100); // a chord, not an extra event
        source.notes.reverse(); // source order is not guaranteed
        let first = live_head_onsets(&source, 0, 1, 0, 0);
        assert_eq!(first, Some((0, Some(288))));
        assert_eq!(live_head_onsets(&source, 192, 1, 0, 0),
            Some((192, Some(192))));
        assert_eq!(live_head_onsets(&source, 288, 2, 0, 0),
            Some((288, Some(288))));
        assert_eq!(live_head_onsets(&source, 0, 0, 1, 0),
            Some((192, None)));
        assert_eq!(live_head_onsets(&source, 0, 3, 1, 2),
            Some((192, Some(288))));
        assert_eq!(live_head_onsets(&source, 0, 4, 0, 0), None);
    }
    #[test]
    fn live_head_selection_handles_one_note_and_trimmed_loop_without_allocation() {
        let mut source = sparse();
        source.notes.truncate(1);
        assert_eq!(live_head_onsets(&source, 0, 1, 0, 0), Some((0, Some(0))));
        source.set_loop(16, 16);
        assert_eq!(live_head_onsets(&source, 0, 1, 0, 0), None);
        let mut long = sparse();
        long.set_loop(8, 8);
        // The reverse head mirrors the *event ordinal*, not its timestamp.
        // On a three-onset source the middle event mirrors to itself.
        assert_eq!(live_head_onsets(&long, 192, 1, 0, 0),
            Some((192, Some(192))));
    }
    #[test]
    fn rejects_unrepresentable_timed_source_without_changing_it() {
        let mut source = sparse();
        source.scale_num = 2;
        let original = source.notes.clone();
        assert!(event_grains(&source, config(1)).is_err());
        assert_eq!(source.notes, original);
        assert!(event_grains(&sparse(), EventHeads { spacing_index: 7,
            ..config(1) }).is_err());
    }
}
