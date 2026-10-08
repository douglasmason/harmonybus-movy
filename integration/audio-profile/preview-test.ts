/** Guided preview isolation; uses the existing engine status poll only. */
import { appState, VIEW_CPU } from '../app/state.js';
import { seqState } from './state.js';
import { seqCmd, statusSeq, engineReady } from './engine.js';
import { currentSetUuid, sessionReady } from './set-session.js';
import { flagValue } from './flags.js';
import { portFor } from '../track/registry.js';
import { keyboardState } from '../keyboard/state.js';
import { safeWrite } from './persist-store.js';
import { setMovePreviewFrozen, isMovePreviewFrozen } from '../keyboard/harmony-pads.js';
import { launchpadAvailable, launchpadPreviewReady, launchpadPreviewFrozen, setLaunchpadPreviewFrozen, setLaunchpadIsolation, launchpadIsolationMetrics } from '../surfaces/launchpad.js';

type Stage = 'idle' | 'intro' | 'starting' | 'settle' | 'arming' | 'run' | 'stop' | 'results' | 'error';
type Capture = { audio: number[]; requests: string[]; seconds: number; idle?: ReturnType<typeof parseIdleProbe>; pressure?: ReturnType<typeof parsePressureTrace>; thread?: ReturnType<typeof parseThreadMetrics>; worker?: number[]; tone?: number[]; gapRequest?: string; surface?: ReturnType<typeof launchpadIsolationMetrics> };
export const previewTest = {
    stage: 'idle' as Stage, pass: 0, photo: 0, remaining: 20, error: '',
    captures: [] as Capture[],
    quick: true,
    isolation: false,
    workers: false,
    thread: false,
    reportPath: '',
};
export const WORKER_LABELS = ['PARALLEL 1', 'SERIAL', 'PARALLEL 2'];
export const WORKER_FIELDS = ['enabled','serial','aborted','blocks','forcedSerialBlocks','parallelRounds','mainMeanUsPerBlock','mainPeakUsPerRound','joinMeanUsPerBlock','joinPeakUsPerRound','worker0StartDelayPeakUs','worker0WorkPeakUs','worker1StartDelayPeakUs','worker1WorkPeakUs'];
let workerSetup = { launchpad: 0, host: 0, setHost: 0, harmonyBus: 'unknown' };
export const ISOLATION_LABELS = ['OFF', 'ROUTING', 'PREVIEWS', 'LED SEND'];
const threadNames = ['callbackBody','chainsTotal','idleMidiTicks','hbPrepare','toneRender','toneVerify','parameterRead','parameterWrite','midiInput'];
const threadFields = ['count','validCpuCount','wallMeanUs','cpuMeanUs','wallPeakUs','cpuAtWallPeakUs','wallPeakCpuValid','cpuPeakUs','wallAtCpuPeakUs','offCpuPeakUs'];
function parseThreadMetrics(): Record<string, Record<string, number | string>> {
    const parts = seqState.cpuThread.split(';').slice(1);
    const result: Record<string, Record<string, number | string>> = {};
    parts.forEach((part,index) => {
        const values = part.split(',');
        const metric: Record<string, number | string> = { wallPeakKey: values[10] || '-' };
        threadFields.forEach((field,fieldIndex) => { metric[field] = Number(values[fieldIndex]); });
        result[threadNames[index] || 'unknown'] = metric;
    });
    return result;
}
function parsePressureTrace() {
    const parts = seqState.cpuPressure.split(';');
    return { headerFields: ['active','lockMisses','overwrittenEvents','duplicateRawOn','unmatchedRawOff'],
        header: parts[0].split(',').map(Number),
        phaseFields: ['maxCallbackGapUs','rawOn','rawOff','routedOn','routedOff','pressureReceived','pressureForwarded','renderOnSubmitted','renderOffSubmitted'],
        phases: parts.slice(1,5).map(part => part.split(',').map(Number)),
        eventFields: ['elapsedMs','kind','channelOrTrack','padOrPitch','value'],
        eventKinds: ['rawOn','rawOff','routedOn','routedOff','pressureReceived','pressureForwarded','renderOnSubmitted','renderOffSubmitted'],
        events: parts.slice(5).map(part => part.split(',').map(Number)) };
}
function parseIdleProbe() {
    const parts = seqState.cpuIdle.split(';');
    return { headerFields: ['active','aborted'], header: parts[0].split(',').map(Number),
        phaseFields: ['blocks','intervals','overPeriod','over1p5Period','maxGapUs','meanWorkUs','maxWorkUs','maxIdleUs'],
        phases: parts.slice(1,4).map(part => part.split(',').map(Number)),
        gapFields: ['elapsedMs','phase','previousPhase','gapUs','previousWorkUs','idleUs','requestWorkUs'],
        gaps: parts.slice(4).map(part => part.split(',').map(Number)).sort((first,second) => first[0]-second[0]) };
}
export function pressurePhaseLabel(): string {
    const elapsed = 65 - previewTest.remaining;
    return elapsed < 20 ? 'A NORMAL' : elapsed < 40 ? 'B TONE ONLY' : elapsed < 60 ? 'C NORMAL' : 'RESTORING';
}
function captureMs(): number { return previewTest.thread ? 65000 : 35000; }
const RUN_MS = 20000, SETTLE_MS = 1000, TIMEOUT_MS = 5000;
export const PREVIEW_TEST_LABELS = ['A NORMAL', 'B X FROZEN', 'C BOTH FROZEN'];
export const PREVIEW_TEST_PHOTOS = PREVIEW_TEST_LABELS.length + 2;
let enteredAt = 0, runningAt = 0, requestedAfter = 0, lastSeenStatus = 0, lastStatusAt = 0;
let context = '', duration = 0, appliedPass = 0;
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
    if (previewTest.workers || previewTest.thread) saveWorkerReport(message);
    previewTest.error = message; enter('error', now);
}
/** Write once after collection; file I/O must not perturb a measured phase. */
function saveIsolationReport(): void {
    const path = '/data/UserData/schwung/x-test-' + Date.now() + '.json';
    const report = JSON.stringify({ format: 'movy-x-isolation-v1', capturedAt: new Date().toISOString(),
        conditions: ISOLATION_LABELS, captures: previewTest.captures,
        limitations: ['PCM checks internal generated tone, not host/DAC output',
            'Late callback counts are not audible crackle counts', 'LED phase uses a fixed four-Hz 64-pad RGB pattern'],
    }, null, 2);
    previewTest.reportPath = safeWrite(path, report) ? path : '';
}
/** One report, saved after measurement; partial/error runs are explicitly marked. */
function saveWorkerReport(error = ''): void {
    const path = '/data/UserData/schwung/' + (previewTest.thread ? 'idle-test-' : 'worker-test-') + Date.now() + '.json';
    const report = {
        format: previewTest.thread ? 'movy-idle-test-v1' : 'movy-worker-test-v1', capturedAt: new Date().toISOString(),
        engineBuild: seqState.workerBuild || 'unknown', setup: workerSetup,
        complete: !error && previewTest.captures.length === (previewTest.thread ? 1 : 3) && (!previewTest.thread || previewTest.captures[0].idle?.header[1] === 0), error,
        conditions: previewTest.thread ? ['NORMAL 0-20s','CALLBACK BYPASS 20-40s','NORMAL 40-60s','RESTORE 60-65s'] : WORKER_LABELS, workerFields: previewTest.thread ? undefined : WORKER_FIELDS,
        captures: previewTest.captures,
        limitations: [...(previewTest.thread ? ['Thread CPU excludes other threads, including render helpers; elapsed minus CPU does not identify the reason for waiting',
            'Callback/chain/MIDI-tick and callback/tone measurements are nested; do not add them',
            'Clock reads contribute measurement overhead; failed CPU clocks are identified by validCpuCount and wallPeakCpuValid',
            'offCpuPeakUs is the largest paired wall-minus-CPU value, not the difference of separate peaks'] : [
            'Worker clocks measure elapsed wall time, including preemption; not thread CPU time',
            'Peaks may occur in different callbacks; do not sum independent peaks',
            'Parallel rounds count chain and send rounds, not audio callbacks',
            'No parallel rounds means this workload did not exercise helper rendering',
            'Serial watchdog abort invalidates serial comparison; later blocks may be parallel']),
            'PCM checks internal generated tone, not host/DAC output; late callbacks are not crackle counts',
            'Uses current loaded set; phase order and changing background workload may affect results',
            'Idle comparison stops playback and leaves it stopped; no clip or configuration edits',
            'Bypass skips only Movy callback musical work: sequencer, metadata, chain preparation/rendering; UI requests and host processing remain active',
            'Per-phase work is elapsed callback time, not CPU time; whole-run thread metrics are separate',
            'Twelve largest gaps retained; previousPhase identifies intervals crossing phase boundaries',
            'Trace records host-delivered events, not physical sensor time; no host queue depth/age is available',
            'Render events are cable-2 submissions, not confirmation of hardware consumption; no per-voice causal IDs',
            'Only the latest 96 note events are retained; overwrittenEvents and lockMisses identify incomplete traces',
            'Raw duplicate/unmatched counts can include notes held before capture; pressure counts combine live and replay',
            'Thread CPU and PCM metrics cover the whole capture; idle callback metrics are per phase'],
    };
    previewTest.reportPath = safeWrite(path, JSON.stringify(report, null, 2)) ? path : '';
}
export function keepQuickCapture(): boolean { return previewTest.quick && !['idle','intro','error'].includes(previewTest.stage); }
export function previewTestVisible(): boolean { return previewTest.stage !== 'idle'; }
function restore(): void {
    setLaunchpadIsolation(null);
    setMovePreviewFrozen(false);
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
export function clickPreviewTest(now = Date.now(), compare = false, isolation = false, workers = false, thread = false): void {
    if (previewTest.stage === 'idle' || previewTest.stage === 'error') {
        previewTest.quick = !compare;
        previewTest.thread = !compare && thread;
        previewTest.workers = !compare && workers && !thread;
        previewTest.isolation = !compare && isolation && !workers && !thread;
        previewTest.error = ''; enter('intro', now); return;
    }
    if (previewTest.stage === 'results') {
        if (previewTest.quick) { previewTest.captures = []; enter('intro', now); return; }
        previewTest.photo = (previewTest.photo + 1) % PREVIEW_TEST_PHOTOS; appState.dirty = true; return;
    }
    if (previewTest.quick && keepQuickCapture()) { cancelPreviewTest(); return; }
    if (previewTest.stage !== 'intro') return;
    if (!engineReady() || !sessionReady()) { fail('WAIT FOR SET TO LOAD', now); return; }
    if (seqState.recording || seqState.countingIn) { fail('STOP RECORDING FIRST', now); return; }
    if (!previewTest.quick && !launchpadPreviewReady()) { fail('ENABLE LAUNCHPAD FIRST', now); return; }
    previewTest.pass = 0; appliedPass = 0; previewTest.captures = []; previewTest.photo = 0; previewTest.reportPath = '';
    if (previewTest.workers || previewTest.thread) {
        workerSetup = { launchpad: flagValue('hblaunchpad'), host: flagValue('chtracks'),
            setHost: flagValue('chtrackset'), harmonyBus: portFor(appState.activeTrack.index).getParam('midi_fx1:version') || 'unknown' };
    }
    context = previewTest.quick && !previewTest.isolation && !previewTest.workers && !previewTest.thread ? currentSetUuid() : contextKey(); lastSeenStatus = statusSeq(); lastStatusAt = now;
    setMovePreviewFrozen(false); setLaunchpadPreviewFrozen(false); seqCmd('aprof_off');
    if (previewTest.isolation) setLaunchpadIsolation('off');
    startedTransport = !previewTest.thread && !seqState.playing; transportSet = currentSetUuid();
    if (previewTest.thread && seqState.playing) command('stop', 'starting', now);
    else if (startedTransport) command('play', 'starting', now);
    else enter('settle', now);
}
/** Called before surface work, so cancel/exit restores it on the same tick. */
export function tickPreviewTest(now = Date.now()): void {
    if (!previewTestVisible()) return;
    if (appState.currentView !== VIEW_CPU && !keepQuickCapture()) { cancelPreviewTest(); return; }
    if (['intro', 'results', 'error'].includes(previewTest.stage)) return;
    if (!sessionReady() || !engineReady() || seqState.recording || seqState.countingIn ||
        (previewTest.stage !== 'starting' && (previewTest.thread ? seqState.playing : !seqState.playing)) || (previewTest.quick && !previewTest.isolation && !previewTest.workers && !previewTest.thread ? currentSetUuid() : contextKey()) !== context ||
        (!previewTest.quick && !launchpadAvailable()) || launchpadPreviewFrozen() !== (appliedPass > 0) ||
        isMovePreviewFrozen() !== (appliedPass === 2)) {
        fail('PLAY OR SETUP CHANGED', now); return;
    }
    if ((previewTest.workers || previewTest.thread) && (flagValue('hblaunchpad') !== workerSetup.launchpad ||
        flagValue('chtracks') !== workerSetup.host || flagValue('chtrackset') !== workerSetup.setHost)) {
        fail('SETTINGS CHANGED', now); return;
    }
    const sequence = statusSeq();
    if (sequence !== lastSeenStatus) { lastSeenStatus = sequence; lastStatusAt = now; }
    if (now - lastStatusAt > TIMEOUT_MS) { fail('ENGINE STATUS TIMED OUT', now); return; }
    const audio = seqState.cpuProfile.split(',').map(Number);
    const requests = seqState.cpuRequests.split(',');
    const fresh = sequence > requestedAfter;
    if (previewTest.thread && previewTest.stage === 'run' && seqState.cpuIdle.split(';')[0] === '0,1') {
        previewTest.captures.push({ audio, requests, seconds: (audio[35] || 0)/1000, idle: parseIdleProbe(), thread: parseThreadMetrics(), tone: seqState.cpuTone.split(',').map(Number) });
        fail('INPUT INTERRUPTED TEST', now); return;
    }
    if (previewTest.stage === 'starting') {
        if (fresh && (previewTest.thread ? !seqState.playing : seqState.playing)) enter('settle', now);
        else if (now - enteredAt > TIMEOUT_MS) fail('PLAY START TIMED OUT', now);
    } else if (previewTest.stage === 'settle') {
        if (now - enteredAt >= SETTLE_MS && audio[0] === 0 && requests[0] === '0') command(previewTest.thread ? 'icapture' : previewTest.workers ? (previewTest.pass === 1 ? 'wserial' : 'wparallel') : previewTest.quick ? 'acapture' : 'aprof_on', 'arming', now);
        else if (now - enteredAt > TIMEOUT_MS) fail('METER RESET TIMED OUT', now);
    } else if (previewTest.stage === 'arming') {
        if (fresh && audio.length >= (previewTest.quick ? 36 : 29) && requests.length >= 9 && audio[0] === 1 && requests[0] === '1' && (!previewTest.thread || (seqState.cpuThread.startsWith('1;') && seqState.cpuThread.split(';').length === 10)) && (!previewTest.workers || (seqState.workerBuild !== '' && seqState.cpuWorker.split(',')[0] === '1'))) {
            // Arm first, then change the workload. Never discard the transition.
            appliedPass = previewTest.isolation || previewTest.workers || previewTest.thread ? 0 : previewTest.pass;
            setLaunchpadPreviewFrozen(appliedPass > 0);
            setMovePreviewFrozen(appliedPass === 2);
            if (previewTest.isolation) setLaunchpadIsolation((['off', 'route', 'preview', 'led'] as const)[previewTest.pass]);
            runningAt = now; previewTest.remaining = previewTest.quick ? captureMs()/1000 : 20; enter('run', now);
        } else if (now - enteredAt > TIMEOUT_MS) fail('METER START TIMED OUT', now);
    } else if (previewTest.stage === 'run') {
        if (previewTest.quick) {
            const remaining = Math.max(0, Math.ceil((captureMs() - (audio[35] || 0)) / 1000));
            if (remaining !== previewTest.remaining) { previewTest.remaining = remaining; appState.dirty = true; }
            if (fresh && audio[0] === 0 && audio[1] > 0 && audio[35] >= captureMs() && requests[0] === '0' &&
                (!previewTest.thread || (seqState.cpuThread.startsWith('0;') && seqState.cpuThread.split(';').length === 10))) {
                previewTest.captures.push({ audio, requests, seconds: audio[35]/1000,
                    thread: previewTest.thread ? parseThreadMetrics() : undefined,
                    idle: previewTest.thread ? parseIdleProbe() : undefined,
                    worker: previewTest.workers ? seqState.cpuWorker.split(',').map(Number) : undefined,
                    tone: seqState.cpuTone.split(',').map(Number), gapRequest: seqState.cpuProfile.split(',')[34],
                    surface: previewTest.isolation ? launchpadIsolationMetrics() : undefined });
                seqCmd('cpulog');
                if (previewTest.workers && previewTest.pass < 2) {
                    previewTest.pass++; enter('settle', now);
                } else if (previewTest.isolation && previewTest.pass < 3) {
                    previewTest.pass++; setLaunchpadIsolation('off'); enter('settle', now);
                } else { restore(); if (previewTest.isolation) saveIsolationReport(); if (previewTest.workers || previewTest.thread) saveWorkerReport(); enter('results', now); }
            } else if (now - runningAt > captureMs() + 7000) fail('CAPTURE DID NOT COMPLETE', now);
            return;
        }
        const remaining = Math.max(0, Math.ceil((RUN_MS - (now - runningAt)) / 1000));
        if (remaining !== previewTest.remaining) { previewTest.remaining = remaining; appState.dirty = true; }
        if (now - runningAt >= RUN_MS) {
            duration = (now - runningAt) / 1000; command('aprof_off', 'stop', now);
        }
    } else if (previewTest.stage === 'stop') {
        // Wait for a fresh OFF status, retaining the final block, not a stale UI peak.
        if (fresh && audio.length >= 29 && requests.length >= 9 && audio[0] === 0 && audio[1] > 0 && requests[0] === '0' &&
            (previewTest.pass > 0 || launchpadPreviewReady())) {
            previewTest.captures.push({ audio, requests, seconds: duration });
            if (previewTest.pass < PREVIEW_TEST_LABELS.length - 1) {
                previewTest.pass++;
                enter('settle', now);
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
/** Static instruction/photo lines; the renderer owns the large running display. */
export function previewTestLines(): string[] {
    if (previewTest.thread && previewTest.stage === 'intro') return [
        'IDLE AUDIO CHECK - 65 SECONDS', 'HANDS OFF FOR THE WHOLE TEST', 'PLAYBACK STOPS AUTOMATICALLY',
        'NORMAL / TONE ONLY / NORMAL', 'KEEP TRACK AND SETTINGS FIXED', 'PLAYBACK WILL STAY STOPPED',
        'ONE DOWNLOAD WHEN FINISHED', 'CLICK:START BACK:CANCEL'];
    if (previewTest.thread && previewTest.stage === 'results') {
        const metrics = previewTest.captures[0].thread || {};
        const row = (name: string, label: string): string => {
            const metric = metrics[name];
            return label + ' ' + (metric?.wallPeakUs ?? '?') + ' ' + (metric?.wallPeakCpuValid ? metric.cpuAtWallPeakUs : '?');
        };
        return ['SAME CALL: WALLus / CPUus', row('callbackBody','AUDIO'), row('parameterRead','READ'),
            row('idleMidiTicks','MIDI TICK'), row('toneVerify','TONE CHECK'),
            'HOST OUTPUT NOT MEASURED', previewTest.reportPath ? 'SAVED: schwung/idle-test-*.json' : 'SAVE FAILED - PHOTO THIS',
            'CLICK:REPEAT BACK:EXIT'];
    }

    if (previewTest.workers && previewTest.stage === 'intro') return [
        'WORKER TEST - ABOUT 2 MIN', 'PARALLEL / SERIAL / PARALLEL', '3 X 35S TIMING + TEST TONE',
        'AUTO-PLAYS YOUR LOADED SET', 'KEEP SETTINGS FIXED DURING TEST', 'RESTORES PARALLEL AUTOMATICALLY',
        'ONE DOWNLOAD WHEN FINISHED', 'CLICK:START BACK:CANCEL'];
    if (previewTest.workers && previewTest.stage === 'results') {
        const aborted = previewTest.captures.some(capture => capture.worker?.[2]);
        return ['WORKERS GAPus LATE JOINus', ...previewTest.captures.map((capture,index) =>
            ['PAR1 ', 'SER  ', 'PAR2 '][index] + capture.audio[24] + ' ' + capture.audio[23] + ' ' + (capture.worker?.[9] ?? '?')),
            aborted ? 'SERIAL ABORTED: LOAD TOO HIGH' : 'NORMAL RENDER MODE RESTORED',
            previewTest.captures.some(capture => (capture.worker?.[5] || 0) > 0) ? 'HELPER ACTIVITY CAPTURED' : 'NO HELPER ROUNDS: INCONCLUSIVE',
            previewTest.reportPath ? 'SAVED: schwung/worker-test-*.json' : 'SAVE FAILED - PHOTO THIS',
            'CLICK:REPEAT BACK:EXIT'];
    }

    if (previewTest.isolation && previewTest.stage === 'intro') return [
        'X ISOLATION - ABOUT 2.5 MIN', 'OFF / ROUTE / PREVIEW / LED', '4 X 35S TIMING + TEST TONE',
        'NO LAUNCHPAD NEEDED', 'AUTO-PLAYS YOUR LOADED SET', 'ONE SUMMARY PHOTO AT END',
        'HOST OUTPUT NOT MEASURED', 'CLICK:START BACK:CANCEL'];
    if (previewTest.isolation && previewTest.stage === 'results') {
        const compact = (value: number): string => value > 9999 ? Math.round(value / 1000) + 'K' : String(value);
        return ['X TEST  GAPus LATE WAITms', ...previewTest.captures.map((capture,index) =>
            ['OFF ', 'ROUT', 'PREV', 'LED '][index] + ' ' + compact(capture.audio[24]) + ' ' +
            compact(capture.audio[23]) + ' ' + compact(capture.surface?.waitMs || 0)),
            'PCM BAD ' + previewTest.captures.map(capture => capture.tone?.[0] === 2 ? compact(capture.tone[2]) : '?').join('/'),
            'TX ' + compact(previewTest.captures[3].surface?.packets || 0) + ' REFUSED ' + compact(previewTest.captures[3].surface?.refusals || 0),
            previewTest.reportPath ? 'LOG SAVED: schwung/x-test-*.json' : 'LOG FAILED - PHOTO THIS'];
    }
    if (previewTest.quick && previewTest.stage === 'error') return ['CHECK NOT COMPLETED', previewTest.error,
        'TEST TONE STOPPED', 'NO COMPLETE RESULT', '', '', '', 'CLICK:RETRY  BACK:EXIT'];
    if (previewTest.quick && previewTest.stage === 'intro') return [
        'AUTO CHECK - 35 SECONDS', '30S TEST TONE + YOUR PLAYBACK', 'CHECKS PCM + TIMING CLUSTERS',
        'BACK:KEEP TESTING WHILE PLAYING', 'AUTO-PLAYS THE LOADED SET', 'RETURN HERE FOR ONE PHOTO',
        'HOST OUTPUT NOT MEASURED', 'CLICK:START  BACK:CANCEL'];
    if (previewTest.quick && previewTest.stage === 'results') {
        const capture = previewTest.captures[0], values = capture.audio, tone = capture.tone || [];
        const compact = (value: number): string => value < 100000 ? String(value) : (value/1000).toFixed(0)+'K';
        const toneResult = tone[0] !== 2 || !tone[1] ? 'INCOMPLETE' : tone[2] ? 'FAIL' : 'OK';
        return ['35S CHECK  PCM ' + toneResult,
            'GAP ' + compact(values[24]) + ' BUD ' + values[5],
            'LATE ' + compact(values[23]) + ' GROUP ' + compact(values[30]) + ' MAX ' + compact(values[31]),
            'SHORT ' + compact(values[29]) + ' WORK ' + compact(values[4]) + ' O' + compact(values[2]),
            'AT GAP R' + compact(values[26]) + ' Q' + compact(values[27]),
            compactKey(capture.gapRequest || '-'),
            'PCM BAD ' + compact(tone[2] || 0) + ' N ' + compact(tone[1] || 0),
            'PHOTO THIS  CLICK:REPEAT'];
    }
    if (previewTest.stage === 'intro') return [
        'PREVIEW TEST - 3 X 20S', 'A: NORMAL PREVIEWS', 'B: LAUNCHPAD PREVIEW FROZEN',
        'C: BOTH PREVIEWS FROZEN', 'AUTO-PLAYS YOUR LOADED SET.',
        'LISTEN HANDS-OFF FOR 60S.', 'RESTORES PREVIEWS + PLAY/STOP.', 'CLICK:START  BACK:CANCEL'];
    if (previewTest.stage === 'error') return ['TEST NOT COMPLETED', previewTest.error,
        'NORMAL PREVIEWS RESTORED', 'NO COMPLETE A/B/C COMPARISON', '', '', '', 'CLICK:RETRY  BACK:EXIT'];
    if (previewTest.stage === 'results') {
        if (previewTest.photo === 0 || previewTest.photo === 4) return []; // Numeric comparison uses columns.
        const capture = previewTest.captures[previewTest.photo - 1];
        const { audio: values, requests } = capture;
        return [
            'PHOTO ' + (previewTest.photo + 1) + '/' + PREVIEW_TEST_PHOTOS + ' ' + PREVIEW_TEST_LABELS[previewTest.photo - 1],
            'R ' + compactKey(requests[4]), 'W ' + compactKey(requests[6]),
            'IN ' + values[6] + ' SEQ ' + values[7] + ' META ' + values[8],
            'MID ' + values[9] + ' HB ' + values[10] + ' LD ' + values[11],
            'CHAIN ' + values[12] + ' T' + values[20] + ' ' + values[21],
            'N ' + values[1] + ' BUD ' + values[5] + ' C ' + requests[2],
            'CLICK:NEXT  BACK:EXIT'];
    }
    return [];
}
