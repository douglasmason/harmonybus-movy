//! Desktop transport benchmark; excludes USB, host IPC, synth DSP and device scheduling.
#[path="../integration/launchpad/surface_route.rs"] mod surface_route;
use std::time::Instant;
use std::hint::black_box;
fn main() {
    let mut route=surface_route::SurfaceRoute::new();
    let batches: Vec<String>=(0..10000u64).map(|batch|(0..32u64).map(|index| {
        let serial=batch*32+index+1;
        format!("{serial},2,{},{},{},90,0,-1,0",if index%2==0 {144}else{128},128+(index/2),48+(index/2))
    }).collect::<Vec<_>>().join(";")).collect();
    let mut samples=Vec::with_capacity(batches.len());
    for batch in &batches { let start=Instant::now();black_box(route.batch(black_box(batch)));samples.push(start.elapsed().as_nanos()); }
    samples.sort_unstable();
    println!("surface batch 32 events, 10000 samples: p50={}ns p95={}ns p99={}ns max={}ns",samples[5000],samples[9500],samples[9900],samples[9999]);
}
