/** Bounded, post-recording analysis. These are waveform observations, not DAC underrun counts. */
export type WaveFile = { read(buffer: ArrayBuffer, position: number, length: number): number; seek(offset: number, whence: number): number; close(): void };
export class OutputWave {
    private file: WaveFile;
    private bytesLeft = 0;
    private buffer = new ArrayBuffer(16384);
    private previous = [0,0];
    private sums = [0,0];
    private squares = [0,0];
    private sine = [0,0];
    private cosine = [0,0];
    private peaks = [0,0];
    private jumps = [0,0];
    private zeros = [0,0];
    private windowFrames = 0;
    private closed = false;
    readonly result = { rate: 0, frames: 0, windowFields: ['startSeconds','frames','leftRms','rightRms','leftPeak','rightPeak','left220HzAmplitude','right220HzAmplitude','leftMaxStep','rightMaxStep','leftZeroSamples','rightZeroSamples'], windows: [] as number[][] };
    constructor(file: WaveFile) {
        this.file = file;
        try {
            const header = new ArrayBuffer(12), view = new DataView(header);
            if (file.read(header,0,12)!==12 || view.getUint32(0,false)!==0x52494646 || view.getUint32(8,false)!==0x57415645) throw Error('NOT A RIFF WAVE FILE');
            let offset=12, format=false, found=false;
            for(let chunk=0;chunk<64;chunk++) {
                const bytes=new ArrayBuffer(8), chunkView=new DataView(bytes);
                if(file.seek(offset,0)!==0 || file.read(bytes,0,8)!==8) throw Error('TRUNCATED WAVE HEADER');
                const id=chunkView.getUint32(0,false), size=chunkView.getUint32(4,true);
                if(id===0x666d7420) {
                    const fmt=new ArrayBuffer(16), fields=new DataView(fmt);
                    if(size<16 || file.read(fmt,0,16)!==16 || fields.getUint16(0,true)!==1 || fields.getUint16(2,true)!==2 || fields.getUint16(14,true)!==16 || fields.getUint16(12,true)!==4) throw Error('NEED STEREO PCM16');
                    this.result.rate=fields.getUint32(4,true); format=true;
                } else if(id===0x64617461) {
                    if(!format || ![44100,48000].includes(this.result.rate) || !size || size%4 || size>this.result.rate*4*25) throw Error('INVALID CAPTURE LENGTH');
                    this.bytesLeft=size; found=true; break;
                }
                offset+=8+size+(size%2);
            }
            if(!found) throw Error('NO WAVE DATA');
        } catch(error) { this.close(); throw error; }
    }
    close(): void { if(!this.closed) { this.file.close(); this.closed=true; } }
    private flush(): void {
        const count=this.windowFrames;
        if(!count) return;
        this.result.windows.push([(this.result.frames-count)/this.result.rate,count,
            ...this.squares.map((value,index)=>Math.sqrt(Math.max(0,value/count-(this.sums[index]/count)**2))),
            ...this.peaks,...this.sine.map((value,index)=>2*Math.hypot(value,this.cosine[index])/count),...this.jumps,...this.zeros]);
        this.sums.fill(0); this.squares.fill(0); this.sine.fill(0); this.cosine.fill(0); this.peaks.fill(0); this.jumps.fill(0);this.zeros.fill(0);this.windowFrames=0;
    }
    /** One small read per UI tick, only after the recorder has finalized. */
    tick(): boolean {
        if(this.closed) return true;
        try {
            const count=Math.min(this.bytesLeft,this.buffer.byteLength);
            if(this.file.read(this.buffer,0,count)!==count) throw Error('TRUNCATED WAVE DATA');
            const view=new DataView(this.buffer);
            for(let offset=0;offset<count;offset+=4) {
                const phase=2*Math.PI*220*this.result.frames/this.result.rate, sine=Math.sin(phase), cosine=Math.cos(phase);
                for(let channel=0;channel<2;channel++) {
                    const value=view.getInt16(offset+channel*2,true);
                    this.sums[channel]+=value; this.squares[channel]+=value*value;
                    this.sine[channel]+=value*sine; this.cosine[channel]+=value*cosine;
                    this.peaks[channel]=Math.max(this.peaks[channel],Math.abs(value));
                    if(this.result.frames) this.jumps[channel]=Math.max(this.jumps[channel],Math.abs(value-this.previous[channel]));
                    this.previous[channel]=value; if(value===0)this.zeros[channel]++;
                }
                this.result.frames++; this.windowFrames++;
                if(this.windowFrames===this.result.rate/10)this.flush();
            }
            this.bytesLeft-=count;
            if(!this.bytesLeft){this.flush();this.close();return true;}
            return false;
        } catch(error){this.close();throw error;}
    }
}
