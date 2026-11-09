//! Bounded attack membership matching HarmonyBus Euclidean Fill.
//! This is a source decision; timing and note ownership stay in the sequencer.

/// `phase` is an existing sixteenth-note position. Rotation moves attacks later;
/// rate 0..3 selects sixteenths, eighths, quarters or halves. No state or clock.
pub fn hit(phase:u64,length:u8,hits:u8,rotation:u8,rate:u8)->bool {
    if !(1..=16).contains(&length)||rate>3{return false;}
    let division=1u64<<rate;
    if phase%division!=0{return false;}
    let length=length as u64;let hits=(hits as u64).min(length);
    let offset=(phase/division%length+length-rotation as u64%length)%length;
    hits>0&&(offset*hits)%length<hits
}

/// Distribute accents over hit ordinals, so accents always remain a subset of
/// the rhythm and rotate with it. This uses no extra scheduler or random state.
pub fn accent(phase:u64,length:u8,hits:u8,rotation:u8,rate:u8,accents:u8)->bool {
    if !hit(phase,length,hits,rotation,rate){return false;}
    let hits=hits.min(length);let length=length as u64;
    let offset=((phase>>rate)%length+length-rotation as u64%length)%length;
    hit(offset*hits as u64/length,hits,accents,0,0)
}

#[cfg(test)] mod tests {
    use super::{hit,accent};
    #[test] fn euclidean_accents_are_evenly_spaced_over_hits_and_rotate_with_them() {
        for length in 1..=16u8 {for hits in 0..=16u8 {for accents in 0..=16u8 {for rotation in 0..16u8 {for rate in [0u8,3] {
            let period=(length as u64)<<rate;
            let attacks:Vec<_>=(0..period).filter(|phase|hit(*phase,length,hits,rotation,rate)).collect();
            let accented:Vec<_>=attacks.iter().enumerate().filter(|(_,phase)|accent(**phase,length,hits,rotation,rate,accents)).map(|(index,_)|index).collect();
            assert_eq!(accented.len(),accents.min(hits.min(length)) as usize);
            for phase in 0..period {
                assert!(!accent(phase,length,hits,rotation,rate,accents)||hit(phase,length,hits,rotation,rate));
                assert_eq!(accent(phase,length,hits,rotation,rate,accents),accent((phase+period-((rotation as u64%length as u64)<<rate))%period,length,hits,0,rate,accents));
            }
            for (index,ordinal) in accented.iter().enumerate(){let gap=accented.get(index+1).copied().unwrap_or(accented[0]+attacks.len())-ordinal;assert!(gap==attacks.len()/accented.len()||gap==attacks.len().div_ceil(accented.len()));}
        }}}}}
    }
    #[test] fn euclidean_counts_spacing_rotation_and_rates_are_bounded() {
        for length in 1..=16u8 {for hits in 0..=16u8 {for rotation in 0..16u8 {for rate in 0..4u8 {
            let division=1u64<<rate;let period=length as u64*division;
            let attacks:Vec<u64>=(0..period).filter(|phase|hit(*phase,length,hits,rotation,rate)).collect();
            assert_eq!(attacks.len(),hits.min(length) as usize);
            for phase in 0..period {
                assert_eq!(hit(phase,length,hits,rotation,rate),hit((phase+period-rotation as u64%length as u64*division)%period,length,hits,0,rate));
                assert_eq!(hit(phase,length,hits,rotation,rate),hit(phase+period*103,length,hits,rotation,rate));
            }
            if !attacks.is_empty(){
                let count=attacks.len() as u64;
                for (index,phase) in attacks.iter().enumerate(){
                    let next=attacks.get(index+1).copied().unwrap_or(attacks[0]+period);
                    let gap=(next-phase)/division;
                    assert!(gap==length as u64/count||gap==(length as u64).div_ceil(count));
                }
            }
        }}}}
    }
    #[test] fn euclidean_matches_fill_examples_and_keeps_long_phase() {
        let pattern=|rotation|(0..8).map(|phase|if hit(phase,8,3,rotation,0){'X'}else{'.'}).collect::<String>();
        assert_eq!(pattern(0),"X..X..X.");assert_eq!(pattern(1),".X..X..X");
        assert!(!hit(0,0,3,0,0));assert!(!hit(0,17,3,0,0));assert!(!hit(0,8,3,0,4));
        let phase=u64::MAX-10;
        assert_eq!(hit(phase,7,3,2,3),hit(phase%56,7,3,2,3));
        assert_ne!(hit(64,7,3,0,0),hit(0,7,3,0,0),"four bars cannot restart a seven-step cycle");
    }
}
