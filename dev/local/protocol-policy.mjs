export const trackKey=/^ch([0-9]|1[0-5]):midi_fx1:(\w+)(?::(?:base|modulated))?$/;
export const jointAction=/^(?:joint_pad_)?(?:approach_(?:step_touch_\d+|touch_\d+|control_\w+|mode_active|motif_latch)|motion_(?:gesture_\d+|hold_\d+|release)|key_center|dominant_color|dominant_color_family|harm_play_release\w*|harm_play_advance|target_scale_\w+|motif_placement)$/;
export const routingKeys=new Set(['joint_map','joint_links','joint_release']);
export const engineReadKey=/^(?:ping|status|source_diagnostics|(?:source_route|source_preview|variation)_(?:[0-9]|1[0-5]))$/;
/** Only production panel edits; no arbitrary filesystem, loader or sequencer input. */
export function validateEngineCommand(value){
 if(typeof value!=='string'||value.length>2048)throw new Error('Invalid engine edit');
 for(const command of value.split(';').filter(Boolean)){
  const [verb,...parts]=command.trim().split(/\s+/),values=parts.map(Number);
  if(parts.some(part=>!/^[-]?\d+$/.test(part))||values.some(number=>!Number.isSafeInteger(number)))throw new Error('Invalid engine edit values');
  if(['usnap','udrop'].includes(verb)&&values.length===1&&values[0]>=0)continue;
  if(verb==='variation'&&values.length===6&&values[0]>=0&&values[0]<16&&values.slice(1,5).every(number=>number>=0&&number<=100)&&values[5]>=1&&values[5]<=256)continue;
  if(verb==='source'&&values.length===17&&values[0]>=0&&values[0]<16&&[0,1].includes(values[1])&&[0,1].includes(values[6])&&[2,4,7,9,11,13,15].every(index=>values[index]>=-1&&values[index]<16&&values[index+1]>=-1&&values[index+1]<8))continue;
  throw new Error('Engine command unavailable in this host: '+verb);
 }
 return value;
}
export const writeKeys=new Set(['motion_host','field_outputs_remote','field_output_finish','field_output_clear','travel_map','master_transpose','retrigger_held','chord_mode','chord_timing','quant_timing','pad_preview_inputs','pad_display','pad_pulse_rate']);

export function prepareMetadata(metadata) {
  const params=metadata.capabilities.chain_params;
  const readable=new Set([...params.filter(p=>!p.writeOnly&&p.key!=='state').map(p=>p.key),'pad_view','pad_output']);
  const enabledWrites=new Set([...writeKeys,...params.filter(p=>!p.readOnly&&p.access!=='read'&&!p.writeOnly&&['enum','int','float'].includes(p.type)).map(p=>p.key)]);
  metadata.dev={readable:[...readable],writable:[...enabledWrites]};
  for(const param of params)if(!enabledWrites.has(param.key)){param.readOnly=true;param.access='read';}
  return {metadata,readable,enabledWrites};
}
