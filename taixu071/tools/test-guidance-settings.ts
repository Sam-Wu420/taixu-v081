import assert from 'node:assert/strict';
import { GUIDANCE_SETTINGS_KEY,loadGuidanceSettings,saveGuidanceSettings } from '../src/ui/guidanceSettings';
let raw:string|null=null;const store={getItem:()=>raw,setItem:(k:string,v:string)=>{assert.equal(k,GUIDANCE_SETTINGS_KEY);raw=v;}};
assert.deepEqual(loadGuidanceSettings(true,store),{showAll:false,collapsed:false,category:'全部'});
assert.equal(loadGuidanceSettings(false,store).showAll,true);
const value={showAll:true,collapsed:true,category:'妖兽'} as const;saveGuidanceSettings(value,store);assert.deepEqual(loadGuidanceSettings(true,store),value);
raw='not json';assert.equal(loadGuidanceSettings(true,store).showAll,false);raw=JSON.stringify({showAll:'yes',collapsed:null,category:'invalid'});assert.deepEqual(loadGuidanceSettings(true,store),{showAll:false,collapsed:false,category:'全部'});
const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.doesNotThrow(()=>saveGuidanceSettings(value,blocked));assert.equal(loadGuidanceSettings(true,blocked).category,'全部');
console.log('guidance settings: device defaults, roundtrip, invalid and denied storage passed');
