/* An optional non-song destination for the existing step-record gestures.
   When absent, the normal clip recorder executes exactly its original path. */
export interface StepRecTarget {
    head(): number;
    header(): string;
    canGoLeft(): boolean;
    pad(pad: number, pitch: number, velocity: number): boolean;
    release(pad: number): boolean;
    arrow(direction: number): boolean;
    step(button: number): boolean;
    end(): void;
    reset(): void;
}
let target: StepRecTarget | null = null;
export function setStepRecTarget(value: StepRecTarget | null): void { target=value; }
export function stepRecTarget(): StepRecTarget | null { return target; }
