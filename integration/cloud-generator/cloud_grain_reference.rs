//! Frozen hbclean.334 grain renderer for output-equivalence tests.
use seq_core::{cloud::{Point as WidePoint, Activity, TAIL_STEPS}, clip::Note, follower_input::InputKey, generator::Config, TICKS_PER_STEP};
fn legacy_grains_raw(config:Config,step:u16,points:&[Point],field:bool)->Vec<(Note,Point)> {
    if config.end>0&&u32::from(step)*TICKS_PER_STEP>=config.end{return Vec::new();}
    let rates=[8,6,4,3,2,1];
    let fastest=usize::from(config.cloud[0])*rates.len()/128;
    if config.complexity==0{return Vec::new();}
    let center=[Point{step:step as i32,x:64,y:64,pressure:127,activity:Activity::Probability}];
    let sources=if field {points}else{&center};
    if step%rates[fastest]!=0&&!sources.iter().any(|point|point.activity==Activity::Rate&&step%rates[usize::from(point.x)*(fastest+1)/128]==0){return Vec::new();}
    let mut candidates:Vec<_>=sources.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<TAIL_STEPS).collect();
    // Overdubbing merges recent contacts with untouched clip history. Seeded
    // selection must depend on that history, never on the storage/merge order.
    candidates.sort_by_key(|point|(point.step,point.x,point.y,point.pressure,point.activity as u8));
    if candidates.is_empty(){return Vec::new();}
    let mut result=Vec::with_capacity(4);
    for voice in 0..if config.bass(){1}else{4} {
        let random=seq_core::humanize::Humanize::seed(config.seed as usize,voice,(step%256) as u32);
        if random%128>=config.complexity as u32 {continue;}
        let point=candidates[(random as usize/128)%candidates.len()];
        let age=step as i32-point.step;
        if (random>>16)%TAIL_STEPS as u32>=(TAIL_STEPS-age) as u32 {continue;}
        // Each deposit owns its musical interpretation. Switching the surface
        // affects new strokes, never old trails, recorded clips or saved recipes.
        let interval=match point.activity {
            Activity::Probability=>{if (random>>8)%128>32+u32::from(point.x)*3/4 {continue;}rates[fastest]},
            Activity::Rate=>rates[usize::from(point.x)*(fastest+1)/128],
        };
        if step%interval!=0 {continue;}
        let spread=i32::from(config.cloud[3])*14/127;
        let scatter=((random>>20)%29) as i32-14;
        let contour=(i32::from(config.cloud[4])-64)*((step%16) as i32-8)/128;
        let variation=scatter*i32::from(config.cloud[5])/127;
        let degree=((i32::from(point.y)-64)*14/127+(i32::from(config.cloud[2])-64)*21/64+variation*spread/14+contour).clamp(-28,28);
        let pitch=(if config.bass(){36}else{60})+degree.div_euclid(7)*12+[0,2,4,5,7,9,11][degree.rem_euclid(7) as usize];
        let pitch=pitch.clamp(0,127) as u8;
        if result.iter().any(|(note,_):&(Note,Point)|note.pitch==pitch){continue;}
        let velocity=((40+u32::from(config.intensity)*87/127)*u32::from(point.pressure)/127*(TAIL_STEPS-age) as u32/TAIL_STEPS as u32).clamp(1,127) as u8;
        result.push((Note{tick:u32::from(step)*TICKS_PER_STEP,step,gate:3+u32::from(config.cloud[1])*93/127,pitch,vel:velocity,input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false},Point{step:step as i32,x:point.x,y:(i32::from(point.y)+variation*spread/2+contour*8).clamp(0,127) as u8,pressure:velocity,activity:point.activity}));
    }
    result
}

#[derive(Clone,Copy)]
struct Point {step:i32,x:u8,y:u8,pressure:u8,activity:Activity}
/// Adapt storage units only; the frozen legacy renderer above stays unchanged.
pub fn legacy_grains(config:Config,step:u16,points:&[WidePoint],field:bool)->Vec<(Note,WidePoint)> {
    let legacy:Vec<_>=points.iter().map(|point|Point{step:point.step,x:(point.x/129) as u8,y:(point.y/129) as u8,pressure:point.pressure,activity:point.activity}).collect();
    legacy_grains_raw(config,step,&legacy,field).into_iter().map(|(note,point)|(note,WidePoint::legacy(point.step,point.x,point.y,point.pressure,point.activity))).collect()
}
