/** Short host-mix capture; never commandeers an armed/recording sampler. */
import { appState } from '../app/state.js';
import { seqState } from './state.js';
import { seqCmd, statusSeq, engineReady } from './engine.js';
import { currentSetUuid, sessionReady } from './set-session.js';
import { safeWrite } from './persist-store.js';
import { OutputWave } from './output-wave.js';

declare function shadow_get_overlay_state(): { samplerState?: number; samplerSource?: number; samplerSamplesWritten?: number; samplerVuPeak?: number; transportPlaying?: number };
declare function host_sampler_start(path: string): boolean;
declare function host_sampler_stop(): boolean;
declare function host_sampler_is_recording(): boolean;

type Stage='idle'|'intro'|'stopping'|'settle'|'recording'|'tone'|'tail'|'finalizing'|'analysis'|'results'|'error';
export const outputCapture = { stage:'idle' as Stage, remaining:12, error:'', reportPath:'', wavPath:'' };
let entered=0, started=0, freshAfter=0, ownsSampler=false, setId='', stopSamples=0;
let analyzer:OutputWave|null=null;
let initial:ReturnType<typeof shadow_get_overlay_state>={}, final:ReturnType<typeof shadow_get_overlay_state>={};
let toneSeenRunning=false, previousSamples=-1;
let tone:number[]=[], toneStartedAt=0, capturedBuild='';
function enter(stage:Stage,now:number):void {outputCapture.stage=stage;entered=now;appState.dirty=true;}
function capabilities():boolean {
    return typeof shadow_get_overlay_state==='function' && typeof host_sampler_start==='function' && typeof host_sampler_stop==='function' && typeof host_sampler_is_recording==='function' && typeof std!=='undefined' && typeof std.open==='function';
}
function stopOwned():void {if(ownsSampler){host_sampler_stop();ownsSampler=false;}}
export function cancelOutputCapture():void {
    if(outputCapture.stage==='idle')return;
    stopOwned();seqCmd('aprof_off');analyzer?.close();analyzer=null;
    outputCapture.stage='idle';appState.dirty=true;
}
function fail(message:string,now:number):void {
    stopOwned();seqCmd('aprof_off');analyzer?.close();analyzer=null;
    outputCapture.error=message;enter('error',now);
}
export function clickOutputCapture(now:number):void {
    if(!['idle','intro','results','error'].includes(outputCapture.stage)){cancelOutputCapture();return;}
    if(outputCapture.stage!=='intro') {
        outputCapture.error='';outputCapture.reportPath='';enter('intro',now);return;
    }
    if(!capabilities()){fail('HOST CAPTURE API UNAVAILABLE',now);return;}
    if(!engineReady()||!sessionReady()){fail('WAIT FOR SET TO LOAD',now);return;}
    initial=shadow_get_overlay_state();
    if(initial.samplerState!==0||host_sampler_is_recording()){fail('SAMPLER BUSY - CANCEL IT FIRST',now);return;}
    if(initial.samplerSource!==0){fail('SET SCHWUNG SOURCE TO RESAMPLE',now);return;}
    if(seqState.recording||seqState.countingIn){fail('STOP RECORDING FIRST',now);return;}
    setId=currentSetUuid();tone=[];toneSeenRunning=false;stopSamples=0;analyzer=null;toneStartedAt=0;
    capturedBuild=seqState.workerBuild;
    outputCapture.wavPath='/data/UserData/schwung/output-test-'+Date.now()+'.wav';
    freshAfter=statusSeq();seqCmd('aprof_off');seqCmd('stop');enter('stopping',now);
}
export function tickOutputCapture(now:number):void {
    const stage=outputCapture.stage;
    if(['idle','intro','results','error'].includes(stage))return;
    try {
        if(!engineReady()||!sessionReady()||currentSetUuid()!==setId||seqState.recording||seqState.countingIn){fail('SET OR RECORDING CHANGED',now);return;}
        const overlay=shadow_get_overlay_state();
        if(overlay.samplerSource!==0){fail('SAMPLER SOURCE CHANGED',now);return;}
        if(stage!=='stopping'&&(seqState.playing||overlay.transportPlaying)){fail('PLAYBACK INTERRUPTED CHECK',now);return;}
        if(stage==='stopping') {
            if(statusSeq()>freshAfter&&!seqState.playing&&!overlay.transportPlaying)enter('settle',now);
            else if(now-entered>5000)fail('PLAYBACK STOP TIMED OUT',now);
        } else if(stage==='settle'&&now-entered>=1000) {
            if(overlay.samplerState!==0||host_sampler_is_recording()){fail('SAMPLER BECAME BUSY',now);return;}
            // No source/volume/recording-mode changes. A distinct path for every run.
            ownsSampler=true;
            if(!host_sampler_start(outputCapture.wavPath)){fail('RECORDER START FAILED',now);return;}
            previousSamples=-1;started=now;enter('recording',now);
        } else if(stage==='recording') {
            // Require new captured samples: RECORDING alone can precede file creation.
            const samples=overlay.samplerSamplesWritten||0;
            const advancing=previousSamples>=0&&samples>previousSamples;previousSamples=samples;
            if(host_sampler_is_recording()&&advancing&&samples>=22050&&now-entered>=500) {
                freshAfter=statusSeq();seqCmd('ocapture');toneStartedAt=now;enter('tone',now);
            } else if(now-entered>5000)fail('NO HOST CAPTURE SAMPLES',now);
        } else if(stage==='tone') {
            if(!host_sampler_is_recording()){fail('RECORDER STOPPED EARLY',now);return;}
            tone=seqState.cpuTone.split(',').map(Number);
            outputCapture.remaining=Math.max(0,10-Math.floor((tone[4]||0)/44100));appState.dirty=true;
            if(statusSeq()>freshAfter&&tone[0]===1)toneSeenRunning=true;
            if(toneSeenRunning&&statusSeq()>freshAfter&&tone[0]===2&&tone[4]>=441000)enter('tail',now);
            else if(statusSeq()>freshAfter&&tone[0]===3)fail('INPUT INTERRUPTED TONE',now);
            else if(now-entered>15000)fail('TONE DID NOT COMPLETE',now);
        } else if(stage==='tail'&&now-entered>=500) {
            stopSamples=overlay.samplerSamplesWritten||0;final=overlay;stopOwned();seqCmd('aprof_off');enter('finalizing',now);
        } else if(stage==='finalizing') {
            if(!host_sampler_is_recording()&&overlay.samplerState===0) {
                const file=std.open(outputCapture.wavPath,'rb');
                if(!file){fail('CAPTURE FILE NOT FOUND',now);return;}
                analyzer=new OutputWave(file);enter('analysis',now);
            } else if(now-entered>15000)fail('RECORDER FINALIZE TIMED OUT',now);
        } else if(stage==='analysis'&&analyzer?.tick()) {
            const wave=analyzer.result;
            const signal=wave.windows.filter(window=>window[6]>100&&window[7]>50);
            const report={format:'movy-output-test-v1',capturedAt:new Date().toISOString(),engineBuild:capturedBuild,
                complete:tone[0]===2&&tone[2]===0&&wave.frames>=wave.rate*10,
                wavPath:outputCapture.wavPath,initialOverlay:initial,finalOverlay:final,stopSamples,
                toneCommandAfterRecorderMs:toneStartedAt-started,tone,expected:{frequencyHz:220,seconds:10,leftPeak:2048,rightPeak:1024,polarity:'same'},
                observation:signal.length>=80?'220 Hz component present for at least 8 seconds':wave.windows.every(window=>window[4]===0&&window[5]===0)?'recording is digital silence':'tone missing, weak, shortened, or obscured',wave,
                limitations:['Captures host combined mix before master volume and speaker processing, not DAC output',
                    'Recording adds writer activity; this is a routing check, not an unperturbed timing benchmark',
                    'Other audible tails/effects can change these measurements; 220 Hz energy is evidence, not proof of exact waveform integrity',
                    'Max adjacent sample steps and zero counts are observations, not audible crackle counts',
                    'Host recorder can drop samples under load; a discontinuity does not identify its originating stage',
                    'Raw WAV retained for detailed phase/discontinuity analysis if needed; no user set or settings edited']};
            const path=outputCapture.wavPath.replace(/\.wav$/,'.json');
            if(!safeWrite(path,JSON.stringify(report,null,2))){fail('REPORT SAVE FAILED - KEEP WAV',now);return;}
            outputCapture.reportPath=path;enter('results',now);
        }
    } catch(error){fail(String(error),now);}
}
export function outputCaptureLines():string[] {
    if(outputCapture.stage==='intro')return ['HOST OUTPUT CHECK','ABOUT 12 SECONDS + ANALYSIS','PLAYBACK STOPS AUTOMATICALLY','HANDS OFF; NO SET PREPARATION','RECORDS A 10 SECOND TEST TONE','LEAVES PLAYBACK STOPPED','ONE JSON DOWNLOAD AT THE END','CLICK:START BACK:CANCEL'];
    if(outputCapture.stage==='results')return ['HOST RECORDING ANALYZED','SAVED IN schwung FOLDER','DOWNLOAD output-test-*.json','WAV KEPT IF NEEDED LATER','THIS CHECK IS BEFORE VOLUME','AND BEFORE SPEAKER PROCESSING','PRESS PLAY TO RESUME MUSIC','CLICK:REPEAT BACK:EXIT'];
    if(outputCapture.stage==='error')return ['CHECK NOT COMPLETED',outputCapture.error,'TEST TONE STOPPED','PARTIAL WAV MAY BE PRESENT','NO SETTINGS CHANGED','','','CLICK:RETRY BACK:EXIT'];
    return ['HOST OUTPUT CHECK',outputCapture.stage==='tone'?'TONE: '+outputCapture.remaining+' SECONDS':outputCapture.stage.toUpperCase(),
        'HANDS OFF; PLAYBACK STOPPED','RECORDING HOST MIX TO WAV','ANALYSIS RUNS AFTER CAPTURE','ONE JSON DOWNLOAD AT THE END','','CLICK:CANCEL BACK:KEEP RUNNING'];
}
