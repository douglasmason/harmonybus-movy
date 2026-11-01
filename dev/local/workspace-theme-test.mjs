import assert from 'node:assert/strict';
import {test} from 'node:test';
import {appearance,defaultAppearance,palette,contrast,wheelPosition} from './workspace-palette.mjs';
test('appearance validates corrupt preferences and keeps wheel gestures bounded',()=>{
 assert.deepEqual(appearance(null),defaultAppearance);
 assert.deepEqual(appearance({hue:Infinity,saturation:-5,brightness:200}),{hue:0,saturation:0,brightness:100,neutral:false});
 assert.deepEqual(wheelPosition(1,0),{hue:0,saturation:100});
 assert.deepEqual(wheelPosition(0,1),{hue:90,saturation:100});
 assert.deepEqual(wheelPosition(0,0),{hue:0,saturation:0});
 assert.equal(wheelPosition(4,4).saturation,100);
});
test('all theme text and focus colors remain readable across hue and brightness extremes',()=>{
 for(const neutral of [true,false])for(let hue=0;hue<360;hue+=15)for(const saturation of [0,50,100])for(let brightness=0;brightness<=100;brightness+=5){
  const colors=palette({hue,saturation,brightness,neutral});
  for(const background of ['--ui-bg','--ui-panel','--ui-control','--ui-active'])
   for(const foreground of ['--ui-fg','--ui-muted','--ui-accent','--ui-focus','--ui-error','--ui-success','--ui-warning'])
    assert(contrast(colors[foreground],colors[background])>=4.5,`${hue}/${saturation}/${brightness}: ${foreground} on ${background}`);
 }
});

test('default is red on neutral black/grey, while saved tinted preferences are preserved',()=>{
 const colors=palette(defaultAppearance);assert.equal(colors['--ui-bg'],'#000000');
 for(const key of ['--ui-panel','--ui-control','--ui-active','--ui-muted','--ui-border']){
  const [r,g,b]=colors[key].slice(1).match(/../g);assert.equal(r,g,key);assert.equal(g,b,key);
 }
 const [r,g,b]=colors['--ui-accent'].slice(1).match(/../g).map(x=>parseInt(x,16));assert(r>g&&g===b);
 assert.equal(appearance({hue:145,saturation:55,brightness:12}).neutral,false);
 assert.equal(appearance(null).neutral,true);
});
