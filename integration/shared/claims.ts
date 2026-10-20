/** One owner for each channel and for the host's aggregate external-input flag. */
const owners = new Set<number>();
const channels = new Map<number,number>();
export function claimChannel(source: number, channel: number, output: number): boolean {
    if (typeof host_ext_midi_remap_set !== 'function') return false;
    if (output < 0 && channels.get(channel) !== source) return true;
    // Launchpad has priority on channel 1. FM1 refuses the collision in its lifecycle.
    if (output >= 0 && channels.has(channel) && channels.get(channel) !== source && source !== 0) return false;
    if (!host_ext_midi_remap_set(channel,output)) return false;
    if (output < 0) channels.delete(channel); else channels.set(channel,source);
    return true;
}
export function claimSurface(source: number, enabled: boolean): boolean {
    const next = new Set(owners);
    if (enabled) next.add(source); else next.delete(source);
    if (typeof host_external_surface !== 'function' || !host_external_surface(next.size ? 1 : 0)) return false;
    owners.clear(); next.forEach(owner => owners.add(owner)); return true;
}
declare function host_ext_midi_remap_set(input: number, output: number): boolean;
declare function host_external_surface(enabled: number): boolean;
