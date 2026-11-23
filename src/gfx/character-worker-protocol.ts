import type { CharState, CharacterPhysics, Look, Pose } from './character';

export type CharacterPaintState = Pick<CharState,
  'x' | 'y' | 'yaw' | 'action' | 'actionT' | 'phase' | 'speed' | 'vx' | 'vy' | 'lift' |
  't' | 'seed' | 'windX' | 'windY' | 'castN' | 'hands'>;

export interface CharacterPaintRequest {
  state: CharacterPaintState;
  physics: CharacterPhysics;
  look: Look;
  pose: Pose;
  scale: number;
  res: number;
  dt: number;
  physicsDt: number;
}

export interface CharacterPaintReply {
  image: ImageBitmap;
  physics: CharacterPhysics;
}

export interface CharacterPaintBatchRequest { requests: CharacterPaintRequest[] }
export interface CharacterPaintBatchReply { results: CharacterPaintReply[] }
