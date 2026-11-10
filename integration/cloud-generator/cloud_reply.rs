impl Instance {
    /// All snapshot paths share one serializer. The ABI borrows the result;
    /// owned internal callers copy it only when they actually need ownership.
    fn cloud_snapshot(&mut self, key: &str) -> Option<&str> {
        if key == "cloud_ui_state" {
            self.cloud_watch_until = self.blocks + 1200;
            return Some(&self.cloud_ui);
        }
        if let Some(suffix) = key.strip_prefix("cloud_hold_") {
            let runtime = self.engine.clouds.get(suffix.parse::<usize>().ok()?)?;
            return Some(if runtime.holding() { "1" } else { "0" });
        }
        let state = key == "state";
        let track = if state || key == "cloud_view" { self.cloud_focus }
            else { key.strip_prefix("cloud_view_")?.parse::<usize>().ok()? };
        self.cloud_reply.clear();
        if state {
            self.cloud_watch_until = self.blocks + 1200;
            self.cloud_reply.push_str("{\"cloud_ui_state\":");
            append_remote_json_string(&mut self.cloud_reply, &self.cloud_ui);
            self.cloud_reply.push_str(",\"cloud_view\":\"");
        }
        // The cloud wire grammar contains only ASCII numbers and separators,
        // so its enclosing JSON needs no intermediate escaped String.
        self.engine.append_cloud_view(track, &mut self.cloud_reply)
            .expect("writing a String cannot fail");
        if state { self.cloud_reply.push_str("\"}"); }
        Some(&self.cloud_reply)
    }
}

fn append_remote_json_string(output: &mut String, value: &str) {
    output.push('"');
    for character in value.chars() {
        if matches!(character, '"' | '\\') { output.push('\\'); }
        if !character.is_control() { output.push(character); }
    }
    output.push('"');
}

#[cfg(test)]
fn remote_json_string(value: &str) -> String {
    let mut output = String::new();
    append_remote_json_string(&mut output, value);
    output
}
