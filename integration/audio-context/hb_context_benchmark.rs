#[path = "../tests/support/context_bench.rs"]
mod context_bench;

fn main() {
    for result in context_bench::benchmark(50_000) {
        println!("context-work changing={} iterations={} before_ns={} after_ns={} before_allocations={} after_allocations={}",
            result.changing, result.iterations, result.before_ns, result.after_ns,
            result.before_allocations, result.after_allocations);
        assert_eq!(result.after_allocations, 0);
    }
}
