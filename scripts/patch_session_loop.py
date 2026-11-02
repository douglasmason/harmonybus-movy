"""Expose the existing bar-loop editor through Session; leave Loop as a mode action."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_session_loop(root: Path) -> None:
    """Route Loop Edit as input mode 9, without changing clip/engine formats."""
    path: Path = root / 'src/seq/router-buttons.ts'
    source: str = path.read_text()
    source = replace_once(source,
        'return seqState.sessionMode ? 0 : scaleFindingEnabled() ? 8 :',
        'return seqState.sessionMode ? 0 : seqState.loopMode ? 9 : scaleFindingEnabled() ? 8 :')
    source = replace_once(source,
        '    if(remember)rememberInputView();\n    setScaleFindingEnabled(false);',
        '    if(remember)rememberInputView();\n    loopEditResizeHold(false);seqState.loopMode=false; // Session owns loop editing.\n    setScaleFindingEnabled(false);')
    source = replace_once(source,
        '    setJointEnabled(next === 3);',
        '    setJointEnabled(next === 3);\n    seqState.loopMode=next===9;')
    start: int = source.index('function selectInputMode(')
    end: int = source.index('    seqToast([', start)
    source = source[:end] + "    if(next===9){seqToast('Loop Edit');return;}\n" + source[end:]
    source = replace_once(source,
        "'HB Settings','Scale Finding'];",
        "'HB Settings','Scale Finding','Loop Edit'];")
    source = "import {loopEditResizeHold} from './loop-mode.js';\n" + source
    path.write_text(source)
    path = root / 'src/seq/loop-mode.ts'
    source = path.read_text()
    source = replace_once(source,
        'export function loopHeld(): boolean {',
        '''/** A selected Loop Edit input mode owns its Loop+wheel resize gesture;
 * no transient mode toggling, no shared momentary slot. */
export function loopEditResizeHold(down:boolean):void { held=down; }
export function loopHeld(): boolean {''')
    path.write_text(source)

    # The old logic suite assumes that a physical Loop tap globally enters
    # bar-edit mode. Keep its musical window/gesture checks, but enter that
    # editor through Session's mode state and test non-latching presses.
    path = root / 'browser-test/logic/seq-edit.mjs'
    source = path.read_text()
    source = replace_once(source,
        '''    // Loop button tap (down then up with no gesture) latches Loop Mode on.
    seqHandleMidi([0xB0, 58, 127], false);
    seqHandleMidi([0xB0, 58, 0], false);
    eq('Loop tap enters Loop Mode', seqState.loopMode, true);''',
        '''    // Loop Edit is now selected in the Session chooser.
    seqState.loopMode = true;
    eq('Session-selected Loop Edit exposes bars', seqState.loopMode, true);''')
    start: int = source.index('    // Clean tap from Note → latches Loop on.')
    end: int = source.index('    uninstallMockEngine(); resetSeqEngine();', start)
    source = source[:start] + '''    // Physical Loop is a held resize modifier in Loop Edit. It never
    // toggles the Session-selected input mode.
    seqState.loopMode = true;
    seqHandleMidi([0xB0,58,127],false);
    seqHandleMidi([0xB0,58,0],false);
    eq('Loop tap keeps selected Loop Edit',seqState.loopMode,true);
    seqState.loopMode = false;
    seqHandleMidi([0xB0,58,127],false);
    seqHandleMidi([0xB0,58,0],false);
    eq('Loop tap outside editor cannot enter it',seqState.loopMode,false);

''' + source[end:]
    path.write_text(source)
    path = root / 'browser-test/logic/session-shift.mjs'
    source = replace_once(path.read_text(),
        "eq('a Loop tap in Track view still latches Loop Mode', seqState.loopMode, true);",
        "eq('a Loop tap in Track view leaves bar editing to Session', seqState.loopMode, false);")
    path.write_text(source)
