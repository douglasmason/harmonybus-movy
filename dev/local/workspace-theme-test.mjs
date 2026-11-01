import assert from 'node:assert/strict';
import {test} from 'node:test';
import {appearance,defaultAppearance,palette,contrast,wheelPosition} from './workspace-palette.mjs';
test('appearance validates corrupt preferences and keeps wheel gestures bounded',()=>{
 assert.deepEqual(appearance(null),defaultAppearance);
 assert.deepEqual(appearance({hue:Infinity,saturation:-5,brightness:200}),{hue:145,saturation:0,brightness:100});
 assert.deepEqual(wheelPosition(1,0),{hue:0,saturation:100});
 assert.deepEqual(wheelPosition(0,1),{hue:90,saturation:100});
 assert.deepEqual(wheelPosition(0,0),{hue:0,saturation:0});
 assert.equal(wheelPosition(4,4).saturation,100);
});
test('all theme text and focus colors remain readable across hue and brightness extremes',()=>{
 for(let hue=0;hue<360;hue+=15)for(const saturation of [0,50,100])for(let brightness=0;brightness<=100;brightness+=5){
  const colors=palette({hue,saturation,brightness});
  for(const background of ['--ui-bg','--ui-panel','--ui-control','--ui-active'])
   for(const foreground of ['--ui-fg','--ui-muted','--ui-accent','--ui-focus','--ui-error','--ui-success','--ui-warning'])
    assert(contrast(colors[foreground],colors[background])>=4.5,`${hue}/${saturation}/${brightness}: ${foreground} on ${background}`);
 }
});
