/** Presentation boundary. Musical schemas remain in production Movy and HB. */
export type Engine = 'browser' | 'move';
export type ConnectionState = 'browser' | 'switching' | 'disconnected' | 'connecting' | 'connected' | 'error';
export interface Capabilities {
 input: boolean;
 semantic: boolean;
 audio: boolean;
 leds?: boolean;
 /** Null when the endpoint does not report a version; never infer from pixels. */
 hostVersion?: string | null;
}
export type ComponentId = 'controls' | 'pads' | 'field' | 'choices' | 'song' | 'lights';
export interface WorkspaceLayout {
 shown: ComponentId[];
 order: ComponentId[];
 layout: 'stack' | 'columns';
 track: 'follow' | `${number}`;
 lighting?: unknown;
}
export interface ParameterBridge {
 component: string;
 getParam(key: string): Promise<string | undefined>;
 setParam(key: string, value: string): void;
}
export interface MountedComponent {
 isHeld(): boolean;
 release(): void;
 suspend(): void;
 resume(): void;
 dispose(): void;
}
/** Existing host messages, not a new musical operation language. */
export type WorkspaceCommand =
 | {type: 'set_param'; key: string; value: string}
 | {type: 'move_midi'; data: [number, number, number]}
 | {type: 'move_mode'; previous: number; mode: number}
 | {type: 'move_panel'; token: number; index: number}
 | {type: 'move_comp_source'; group: number; source: number}
 | {type: 'move_song'; action: 'hold'; value: boolean}
 | {type: 'move_song'; action: 'scene'; value: number}
 | {type: 'move_song'; action: 'edit'}
 | {type: 'dev_release'}
 | {type: 'subscribe_tool'};
export interface ConnectionOwner {
 readonly engine: Engine;
 readonly busy: boolean;
 send(command: WorkspaceCommand): void;
 watch(owner: string, keys: string[]): void;
 select(engine: Engine): Promise<void>;
 connect(address: string): void;
 disconnect(): void;
 acceptBrowserFrame(): boolean;
}
/** The raw mirror deliberately has no semantic labels or writable controls. */
export interface DeviceFrame {
 device: true;
 ready: false;
 track: null;
 screen: Uint8Array;
 surface: Uint8Array;
 displayRevision: number;
 display: null;
 panels: null;
 knobLabels: null;
 padLabels: null;
 stepLabels: null;
}
