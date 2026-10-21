"""Link the existing track-volume gesture to HarmonyBus routed velocity."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_render_velocity(root: Path) -> None:
    """Keep audio and routed MIDI edits in one persisted, undoable gesture."""
    path: Path = root / 'src/mixer/track-volume.ts'
    source: str = path.read_text()
    source = replace_once(source, 'let volumeBefore: string | null = null;',
                          'let renderVelocityBefore: string | null = null;\nlet volumeBefore: string | null = null;')
    source = replace_once(source, '    volumeBefore = writeValue(heldTrack, value);', '''    volumeBefore = writeValue(heldTrack, value);
    // HB exposes this private capability only on builds that support it.
    // Capture once, alongside the audio value, so Undo restores both together.
    renderVelocityBefore = portFor(heldTrack).getParam('midi_fx1:render_velocity_gain');''')
    source = replace_once(source, '    if (movy) markUiStateDirty();', '''    if (renderVelocityBefore !== null && Number.isFinite(Number(renderVelocityBefore)) && renderVelocityBefore.trim() !== '') {
        setChainParam(portFor(heldTrack), 'midi_fx1:render_velocity_gain',
                      value.toFixed(4), renderVelocityBefore);
    }
    if (movy) markUiStateDirty();''')
    source = source.replace('    volumeBefore = null;', '    volumeBefore = null;\n    renderVelocityBefore = null;')
    path.write_text(source)
    path = root / 'browser-test/logic/track-volume.mjs'
    source = path.read_text()
    source = replace_once(source, "    const CW  = 1;", '''    // A linked gesture adjusts HB only on the held track; idle volume and
    // older/non-HB chains keep their existing behavior.
    resetTrackVolume();
    env.setParams({'slot:volume':'1.0000','midi_fx1:render_velocity_gain':'1.0000'});
    volumeKnobDelta(127);
    eq('idle volume leaves HB untouched',env.params['midi_fx1:render_velocity_gain'],'1.0000');
    volumeTrackDown(1);
    volumeKnobDelta(127);
    eq('track volume also scales HB render attacks',env.params['midi_fx1:render_velocity_gain'],'0.8913');
    eq('local audio uses the same fader value',env.params['slot:volume'],'0.8913');
    volumeTrackUp(1);
    const {undoOnce,redoOnce}=await import('../../dist/esm/undo/apply.js');
    undoOnce();
    eq('Undo restores audio',env.params['slot:volume'],'1.0000');
    eq('Undo restores routed velocity',env.params['midi_fx1:render_velocity_gain'],'1.0000');
    redoOnce();
    eq('Redo restores audio',env.params['slot:volume'],'0.8913');
    eq('Redo restores routed velocity',env.params['midi_fx1:render_velocity_gain'],'0.8913');
    volumeTrackDown(1);
    volumeKnobDelta(1);
    eq('raising fader restores unchanged velocity',env.params['midi_fx1:render_velocity_gain'],'1.0000');
    volumeTrackUp(1);
    resetTrackVolume();

    const CW  = 1;''')
    path.write_text(source)
