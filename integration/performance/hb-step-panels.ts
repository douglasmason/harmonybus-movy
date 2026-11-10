/* Presentation only: keep the complete parameter metadata for held gestures. */
const operations = new Set(['follower_touch', 'operations_9_16',
    'motion_operation', 'motion_timing', 'motion_conditions']);
const hiddenPanels = new Set(['mixed_cadences_1', 'mixed_cadences_2', 'pitch_cadences']);
const commonPanels = new Set(['root', 'follower_source', 'explicit_key']);
const harmonyPlay = new Set(['pitch_play','secondary']);
const motifs = new Set(['motifs', 'motif_tools', 'motif_play']);
const performSetup = new Set(['follower_play', 'follower_play_tools', 'motif_global']);
const harmonySetup = new Set(['chord_player', 'chord_forms', 'arp_player', 'next_harm']);
const play = new Set(['follower_play', 'chord_player', 'chord_forms', 'arp_player', 'follower_play_tools', 'motif_global']);
const setupOrder = ['global_transpose', 'explicit_key', 'follower_root', 'chord_player', 'chord_forms', 'arp_player',
    'track_scales', 'follower_source', 'next_harm', 'grid_timing',
    'shared_context', 'pad_display', 'follower_this'];
const advancedOrder = ['role_defaults', 'conductor_chord_defaults', 'follower_chord_defaults',
    'conductor_scale_defaults', 'follower_scale_defaults', 'chord_defaults_status', 'diagnostics'];

export function hbPanelVisible(condition: any): boolean {
    return condition?.movyStepVisible !== false;
}

export function hbStepHierarchy(hierarchy: any, mode: number): any {
    const levels = hierarchy.levels;
    if (levels?.root) {
        // Inline metadata uses the shared native/remote/standalone controller.
        // The HB manifest is close to the host's 64 KiB limit.
        const choice = (key: string, name: string, options: string[]): any =>
            ({key, name, type: 'enum', options, options_as_string: false});
        const pressureParams = [
            choice('approach_pressure_row', 'Approach row', ['Row 1', 'Row 2', 'Row 3', 'Single']),
            {key: 'approach_pressure_lane', name: 'Operation slot', type: 'int', min: 0, max: 16},
            choice('approach_pressure_mode', 'Pressure mode', ['Off', 'Momentary', 'Tap Latch', 'Peak Latch']),
            choice('approach_pressure_reverse', 'Direction', ['Normal', 'Reverse']),
            {key: 'approach_pressure_prepared', name: 'Tap amount %', type: 'int', min: 0, max: 100},
            {key: 'approach_pressure_value', name: 'Pressure', type: 'string', access: 'read'},
        ];
        levels.approach_pressure = {name: 'Approach Pressure', params: pressureParams,
            knobs: pressureParams.map(parameter => parameter.key)};
        if (!levels.root.params.some((parameter: any) => parameter.level === 'approach_pressure'))
            levels.root.params.push({level: 'approach_pressure'});
    }
    // A compact native hierarchy may declare controls only in its knob list.
    // Preserve discovery while chain metadata is still arriving at startup.
    for (const level of Object.values<any>(levels ?? {})) {
        const params = level.params ??= [];
        for (const key of level.knobs ?? []) {
            if (key && !params.some((entry: any) => entry.key === key)) params.push({key});
        }
    }
    if (!levels?.root) return hierarchy;
    for (const [key, level] of Object.entries<any>(levels)) {
        const visible = key === 'approach_pressure' ? mode === 0 || mode === 2 : hiddenPanels.has(key) ? false : harmonyPlay.has(key) ? mode === 2 : operations.has(key) ? mode === 1 : motifs.has(key) ? mode === 2 : commonPanels.has(key) || mode === 0 || (mode === 1 ? performSetup : harmonySetup).has(key);
        if (!visible) level.visible_if = { movyStepVisible: false };
        // Render Rhythm has multiple incoming links. Place it once, at the end.
        if (key !== 'root') level.params = level.params?.filter((p: any) => p.level !== 'motif_global');
    }
    const params = levels.root.params ?? [];
    const controls = params.filter((p: any) => !p.level);
    const links = params.filter((p: any) => p.level);
    const rank = (key: string): number => {
        const setup = setupOrder.indexOf(key);
        if (setup >= 0) return setup;
        const advanced = advancedOrder.indexOf(key);
        if (advanced >= 0) return 300 + advanced;
        if (operations.has(key) || motifs.has(key)) return 400;
        return play.has(key) ? 200 : 90;
    };
    links.sort((a: any, b: any) => rank(a.level) - rank(b.level));
    levels.root.params = [...controls, ...links];
    return hierarchy;
}
