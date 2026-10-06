/** Guided A/B observation; uses the existing engine status poll only. */
import { appState, VIEW_CPU } from '../app/state.js';
import { seqState } from './state.js';
import { seqCmd, statusSeq, engineReady } from './engine.js';
import { currentSetUuid, sessionReady } from './set-session.js';
import { keyboardState } from '../keyboard/state.js';
import { launchpadAvailable, launchpadPreviewReady, launchpadPreviewFrozen, setLaunchpadPreviewFrozen } from '../surfaces/launchpad.js';

type Stage = 'idle' | 'intro' | 'starting' | 'settle' | 'arming' | 'run' | 'stop' | 'results' | 'error';
type Capture = { audio: number[]; requests: string[]; seconds: number };
export const previewTest = {
    stage: 'idle' as Stage, pass: 0, photo: 0, remaining: 20, error: '',
    captures: [] as Capture[],
};
const RUN_MS = 20000, SETTLE_MS = 1000, TIMEOUT_MS = 5000;
let enteredAt = 0, runningAt = 0, requestedAfter = 0, lastSeenStatus = 0, lastStatusAt = 0;
let context = '', duration = 0;
let startedTransport = false, transportSet = '';

function contextKey(): string {
    // Recorded key/scale modulation is part of the workload, not a setup change.
    return [currentSetUuid(), appState.activeTrack.index, keyboardState.mode, keyboardState.layout].join(':');
}
function enter(stage: Stage, now: number): void {
    previewTest.stage = stage; enteredAt = now; appState.dirty = true;
}
function command(operation: string, stage: Stage, now: number): void {
    requestedAfter = statusSeq(); seqCmd(operation); enter(stage, now);
}
function fail(message: string, now: number): void {
    restore(); seqCmd('aprof_off');
    previewTest.error = message; enter('error', now);
}
export function previewTestVisible(): boolean { return previewTest.stage !== 'idle'; }
function restore(): void {
    setLaunchpadPreviewFrozen(false);
    if (startedTransport && currentSetUuid() === transportSet) seqCmd('stop');
    startedTransport = false;
}
export function cancelPreviewTest(): void {
    restore();
    if (previewTestVisible()) seqCmd('aprof_off');
    previewTest.stage = 'idle'; previewTest.captures = []; previewTest.photo = 0;
}
/** One physical jog click advances instructions/results; running ignores clicks. */
export function clickPreviewTest(now = Date.now()): void {
    if (previewTest.stage === 'idle' || previewTest.stage === 'error') {
        previewTest.error = ''; enter('intro', now); return;
    }
    if (previewTest.stage === 'results') {
        previewTest.photo = (previewTest.photo + 1) % 3; appState.dirty = true; return;
    }
    if (previewTest.stage !== 'intro') return;
    if (!engineReady() || !sessionReady()) { fail('WAIT FOR SET TO LOAD', now); return; }
    if (seqState.recording || seqState.countingIn) { fail('STOP RECORDING FIRST', now); return; }
    if (!launchpadPreviewReady()) { fail('ENABLE LAUNCHPAD FIRST', now); return; }
    previewTest.pass = 0; previewTest.captures = []; previewTest.photo = 0;
    context = contextKey(); lastSeenStatus = statusSeq(); lastStatusAt = now;
    setLaunchpadPreviewFrozen(false); seqCmd('aprof_off');
    startedTransport = !seqState.playing; transportSet = currentSetUuid();
    if (startedTransport) command('play', 'starting', now);
    else enter('settle', now);
}
/** Called before surface work, so cancel/exit restores it on the same tick. */
export function tickPreviewTest(now = Date.now()): void {
    if (!previewTestVisible()) return;
    if (appState.currentView !== VIEW_CPU) { cancelPreviewTest(); return; }
    if (['intro', 'results', 'error'].includes(previewTest.stage)) return;
    if (!sessionReady() || !engineReady() || seqState.recording || seqState.countingIn ||
        (previewTest.stage !== 'starting' && !seqState.playing) || contextKey() !== context ||
        !launchpadAvailable() || launchpadPreviewFrozen() !== (previewTest.pass === 1)) {
        fail('PLAY OR SETUP CHANGED', now); return;
    }
    const sequence = statusSeq();
    if (sequence !== lastSeenStatus) { lastSeenStatus = sequence; lastStatusAt = now; }
    if (now - lastStatusAt > TIMEOUT_MS) { fail('ENGINE STATUS TIMED OUT', now); return; }
    const audio = seqState.cpuProfile.split(',').map(Number);
    const requests = seqState.cpuRequests.split(',');
    const fresh = sequence > requestedAfter;
    if (previewTest.stage === 'starting') {
        if (fresh && seqState.playing) enter('settle', now);
        else if (now - enteredAt > TIMEOUT_MS) fail('PLAY START TIMED OUT', now);
    } else if (previewTest.stage === 'settle') {
        if (now - enteredAt >= SETTLE_MS && audio[0] === 0 && requests[0] === '0') command('aprof_on', 'arming', now);
        else if (now - enteredAt > TIMEOUT_MS) fail('METER RESET TIMED OUT', now);
    } else if (previewTest.stage === 'arming') {
        if (fresh && audio.length >= 22 && requests.length >= 9 && audio[0] === 1 && requests[0] === '1') {
            runningAt = now; previewTest.remaining = 20; enter('run', now);
        } else if (now - enteredAt > TIMEOUT_MS) fail('METER START TIMED OUT', now);
    } else if (previewTest.stage === 'run') {
        const remaining = Math.max(0, Math.ceil((RUN_MS - (now - runningAt)) / 1000));
        if (remaining !== previewTest.remaining) { previewTest.remaining = remaining; appState.dirty = true; }
        if (now - runningAt >= RUN_MS) {
            duration = (now - runningAt) / 1000; command('aprof_off', 'stop', now);
        }
    } else if (previewTest.stage === 'stop') {
        // Wait for a fresh OFF status, retaining the final block, not a stale UI peak.
        if (fresh && audio.length >= 22 && requests.length >= 9 && audio[0] === 0 && audio[1] > 0 && requests[0] === '0' &&
            (previewTest.pass === 1 || launchpadPreviewReady())) {
            previewTest.captures.push({ audio, requests, seconds: duration });
            if (previewTest.pass === 0) {
                previewTest.pass = 1; setLaunchpadPreviewFrozen(true); enter('settle', now);
            } else {
                restore(); enter('results', now);
            }
        } else if (now - enteredAt > TIMEOUT_MS) fail('METER STOP TIMED OUT', now);
    }
}

function compactKey(key: string): string {
    return key.replace(/^ch(\d+):midi_fx(\d+):/, (_, track, slot) => 'T' + (Number(track) + 1) + '/FX' + slot + ':')
        .toUpperCase().replace(/_/g, '-');
}
/** Fixed lines keep the measured passes' UI workload the same (one countdown). */
export function previewTestLines(): string[] {
    if (previewTest.stage === 'intro') return [
        'LAUNCHPAD A/B TEST', 'A: NORMAL LIGHTS 20S', 'B: FROZEN LIGHTS 20S',
        'USES YOUR LOADED SET.', 'PLAYBACK STARTS AUTOMATICALLY.',
        'LISTEN. PAD PLAY IS OPTIONAL.', 'RESTORES LIGHTS + PLAY/STOP.', 'CLICK:START  BACK:CANCEL'];
    if (previewTest.stage === 'error') return ['TEST NOT COMPLETED', previewTest.error,
        'NORMAL LIGHTS RESTORED', 'NO COMPLETE A/B COMPARISON', '', '', '', 'CLICK:RETRY  BACK:EXIT'];
    if (previewTest.stage === 'results') {
        if (previewTest.photo === 0) return []; // Numeric comparison uses columns.
        const capture = previewTest.captures[previewTest.photo - 1];
        const { audio: values, requests } = capture;
        return [
            'PHOTO ' + (previewTest.photo + 1) + '/3 ' + (previewTest.photo === 1 ? 'A NORMAL' : 'B FROZEN'),
            'R ' + compactKey(requests[4]), 'W ' + compactKey(requests[6]),
            'IN ' + values[6] + ' SEQ ' + values[7] + ' META ' + values[8],
            'MID ' + values[9] + ' HB ' + values[10] + ' LD ' + values[11],
            'CHAIN ' + values[12] + ' T' + values[20] + ' ' + values[21],
            'N ' + values[1] + ' BUD ' + values[5] + ' C ' + requests[2],
            'CLICK:NEXT  BACK:EXIT'];
    }
    const pass = previewTest.pass === 0 ? 'A NORMAL LIGHTS' : 'B FROZEN LIGHTS';
    return [pass, previewTest.stage === 'run' ? 'LISTEN FOR ' + previewTest.remaining + ' SECONDS' : 'PREPARING / SAVING...',
        'LISTEN: WHICH PASS CRACKLES?', 'OPTIONAL: PLAY PADS THE SAME.', 'NO SETTINGS CHANGES.',
        previewTest.pass === 0 ? 'NEXT: B FROZEN AUTOMATICALLY' : 'NEXT: PHOTO RESULTS',
        'NOTES AND RELEASES STAY LIVE.', 'BACK:CANCEL + RESTORE LIGHTS'];
}
