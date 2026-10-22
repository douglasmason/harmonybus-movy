import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
/** Serialized native RPC; processor, snapshots and ticks share one owner. */
export class Processor {
  constructor(directory) {
    this.pending=[]; this.dead=false; this.onResult=()=>{};
    this.process=spawn(resolve(directory,'host'),[resolve(directory,'libmovy_dsp.so'),resolve(directory,'modules')],{stdio:['pipe','pipe','pipe']});
    this.process.stderr.on('data',data=>{this.lastLog=String(data)});
    const fail=error=>{this.dead=true;for(const request of this.pending.splice(0))request.reject(error)};
    this.process.on('error',fail);
    this.process.on('exit',code=>fail(new Error(`Processor exited (${code}): ${this.lastLog??''}`)));
    createInterface({input:this.process.stdout}).on('line',line=>{
      const request=this.pending.shift();
      try {const result=JSON.parse(line);if(result.overflow)throw new Error('Native MIDI capture overflow');this.onResult(result,request?.command);request?.resolve(result)} catch(error){request?.reject(error)}
    });
  }
  request(operation,...arguments_) {
    if(this.dead)return Promise.reject(new Error('Processor unavailable'));
    if(this.pending.length>=128)return Promise.reject(new Error('Processor command queue full'));
    if([operation,...arguments_].some(value=>/[\t\r\n]/.test(String(value))))return Promise.reject(new Error('Invalid command separator'));
    return new Promise((resolve,reject)=>{this.pending.push({resolve,reject,command:{operation,key:arguments_[0]}});this.process.stdin.write([operation,...arguments_].join('\t')+'\n')});
  }
  close(){this.process.stdin.end()}
}
