/** Presentation order only. Labels remain the native wire values; IDs never move. */
const operationGroups: [string, string[]][] = [
    ['Off', ['Off']],
    ['Connectors', ['Connector Below','Connector Above','Enclose Above Below','Enclose Below Above']],
    ['Parent Secondaries', ['Secondary II','Secondary III','Secondary IV','Secondary Fifth','Secondary VI','Secondary VII']],
    ['Dominant Approach', ['Secondary II (Dom)','Secondary IV (Dom)','Secondary VI (Dom)','Secondary V','Leading Tone','Upper Dim']],
    ['Substitutions', ['Backdoor II','Backdoor V','Tritone II','Tritone Sub']],
    ['Motif', ['Play Motif']],
    ['Harmony', ['Harmony','Key Center','Parallel Scale','Live Harmony Override','Override Harmony (Live + Recorded)']],
    ['Chord / Arp', ['Chord Form','Chord/Arp State','Auto Chord Repeat']],
    ['Pitch', ['Transpose','Octave','Rotate']],
    ['Expression', ['Velocity','Pan']],
    ['Rhythm', ['Gate','Skip','Ratchet','MIDI Echo']],
    ['Clip', ['Clip Repeat','Clip Reverse','Clip Time Shift','Clip Speed']],
];
const motifGroups: [string, string[]][] = [
    ['Basic Cadences', ['V-Target','ii-V-Target','ii halfdim-V-i']],
    ['Substitute Cadences', ['iv-bVII-Target','bII7-Target','ii-bII7-Target']],
    ['Borrowed Cadences', ['bVI-bVII-I','bVI-V-I','bIII-IV-I','IV-iv-I']],
    ['Turnarounds', ['vi-V-I','iii-vi-ii-V-I','I-VI7-ii-V-I','III7-VI7-II7-V7-I']],
    ['Secondary Chains', ['V/V-V-I','ii/V-V/V-V-I','vii dim/V-V-I','V/ii-ii-V-I','V/vi-vi-ii-V-I']],
    ['Three-Step Motifs', ['vi-ii-V','ii-V-LT','iv-bVII-LT','ii-bII7-LT','iii-vi-ii','IV-ii-V','vii-iii-vi','LT-ii-V']],
];
export const DOMINANT_COLOR_ORDER=['None','Simplified Target','Major','Harmonic Major','Harmonic Minor','Melodic Minor','Altered V'];
const chordOrder=['Follow Role','Follow Detected','Auto','Root Only','Root + Third','Root + Seventh','Power','Triad','Sus2','Sus4','Sixth','Add9','Seventh','6/9','Ninth','Eleventh','Thirteenth','Shell 7','Shell 9','Shell 6/9','Rootless 7','Rootless 9'];
const operationOrder=operationGroups.flatMap(([,choices])=>choices);
const motifOrder=motifGroups.flatMap(([,choices])=>choices);
const bankOrder=[...operationOrder,...motifOrder.map(name=>'Stock: '+name),...Array.from({length:16},(_,index)=>'User '+(index+1))];

/** Unknown future options keep their original relative order at the end. */
export function orderedChoices(options: string[], order: string[]): string[] {
    const rank=(name:string):number=>{const index=order.indexOf(name);return index<0?order.length:index;};
    return [...options].sort((first,second)=>rank(first)-rank(second));
}
export function orderedBankChoices(options: string[]): string[] { return orderedChoices(options,bankOrder); }
export function choiceGroup(name: string): string {
    if(/^User \d+$/.test(name))return 'User Motifs';
    const groups=name.startsWith('Stock: ')?motifGroups:operationGroups;
    const label=name.replace(/^Stock: /,'');
    return groups.find(([,choices])=>choices.includes(label))?.[0]||'Operation';
}

/** Reorder only explicitly name-encoded enums; numeric contracts stay untouched. */
export function orderHarmonyChoices(value: any): void {
    if(!value||typeof value!=='object')return;
    if(value.options_as_string===true&&Array.isArray(value.options)){
        const key=String(value.key||'');
        const order=key==='motion_operation'?operationOrder:key==='motif_preset'?['Library',...motifOrder]:
            /chord_form$/.test(key)?chordOrder:/(^|_)dominant_(minor_)?scale$/.test(key)?DOMINANT_COLOR_ORDER:null;
        if(order)value.options=orderedChoices(value.options,order);
    }
    for(const child of Object.values(value))if(child&&typeof child==='object')orderHarmonyChoices(child);
}
