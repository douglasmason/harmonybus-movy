//! Field sources use HB's existing stock-host callbacks. The stock oscillator
//! is disabled while its UI slot is backed by Field; its other settings survive.
use crate::chain_host::ChainInstance;
use std::ffi::{CStr};
impl ChainInstance {
    pub fn set_param(&mut self,key:&str,value:&str){
        let Some((bank,sub))=field_key(key) else {
            self.set_param_raw(key,value);
            if key=="midi_fx1:state" {
                for bank in 1..=2 {
                    let shape=self.get_param_raw(&format!("midi_fx1:field_lfo{}:shape",bank)).and_then(|v|v.parse::<i32>().ok()).unwrap_or(0);
                    if shape>=6 {self.set_param_raw(&format!("lfo{}:enabled",bank),"0");}
                }
            }
            return;
        };
        let hb= format!("midi_fx1:field_lfo{}:",bank);
        let shape=self.get_param_raw(&(hb.clone()+"shape")).and_then(|s|s.parse::<i32>().ok()).unwrap_or(0);
        if sub=="shape" {
            let next=value.parse::<i32>().unwrap_or(0);
            if (6..22).contains(&next) {
                if self.get_param_raw("midi_fx1:field_mod_version").as_deref()!=Some("1"){return;}
                if shape<6 {
                    for prop in ["target","target_param","depth","polarity","enabled"]{
                        let old=self.get_param_raw(&format!("lfo{}:{}",bank,prop)).unwrap_or_default();
                        self.set_param_raw(&(hb.clone()+prop),&old);
                    }
                }
                self.set_param_raw(&format!("lfo{}:enabled",bank),"0");
                self.set_param_raw(&(hb+"shape"),value);return;
            } else if shape>=6 {
                self.set_param_raw(&(hb.clone()+"shape"),"0");
                for prop in ["target","target_param","depth","polarity","enabled"]{
                    let old=self.get_param_raw(&(hb.clone()+prop)).unwrap_or_default();
                    self.set_param_raw(&format!("lfo{}:{}",bank,prop),&old);
                }
            }
        }else if shape>=6&&matches!(sub,"enabled"|"target"|"target_param"|"depth"|"polarity"){
            self.set_param_raw(&(hb+sub),value);return;
        }
        self.set_param_raw(key,value);
    }
    pub fn get_param(&mut self,key:&str)->Option<String>{
        if let Some((bank,sub))=field_key(key){
            if sub=="field_source_version"{return self.get_param_raw("midi_fx1:field_mod_version");}
            let hb=format!("midi_fx1:field_lfo{}:",bank);
            let shape=self.get_param_raw(&(hb.clone()+"shape")).and_then(|s|s.parse::<i32>().ok()).unwrap_or(0);
            if shape>=6&&matches!(sub,"shape"|"enabled"|"target"|"target_param"|"depth"|"polarity"|"active"|"status"){
                return self.get_param_raw(&(hb+sub));
            }
        }
        self.get_param_raw(key)
    }
    /// Fixed-size, allocation-free heartbeat. Reading the bypass flag is needed
    /// because a stock chain does not notify a bypassed MIDI FX of that change.
    pub fn hb_field_block(&mut self,message:&CStr){
        let key=CStr::from_bytes_with_nul(b"midi_fx1:bypassed\0").unwrap();
        let mut bypass=[0u8;4];
        let n=self.hb_get_small(key,&mut bypass);
        let mut bytes=[0u8;128];let input=message.to_bytes();
        if input.len()+3>bytes.len(){return;}
        bytes[..input.len()].copy_from_slice(input);
        bytes[input.len()]=b',';bytes[input.len()+1]=if n>0&&bypass[0]==b'1'{b'1'}else{b'0'};
        let value=CStr::from_bytes_with_nul(&bytes[..input.len()+3]).unwrap();
        self.hb_set_param(CStr::from_bytes_with_nul(b"midi_fx1:hb_movy_block\0").unwrap(),value);
    }
}
fn field_key(key:&str)->Option<(u8,&str)>{
    if let Some(sub)=key.strip_prefix("lfo1:"){Some((1,sub))}
    else {key.strip_prefix("lfo2:").map(|sub|(2,sub))}
}
