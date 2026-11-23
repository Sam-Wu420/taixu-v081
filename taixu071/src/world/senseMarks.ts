import { LOC_BY_ID, ACTIVE_MAP } from '../data/world';
import { MY_SECT_ID } from '../data/sects';
import type { Enemy } from './combat';
import type { Active, NpcData } from './npc';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export type SenseMarkKind =
  | 'hostile'
  | 'ally'
  | 'quest'
  | 'sect'
  | 'merchant'
  | 'evil'
  | 'beast'
  | 'neutral';

export interface SenseMarkInfo {
  kind: SenseMarkKind;
  elder?: boolean;
  priority: number;
}

export interface SenseMarkContext {
  playerSectIds: Set<string>;
  playerSectNames: Set<string>;
  npcsById?: ReadonlyMap<string, NpcData>;
  bountyIds: Set<string>;
  isBountyRecognized?: (e: Enemy) => boolean;
  day?: number;
  time?: number;
}

const KIND_PRIORITY: Record<SenseMarkKind, number> = {
  hostile: 80,
  quest: 70,
  ally: 60,
  sect: 50,
  evil: 40,
  merchant: 30,
  beast: 20,
  neutral: 10,
};

const ELDER_TITLE_RE = /掌门|宗主|门主|谷主|长老|老祖|执事|护法|殿主/;

export function isSectElderNpc(d: Pick<NpcData, 'role' | 'title'>): boolean {
  return d.role === 'elder' || (!!d.title && ELDER_TITLE_RE.test(d.title));
}

export function resolveMarkContext(game: any): SenseMarkContext {
  const playerSectIds = new Set<string>();
  const playerSectNames = new Set<string>();
  const sectId = game?.ws?.sect?.id;
  if (typeof sectId === 'string' && sectId) {
    playerSectIds.add(sectId);
    const locName = LOC_BY_ID.get(sectId)?.name;
    if (locName) playerSectNames.add(locName);
  }
  const mySect = game?.ws?.mySect;
  if (mySect) {
    playerSectIds.add(MY_SECT_ID);
    if (typeof mySect.name === 'string' && mySect.name) playerSectNames.add(mySect.name);
  }
  const bountyIds = new Set<string>();
  const bounties = game?.ws?.bounties;
  if (Array.isArray(bounties)) {
    const day = game?.day ?? 0;
    for (const b of bounties) {
      if (b && !b.done && b.spawned && b.map === ACTIVE_MAP && (b.until ?? 0) >= day && typeof b.id === 'string') {
        bountyIds.add(b.id);
      }
    }
  }
  const happen = game?.happen;
  return {
    playerSectIds,
    playerSectNames,
    npcsById: game?.npcs?.byId,
    bountyIds,
    isBountyRecognized: happen?.isBountyRecognized ? (e: Enemy) => happen.isBountyRecognized(e) : undefined,
    day: typeof game?.day === 'number' ? game.day : 0,
    time: typeof game?.time === 'number' ? game.time : 0,
  };
}

function isNpcHelpingCtx(d: NpcData, ctx: SenseMarkContext): boolean {
  return (d.helpUntilDay ?? 0) > (ctx.day ?? 0) || (d.helpUntil ?? 0) > (ctx.time ?? 0);
}

export function resolveNpcMarkKind(a: Pick<Active, 'd' | 'act' | 'ally' | 'enemy' | 'life' | 'parley'>, ctx: SenseMarkContext): SenseMarkInfo {
  const d = a.d;
  if (a.enemy?.ally || a.ally) {
    return { kind: 'ally', priority: KIND_PRIORITY.ally };
  }
  if (a.enemy?.aggro || d.chasing || d.hunting || (d.grudge ?? 0) > 0) {
    return { kind: 'hostile', priority: KIND_PRIORITY.hostile };
  }
  if (a.act === 'follow' || !!d.bond || (d.favor ?? 0) >= 30 || isNpcHelpingCtx(d, ctx)) {
    return { kind: 'ally', priority: KIND_PRIORITY.ally };
  }
  const sameSect = !!d.sect && ctx.playerSectIds.has(d.sect);
  if (a.parley || a.act === 'approach' || !!d.beauty) {
    return { kind: 'quest', priority: KIND_PRIORITY.quest };
  }
  if (sameSect) {
    const elder = isSectElderNpc(d);
    return { kind: 'sect', elder, priority: KIND_PRIORITY.sect + (elder ? 3 : 0) };
  }
  if (d.faction === 'demon') {
    return { kind: 'evil', priority: KIND_PRIORITY.evil };
  }
  if (d.faction === 'merchant' || d.role === 'merchant' || a.life?.k === 'stall') {
    return { kind: 'merchant', priority: KIND_PRIORITY.merchant };
  }
  if (d.canon) {
    return { kind: 'quest', priority: KIND_PRIORITY.quest };
  }
  return { kind: 'neutral', priority: KIND_PRIORITY.neutral };
}

export function resolveEnemyMarkKind(e: Enemy, ctx: SenseMarkContext): SenseMarkInfo {
  const npc = e.npcId ? ctx.npcsById?.get(e.npcId) : undefined;
  const recognizedBounty = !!(
    e.tag?.startsWith('bounty:')
    && ctx.bountyIds.has(e.tag.slice(7))
    && (!ctx.isBountyRecognized || ctx.isBountyRecognized(e))
  );
  if (e.ally) {
    return { kind: 'ally', priority: KIND_PRIORITY.ally };
  }
  if (e.aggro || e.pursuer || e.wing || e.hunt || npc?.chasing || npc?.hunting || (npc?.grudge ?? 0) > 0) {
    return { kind: 'hostile', priority: KIND_PRIORITY.hostile };
  }
  if (npc && (!!npc.bond || (npc.favor ?? 0) >= 30 || isNpcHelpingCtx(npc, ctx))) {
    return { kind: 'ally', priority: KIND_PRIORITY.ally };
  }
  const sameSect = !!(
    (npc?.sect && ctx.playerSectIds.has(npc.sect))
    || (e.school && ctx.playerSectIds.has(e.school))
    || (e.sectName && ctx.playerSectNames.has(e.sectName))
  );
  if (recognizedBounty || npc?.beauty || (npc?.canon && npc.faction !== 'demon' && !sameSect)) {
    return { kind: 'quest', priority: KIND_PRIORITY.quest };
  }
  if (sameSect) {
    const elder = !!(npc && isSectElderNpc(npc)) || !!(e as any).warFormLeader;
    return { kind: 'sect', elder, priority: KIND_PRIORITY.sect + (elder ? 3 : 0) };
  }
  if (npc?.faction === 'demon' || (e.def?.evil && !e.def?.hide)) {
    return { kind: 'evil', priority: KIND_PRIORITY.evil };
  }
  if (npc && (npc.faction === 'merchant' || npc.role === 'merchant')) {
    return { kind: 'merchant', priority: KIND_PRIORITY.merchant };
  }
  if (e.def?.kind && e.def.kind !== 'human') {
    return { kind: 'beast', priority: KIND_PRIORITY.beast };
  }
  return { kind: 'neutral', priority: KIND_PRIORITY.neutral };
}

export function farSenseCellKey(sxCss: number, syCss: number, cellPx = 12): number {
  const cx = Math.round(sxCss / cellPx);
  const cy = Math.round(syCss / cellPx);
  return (cx + 8192) * 16384 + (cy + 8192);
}

export function drawSenseMark(
  g: G,
  x: number,
  y: number,
  r: number,
  k: number,
  kind: SenseMarkKind,
  opts?: { elder?: boolean; boss?: boolean; locked?: boolean },
) {
  g.lineWidth = 1.45 * k;
  g.beginPath();
  switch (kind) {
    case 'hostile': {
      g.moveTo(x, y - r);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r, y);
      g.closePath();
      g.fillStyle = '#cf5f56';
      g.fill();
      g.strokeStyle = '#ffe0ca';
      g.stroke();
      break;
    }
    case 'ally': {
      g.arc(x, y, r, 0, TAU);
      g.fillStyle = '#65c9df';
      g.fill();
      g.strokeStyle = '#d8f7ff';
      g.stroke();
      break;
    }
    case 'quest': {
      const outer = r * 1.24;
      const inner = r * 0.44;
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const ang = (i * Math.PI) / 4 - Math.PI / 2;
        const px = x + Math.cos(ang) * rad;
        const py = y + Math.sin(ang) * rad;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = '#ffd27a';
      g.fill();
      g.strokeStyle = '#fff5d6';
      g.stroke();
      break;
    }
    case 'sect': {
      const rad = r * 1.08;
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 - Math.PI / 6;
        const px = x + Math.cos(ang) * rad;
        const py = y + Math.sin(ang) * rad;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = 'rgba(42,104,70,0.78)';
      g.fill();
      g.strokeStyle = '#7ce0a2';
      g.stroke();
      if (opts?.elder) {
        g.beginPath();
        const dr = r * 0.36;
        g.moveTo(x, y - dr);
        g.lineTo(x + dr, y);
        g.lineTo(x, y + dr);
        g.lineTo(x - dr, y);
        g.closePath();
        g.fillStyle = '#ffe9a6';
        g.fill();
      }
      break;
    }
    case 'merchant': {
      const hs = r * 0.86;
      g.rect(x - hs, y - hs, hs * 2, hs * 2);
      g.fillStyle = 'rgba(56,40,16,0.78)';
      g.fill();
      g.strokeStyle = '#e8b85a';
      g.stroke();
      const hole = r * 0.34;
      g.lineWidth = Math.max(k, 1.1 * k);
      g.strokeStyle = '#ffe7a8';
      g.strokeRect(x - hole, y - hole, hole * 2, hole * 2);
      break;
    }
    case 'evil': {
      const rad = r * 1.08;
      g.moveTo(x - rad * 0.92, y - rad * 0.65);
      g.lineTo(x + rad * 0.92, y - rad * 0.65);
      g.lineTo(x, y + rad);
      g.closePath();
      g.fillStyle = 'rgba(130,52,160,0.82)';
      g.fill();
      g.strokeStyle = '#efc8ff';
      g.stroke();
      break;
    }
    case 'beast': {
      const rad = r * 1.08;
      g.moveTo(x, y - rad);
      g.lineTo(x + rad * 0.92, y + rad * 0.7);
      g.lineTo(x - rad * 0.92, y + rad * 0.7);
      g.closePath();
      g.fillStyle = 'rgba(208,136,54,0.82)';
      g.fill();
      g.strokeStyle = '#ffebc2';
      g.stroke();
      break;
    }
    case 'neutral':
    default: {
      g.arc(x, y, r, 0, TAU);
      g.strokeStyle = '#f2e7cd';
      g.stroke();
      break;
    }
  }
  if (opts?.boss) {
    g.strokeStyle = '#d6b67b';
    g.lineWidth = k;
    g.strokeRect(x - 7 * k, y - 7 * k, 14 * k, 14 * k);
  }
  if (opts?.locked) {
    g.beginPath();
    g.arc(x, y, 9 * k, 0, TAU);
    g.strokeStyle = '#ffdc79';
    g.lineWidth = 2 * k;
    g.stroke();
  }
}
