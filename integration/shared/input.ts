import { SurfaceInput } from './core-input.js';
/** The sole surface command transport for this processor instance. */
export const surfaceInput = new SurfaceInput((key,value,timeout) =>
    typeof host_module_set_param_blocking !== 'function' || host_module_set_param_blocking(key,value,timeout), Date.now()*128);
declare function host_module_set_param_blocking(key: string, value: string, timeout: number): boolean;
