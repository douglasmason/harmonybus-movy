/* Presentation only: keep the complete parameter metadata for held gestures. */
const operations = new Set(['follower_touch', 'operations_9_16', 'pitch_play', 'secondary',
    'pitch_cadences', 'motion_operation', 'motion_timing', 'motion_conditions',
    'mixed_cadences_1', 'mixed_cadences_2']);
const motifs = new Set(['motifs', 'motif_tools', 'motif_play']);
const play = new Set(['follower_play', 'chord_player', 'arp_player', 'follower_play_tools', 'motif_global']);
const setupOrder = ['global_transpose', 'follower_root', 'track_scales', 'follower_source',
    'conductor_scale_defaults', 'follower_scale_defaults', 'conductor_chord_defaults',
    'follower_chord_defaults', 'chord_defaults_status', 'next_harm', 'grid_timing',
    'pad_display', 'follower_this', 'diagnostics'];

export function hbPanelVisible(condition: any): boolean {
    return condition?.movyStepVisible !== false;
}

export function hbStepHierarchy(hierarchy: any, mode: number): any {
    const levels = hierarchy.levels;
    if (!levels?.root) return hierarchy;
    for (const [key, level] of Object.entries<any>(levels)) {
        const visible = operations.has(key) ? mode === 1 : motifs.has(key) ? mode === 2 : true;
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
        if (operations.has(key) || motifs.has(key)) return 100;
        return play.has(key) ? 200 : 90;
    };
    links.sort((a: any, b: any) => rank(a.level) - rank(b.level));
    levels.root.params = [...controls, ...links];
    return hierarchy;
}
