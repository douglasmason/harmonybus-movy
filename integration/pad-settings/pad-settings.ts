/** The Set page edits the same HB color parameters as the pad renderer. */
import { appState } from '../app/state.js';
import { portFor } from '../track/registry.js';
import { paramCell } from './param-vm.js';
import { markUiStateDirty } from './ui-dirty.js';

const parameters = [
    ['pad_display','HARMONY','Harmony Display',['Off','Current','Effective','Lookahead','Both','Full Lookahead','Both Full Lookahead']],
    ['pad_pulse_rate','RATE','Pulse Rate',['Off','1/16','1/8','1/4','1/2','1 Bar','2 Bars','4 Bars']],
    ['pad_pulse_shape','SHAPE','Pulse Shape',['None','Sine','Triangle','Square']],
    ['pad_current_color','CURRENT','Current Color',[]],
    ['pad_play_color','PLAYED','Play Color',[]],
    ['pad_lookahead_color','NEXT','Lookahead Color',[]],
    ['pad_both_color','BOTH','Both Color',[]],
    ['pad_tonic_color','TONIC','Tonic Color',[]],
] as const;
let track = -1, sampledAt = -Infinity;
let metadata: any[] = [];
const values = new Map<string,string>();

function refresh(): void {
    const current = appState.activeTrack.index, now = Date.now();
    if (current === track && now - sampledAt < 100) return;
    const port = portFor(current);
    if (current !== track || !metadata.length) {
        try { metadata = JSON.parse(port.getParam('midi_fx1:chain_params') || '[]'); }
        catch { metadata = []; }
    }
    track = current;sampledAt = now;
    for (const [key] of parameters) values.set(key, port.getParam('midi_fx1:'+key) || '');
}
export function padSettingsCells(touched: number): any[] {
    refresh();
    return parameters.map(([key,shortName,fullName,fallback],index) => {
        const meta = metadata.find(parameter => parameter.key === key);
        const options: string[] = meta?.options || [...fallback];
        const value = values.get(key) || '--';
        const selected = Math.max(0,options.indexOf(value));
        const cell = paramCell({shortName,fullName,type:'enum',options,isLongEnum:true,
            enumIndex:selected,displayValue:value,normalizedValue:options.length>1?selected/(options.length-1):0});
        cell.touched = touched === index;
        return cell;
    });
}
export function padSettingsTurn(knob: number, delta: number): void {
    refresh();
    const specification = parameters[knob];if (!specification) return;
    const [key] = specification;
    const options: string[] = metadata.find(parameter => parameter.key === key)?.options || [];
    if (!options.length) return;
    const previous = Math.max(0,options.indexOf(values.get(key) || ''));
    const next = Math.max(0,Math.min(options.length-1,previous+delta));
    if (next === previous) return;
    portFor(track).setParam('midi_fx1:'+key,options[next]);values.set(key,options[next]);
    markUiStateDirty();appState.dirty=true;
}
