import assert from 'node:assert/strict';
import { humanMapLocation, HUMAN_REGIONS, LEGACY_HUMAN_MAP_IDS } from '../src/data/worldHierarchy';
import { dressLook, DEFAULT_WARDROBE } from '../src/gfx/renwu/outfits';
import type { Look } from '../src/gfx/renwu/types';
{
  const location = humanMapLocation('renjie');
  assert.equal(location.worldId, 'human');
  assert.equal(location.regionId, 'renjie');
  assert.equal(location.mapId, 'renjie');
  location.worldId = 'human';
}
assert.deepEqual([...LEGACY_HUMAN_MAP_IDS], ['tiannan', 'luanxing', 'dajin']);
assert.equal(HUMAN_REGIONS.luanxing.name, '乱星海');
const base: Look = { sex:'m', height:1, build:1, skin:'#ffffff', hair:'#111111', hairStyle:'bun', robe:'#222222', inner:'#ffffff', trim:'#333333', belt:'#222222', pants:'#222222', boots:'#222222', robeLen:'long', sleeve:'wide', earring:'#aaaaaa', huadian:'#bbbbbb' };
const decorated = dressLook(base, { ...DEFAULT_WARDROBE.m, earring:'#d6b968', huadian:'#b8323e' });
assert.equal(decorated.earring, '#d6b968');
assert.equal(decorated.huadian, '#b8323e');
const removed = dressLook(base, { ...DEFAULT_WARDROBE.m, earring:'none', huadian:'none' });
assert.equal(removed.earring, undefined);
assert.equal(removed.huadian, undefined);
assert.equal(base.earring, '#aaaaaa');
console.log('foundation: world hierarchy and accessory mapping passed');
