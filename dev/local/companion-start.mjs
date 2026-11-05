/** Portable launcher. Reuses the companion's read-only default and opt-in pairing. */
import {parseArgs} from 'node:util';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createDeviceServer} from './move-device-server.mjs';

export function companionOptions(args){
 const {values}=parseArgs({args,options:{host:{type:'string',default:'127.0.0.1'},port:{type:'string',default:'7703'},move:{type:'string',default:'http://move.local:7700'},'enable-transport':{type:'boolean',default:false},help:{type:'boolean',default:false}}});
 const host=values.host,parts=host.split('.').map(Number),port=Number(values.port);
 if(isIP(host)!==4||!(host==='127.0.0.1'||parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31))throw new Error('Use one explicit private LAN IPv4 address, or 127.0.0.1.');
 if(!/^\d+$/.test(values.port)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a port from 1024 to 65535.');
 return {...values,host,port,origin:`http://${host}:${port}`};
}
export function startCompanion(args,siteRoot){
 const options=companionOptions(args);
 if(options.help){
  console.log('node start.mjs --host YOUR_COMPUTER_LAN_IP --move http://move.local:7700 [--enable-transport]\nDefaults: this computer only (127.0.0.1), port 7703, read-only mirror. No device request on startup.\n--enable-transport prints a fresh pairing key for optional Play/Stop with a capable Movy build.\nComputer IPv4 addresses (choose your trusted LAN):');
  try{for(const addresses of Object.values(networkInterfaces()))for(const address of addresses??[])if(address.family==='IPv4'&&!address.internal)console.log(address.address);}
  catch{console.log('Address listing unavailable. Find your computer’s LAN IPv4 in its network settings.');}
  return null;
 }
 const pairingKey=options['enable-transport']?randomBytes(32).toString('hex'):null;
 const server=createDeviceServer({siteRoot,moveAddress:options.move,origin:options.origin,pairingKey});
 server.once('error',error=>{console.error('Companion could not start: '+error.message);process.exitCode=1;});
 server.listen(options.port,options.host,()=>{
  console.log(`Open ${options.origin}/move/ on ${options.host==='127.0.0.1'?'this computer':'your iPad on the same trusted LAN'}.\nSelect Engine → Move, enter ${options.origin}.`);
  if(pairingKey)console.log(`Pairing key: ${pairingKey}\nFor Play/Stop, check paired Play/Stop, paste this key, then Connect. Requires Movy's safe-state capability (hbclean.320+).\nKeep the key private; enter it again to reconnect. Restarting generates a new key. Plain LAN HTTP does not encrypt it.`);
  else console.log('Read-only screen/LED mirror. Click Connect. Add --enable-transport at launch to opt in to paired Play/Stop.');
  console.log('No device software or session transfer. Ctrl+C stops the companion.\nPlain LAN HTTP may not support browser audio. Use the hosted HTTPS trial for Browser mode.');
 });
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))startCompanion(process.argv.slice(2),new URL('../wasm/build/site/',import.meta.url));
