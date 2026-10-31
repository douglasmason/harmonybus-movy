/** Typed boundary for the pinned shared Schwung keyboard. */
export interface TextEntryOptions {
    title?:string;
    initialText?:string;
    onConfirm:(text:string)=>void;
    onCancel?:()=>void;
    padSelect?:boolean;
}
export function openTextEntry(options:TextEntryOptions):void;
export function closeTextEntry():void;
export function handleTextEntryMidi(message:number[]):boolean;
export function drawTextEntry():void;
export function tickTextEntry():boolean;
