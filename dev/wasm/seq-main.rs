use std::io::{self, BufRead};
fn main() {
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        if let Some(frames) = line.strip_prefix("@") { assert_eq!(hb_browser_seq::advance(frames.parse().unwrap()), 0); }
        else { hb_browser_seq::apply_text(&line); }
        let events: Vec<u32> = (0..hb_browser_seq::event_count()).map(|index| hb_browser_seq::event(index)).filter(|event| *event != 0).collect();
        println!("{:?}", events);
    }
}
