/**
 * Drop-in Isometric Graphics, Earth Biome, Martial Arts, Waterbending, Swimming & 2.5D Physics Engine
 * for https://github.com/Tosin5S/pt
 * ----------------------------------------------------------------------------------------------------
 * File target in your repo: src/isometric_upgrade.js
 *
 * New in this version — Dedicated Swimming & High-End Waterbending Animations:
 * 1. Pre-Baked `swim` & `water_surf` States in `VillagerSpriteBank`:
 *    - `swim` (6 frames): Horizontal freestyle front-crawl posture with rotating shoulders,
 *      alternating overhead arm-entry strokes, rhythmic flutter kicks, and aqua waterline
 *      submersion shading so swimmers look genuinely immersed in the river.
 *    - `water_surf` (6 frames): Low-stance Waterbender hydro-surfing posture balanced atop
 *      a cresting turquoise wave with curling white sea-foam spray.
 *    - Also supports treading water (gentle vertical bobbing + waist ripples when idle in water).
 * 2. Live Swimming & Waterbending VFX:
 *    - Swimming V-wake & stroke-synced hand splash droplets behind moving swimmers.
 *    - Tai-Chi Figure-8 Water Ribbon: Multi-layered sinuous Bézier stream (deep cerulean +
 *      bright cyan core + white foam highlights) that lashes outward into a crashing tidal
 *      whip when attacking or casting (`swingAnim > 0` / `fight`).
 *    - Waterbending Hydro-Shield (`blockAnim > 0`) & Cryo-Prison faceted ice spears (`subElement`).
 * 3. Preserves all 8-state Martial Arts Choreography (kicks, dodging, blocking), 2.5D Physics
 *    (`u.z`, `u.vz`, mass collisions, river currents, cliff ledges), Earth 71%/29% Biomes +
 *    24% 3D Mountains, Path2D Footpaths, 2.5D Bridges, War Galleys, and Siege Engines.
 */

import {
  WORLD_W,
  WORLD_H,
  RIVER_Y,
  CONTINENTS,
  EARTH_SURFACE_STATS,
  getEarthTerrainAt,
  wrapX,
  wrapDX,
} from './constants.js';

function shadeHex(hex, amount) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '#2e6fd9';
  const clean = hex.replace('#', '');
  const num = parseInt(
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean,
    16
  );
  if (Number.isNaN(num)) return hex;
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

function hash2D(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/* ============================================================================
 * 1. VILLAGER, SWIMMER, WATERBENDER & MARTIAL ARTIST SPRITE BANK
 * ========================================================================== */

const UNIT_STATES = {
  idle: { frames: 4, fps: 4 },
  walk: { frames: 8, fps: 12 },
  chop: { frames: 6, fps: 10 },
  build: { frames: 6, fps: 11 },
  attack: { frames: 6, fps: 13 },
  dodge: { frames: 4, fps: 14 },
  block: { frames: 4, fps: 10 },
  bend_cast: { frames: 6, fps: 11 },
  swim: { frames: 6, fps: 10 },       // Freestyle front-crawl swimming + flutter kick
  water_surf: { frames: 6, fps: 12 }, // Waterbender hydro-wave surfing stance
  earth_stomp: { frames: 6, fps: 11 }, // Hung-Gar Stomp -> Boulder Lift -> Palm Thrust
  air_levitate: { frames: 6, fps: 9 },
  air_flight: { frames: 6, fps: 12 },
  fire_kata: { frames: 6, fps: 12 },
  fire_jet: { frames: 6, fps: 13 },
};

const DIRECTIONS = ['SE', 'SW', 'NE', 'NW'];

function isUnitInWater(unit) {
  return Boolean(unit._inRiverWater || unit.inWater || unit.waterBendingSurf);
}

function mapUnitStateToAnim(unit) {
  if ((unit.dodgeAnim || 0) > 0.04) return 'dodge';
  if ((unit.blockAnim || 0) > 0.04) return 'block';

  const inWater = isUnitInWater(unit);
  if (inWater && !unit.skySoar && (unit.z || 0) < 6) {
    if (unit.bender === 'water' || unit.waterBendingSurf) return 'water_surf';
    return 'swim';
  }

  if (unit.bender === 'earth' && ((unit.swingAnim || 0) > 0.05 || unit.state === 'attack' || unit.state === 'fight')) {
    return 'earth_stomp';
  }
  if (unit.bender === 'air' || (unit.skySoar && !unit.mountType)) {
    const spd = Math.hypot(unit.vx || 0, unit.vy || 0);
return spd > 8 || (unit.swingAnim || 0) > 0.05 || unit.state === 'attack' || unit.state === 'fight' || unit.state === 'move'
  ? 'air_flight'
  : 'air_levitate';
  }
  if (unit.bender === 'fire') {
    const spd = Math.hypot(unit.vx || 0, unit.vy || 0);
    if ((unit.swingAnim || 0) > 0.05 || (unit.kataTimer || 0) > 0 || unit.state === 'attack' || unit.state === 'fight') {
      return 'fire_kata';
    }
    if (spd > 8 && (unit.subElement || unit.skySoar)) {
      return 'fire_jet';
    }
  }
  
  if (unit.bender && ((unit.swingAnim || 0) > 0.05 || unit.state === 'attack' || unit.state === 'fight')) {
    return ((Math.floor((unit.animTime || 0) * 1.8) + (unit.id || 0)) % 2 === 0) ? 'bend_cast' : 'attack';
  }
  if ((unit.swingAnim || 0) > 0.05) return 'attack';

  switch (unit.state) {
    case 'chop':
    case 'gather':
    case 'mine':
      return 'chop';
    case 'build':
      return 'build';
    case 'attack':
    case 'fight':
      return 'attack';
    case 'move':
    case 'flee':
    case 'wander':
      return 'walk';
    default:
      return Math.hypot(unit.vx || 0, unit.vy || 0) > 2 ? 'walk' : 'idle';
  }
}

function drawLimb(ctx, x1, y1, x2, y2, width, baseColor, highlightColor) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.strokeStyle = highlightColor;
  ctx.beginPath();
  ctx.moveTo(x1 - 0.5, y1 - 0.5);
  ctx.lineTo(x2 - 0.5, y2 - 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawArticulatedLimb(ctx, x1, y1, jx, jy, x2, y2, width, baseColor, highlightColor) {
  drawLimb(ctx, x1, y1, jx, jy, width, baseColor, highlightColor);
  drawLimb(ctx, jx, jy, x2, y2, width * 0.9, baseColor, highlightColor);
}

function drawTool(ctx, tool, handX, handY, angle, facingRight) {
  if (!tool) return;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(angle);

  if (tool === 'axe') {
    ctx.strokeStyle = '#6d4c2f';
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -14);
    ctx.stroke();

    const dir = facingRight ? 1 : -1;
    ctx.fillStyle = '#aeb9c4';
    ctx.strokeStyle = '#4a5562';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(7 * dir, -15, 7 * dir, -9);
    ctx.quadraticCurveTo(4 * dir, -8, 0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (tool === 'hammer') {
    ctx.strokeStyle = '#6d4c2f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -12);
    ctx.stroke();

    ctx.fillStyle = '#7f8c98';
    ctx.strokeStyle = '#3c4650';
    ctx.lineWidth = 1;
    ctx.fillRect(-4.5, -15, 9, 4.5);
    ctx.strokeRect(-4.5, -15, 9, 4.5);
  } else if (tool === 'sword') {
    ctx.strokeStyle = '#c89b3c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3.5, -2);
    ctx.lineTo(3.5, -2);
    ctx.stroke();

    ctx.fillStyle = '#dce5ee';
    ctx.strokeStyle = '#5d6b78';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-1.8, -2);
    ctx.lineTo(0, -18);
    ctx.lineTo(1.8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders a dedicated 6-frame horizontal freestyle front-crawl swimming frame
 * with rotating arms, flutter-kick legs, and translucent waterline immersion.
 */
function renderSwimFrame(ctx, cx, groundY, opts) {
  const { frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount;
  const tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE';
  const facingBack = dir === 'NE' || dir === 'NW';
  const s = facingRight ? 1 : -1;

  const strokePhase = t * tau;
  const bob = Math.sin(strokePhase) * 1.4;
  const waterY = groundY - 4;
  const shoulderX = cx + 6 * s;
  const shoulderY = waterY - 4 + bob;
  const hipX = cx - 7 * s;
  const hipY = waterY - 1 - bob * 0.5;

  // 1. Waterline meniscus ellipse
  ctx.save();
  ctx.fillStyle = 'rgba(14, 116, 144, 0.36)';
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, waterY, 16, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 2. Flutter-kicking legs trailing behind in the water
  const kick1 = Math.sin(strokePhase * 2) * 3.5;
  const kick2 = -kick1;
  drawLimb(ctx, hipX, hipY, hipX - 10 * s, hipY + kick1, 3.6, '#274659', '#3b647d');
  drawLimb(ctx, hipX, hipY + 1, hipX - 11 * s, hipY + kick2, 3.6, '#213a4a', '#355a70');

  // 3. Back arm executing underwater pull / overhead recovery
  const backArmA = strokePhase + Math.PI;
  const backHandX = shoulderX + Math.cos(backArmA) * 9.5 * s;
  const backHandY = shoulderY + Math.sin(backArmA) * 6.5;
  drawLimb(ctx, shoulderX, shoulderY, backHandX, backHandY, 3.4, palette.tunicDark, palette.tunic);

  // 4. Horizontal pitched torso
  ctx.save();
  ctx.fillStyle = palette.tunic;
  ctx.strokeStyle = '#1e1b18';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.ellipse((shoulderX + hipX) * 0.5, (shoulderY + hipY) * 0.5, 9.5, 4.8, facingRight ? -0.18 : 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 5. Head lifted above the waterline
  const headX = shoulderX + 5.5 * s;
  const headY = shoulderY - 3.5;
  ctx.save();
  ctx.fillStyle = '#e4b796';
  ctx.strokeStyle = '#2b1e16';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(headX, headY, 4.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  ctx.arc(headX - 0.5 * s, headY - 1.0, 4.9, Math.PI * 0.9, Math.PI * 2.1);
  ctx.closePath();
  ctx.fill();

  if (!facingBack) {
    ctx.fillStyle = '#1f1916';
    ctx.fillRect(headX + 1.5 * s, headY - 0.5, 1.2, 1.2);
  }
  ctx.restore();

  // 6. Front arm executing circular freestyle crawl stroke
  const frontHandX = shoulderX + Math.cos(strokePhase) * 10.5 * s;
  const frontHandY = shoulderY + Math.sin(strokePhase) * 7.2;
  drawLimb(ctx, shoulderX, shoulderY, frontHandX, frontHandY, 3.6, palette.tunic, palette.tunicLight);
  ctx.fillStyle = '#e4b796';
  ctx.beginPath();
  ctx.arc(frontHandX, frontHandY, 1.9, 0, Math.PI * 2);
  ctx.fill();

  // Splash foam where hand enters the water
  if (Math.sin(strokePhase) > 0.3) {
    ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
    ctx.beginPath();
    ctx.arc(frontHandX + 2 * s, waterY - 1, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Renders a dedicated 6-frame Waterbender hydro-wave surfing stance
 * balanced on a cresting turquoise wave with sea-foam spray.
 */
function renderWaterSurfFrame(ctx, cx, groundY, opts) {
  const { frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount;
  const tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE';
  const facingBack = dir === 'NE' || dir === 'NW';
  const s = facingRight ? 1 : -1;
  const waveBob = Math.sin(t * tau) * 2.2;

  // 1. Cresting Turquoise Hydro-Wave underneath feet
  ctx.save();
  const waveY = groundY - 3 + waveBob * 0.4;
  const waveGrad = ctx.createLinearGradient(cx - 18, waveY - 10, cx + 18, waveY + 4);
  waveGrad.addColorStop(0, '#0284c7');
  waveGrad.addColorStop(0.5, '#38bdf8');
  waveGrad.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = waveGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 17 * s, waveY + 4);
  ctx.quadraticCurveTo(cx - 4 * s, waveY - 10, cx + 16 * s, waveY - 6);
  ctx.quadraticCurveTo(cx + 12 * s, waveY + 2, cx + 18 * s, waveY + 4);
  ctx.closePath();
  ctx.fill();

  // White curling sea-foam crest
  ctx.strokeStyle = 'rgba(240, 249, 255, 0.9)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(cx - 12 * s, waveY + 1);
  ctx.quadraticCurveTo(cx + 2 * s, waveY - 8, cx + 15 * s, waveY - 5);
  ctx.stroke();
  ctx.restore();

  // 2. Low-stance balanced surfer pose
  const hipY = groundY - 13 + waveBob;
  const shoulderY = hipY - 10;
  const headY = shoulderY - 6;

  drawArticulatedLimb(ctx, cx - 2 * s, hipY, cx - 5 * s, hipY + 4, cx - 7 * s, groundY - 5 + waveBob, 3.8, '#3b2f26', '#5c4a3c');
  drawArticulatedLimb(ctx, cx + 2 * s, hipY, cx + 6 * s, hipY + 3, cx + 7 * s, groundY - 6 + waveBob, 3.8, '#4a3b30', '#6d5848');

  // Arms outstretched for hydro-balance
  drawLimb(ctx, cx - 4 * s, shoulderY + 2, cx - 13 * s, shoulderY - 1, 3.4, palette.tunicDark, palette.tunic);

  ctx.save();
  ctx.fillStyle = palette.tunic;
  ctx.strokeStyle = '#1e1b18';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(cx - 5, shoulderY);
  ctx.lineTo(cx + 5, shoulderY);
  ctx.lineTo(cx + 6.2, hipY + 2);
  ctx.lineTo(cx - 6.2, hipY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#e4b796';
  ctx.strokeStyle = '#2b1e16';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(cx + 1 * s, headY, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  ctx.arc(cx + 0.5 * s, headY - 1, 5.3, Math.PI * 0.9, Math.PI * 2.1);
  ctx.closePath();
  ctx.fill();
  if (!facingBack) {
    ctx.fillStyle = '#1f1916';
    ctx.fillRect(cx + 2 * s, headY - 0.5, 1.3, 1.3);
  }
  ctx.restore();

  drawLimb(ctx, cx + 4 * s, shoulderY + 2, cx + 13 * s, shoulderY - 2, 3.6, palette.tunic, palette.tunicLight);
}

function renderEarthStompFrame(ctx, cx, groundY, opts) {
  const { frameIndex, dir, palette } = opts;
  const facingRight = dir === 'SE' || dir === 'NE';
  const facingBack = dir === 'NE' || dir === 'NW';
  const s = facingRight ? 1 : -1;

  const isChamber = frameIndex <= 1;
  const isStompImpact = frameIndex === 2;
  const isPalmThrust = frameIndex >= 3;

  const bobY = isChamber ? -1.5 : isStompImpact ? 3.4 : 2.6;
  const leanX = isPalmThrust ? 3.4 * s : isStompImpact ? 0.8 * s : -1.5 * s;

  const hipY = groundY - 9 + bobY;
  const shoulderY = hipY - 11;
  const headY = shoulderY - 6.5;

  if (frameIndex >= 2) {
    ctx.save();
    const ringScale = (frameIndex - 1) / 4;
    ctx.strokeStyle = `rgba(163, 230, 53, ${(0.85 - ringScale * 0.5).toFixed(3)})`;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(cx + 4 * s, groundY, 10 + ringScale * 12, 4.5 + ringScale * 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(10, 14, 18, 0.36)';
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, groundY, 11.5, 5.0, 0, 0, Math.PI * 2);
  ctx.fill();

  const leftKneeX = cx - 5.5 * s;
  const leftKneeY = groundY - 5.5;
  const leftFootX = cx - 6.2 * s;
  const leftFootY = groundY - 1.2;

  let rightKneeX = cx + 6.0 * s;
  let rightKneeY = groundY - 5.5;
  let rightFootX = cx + 6.8 * s;
  let rightFootY = groundY - 1.0;

  if (isChamber) {
    rightKneeX = cx + 6.5 * s;
    rightKneeY = groundY - 15.5;
    rightFootX = cx + 5.8 * s;
    rightFootY = groundY - 9.5;
  }

  drawArticulatedLimb(ctx, cx - 2.6 * s, hipY, leftKneeX, leftKneeY, leftFootX, leftFootY, 4.2, '#3b2f26', '#5c4a3c');
  drawArticulatedLimb(ctx, cx + 2.6 * s, hipY, rightKneeX, rightKneeY, rightFootX, rightFootY, 4.2, '#4a3b30', '#6d5848');

  const backShoulderX = cx - 4 * s + leanX * 0.6;
  const backHandX = isPalmThrust ? cx + 11 * s : isStompImpact ? cx - 9 * s : cx - 2 * s;
  const backHandY = isPalmThrust ? shoulderY + 1 : isStompImpact ? shoulderY + 8 : shoulderY - 5;
  drawLimb(ctx, backShoulderX, shoulderY + 2, backHandX, backHandY, 3.8, palette.tunicDark, palette.tunic);

  ctx.save();
  const torsoGrad = ctx.createLinearGradient(cx - 8, shoulderY, cx + 8, hipY + 3);
  torsoGrad.addColorStop(0, palette.tunicLight);
  torsoGrad.addColorStop(0.55, palette.tunic);
  torsoGrad.addColorStop(1, palette.tunicDark);
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = '#1e1b18';
  ctx.lineWidth = 1.1;

  ctx.beginPath();
  ctx.moveTo(cx - 5.8 + leanX * 0.8, shoulderY);
  ctx.lineTo(cx + 5.8 + leanX * 0.8, shoulderY);
  ctx.lineTo(cx + 7.2 + leanX * 0.2, hipY + 2);
  ctx.quadraticCurveTo(cx + leanX * 0.2, hipY + 4.5, cx - 7.2 + leanX * 0.2, hipY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#365314';
  ctx.fillRect(cx - 6.5 + leanX * 0.35, hipY - 2.4, 13.0, 2.6);
  ctx.fillStyle = '#a3e635';
  ctx.fillRect(cx + 1.5 * s + leanX * 0.35, hipY - 2.4, 2.5, 2.6);
  ctx.restore();

  ctx.save();
  const headX = cx + leanX;
  const skinGrad = ctx.createRadialGradient(headX - 1.8, headY - 2, 1, headX, headY, 6.2);
  skinGrad.addColorStop(0, '#f3cfb3');
  skinGrad.addColorStop(0.7, '#d9a784');
  skinGrad.addColorStop(1, '#a97454');

  ctx.fillStyle = skinGrad;
  ctx.strokeStyle = '#2b1e16';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(headX, headY, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  if (facingBack) {
    ctx.arc(headX, headY - 0.5, 5.7, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(headX + 4.5, headY + 3.5);
    ctx.lineTo(headX - 4.5, headY + 3.5);
  } else {
    ctx.arc(headX - 0.4 * s, headY - 1.2, 5.5, Math.PI * 0.95, Math.PI * 2.05);
  }
  ctx.closePath();
  ctx.fill();

  if (!facingBack) {
    ctx.fillStyle = '#1f1916';
    ctx.fillRect(headX + 1.2 * s, headY - 0.4, 1.3, 1.4);
    ctx.fillRect(headX + 3.4 * s, headY - 0.4, 1.2, 1.3);
  }
  ctx.restore();

  const frontShoulderX = cx + 4.2 * s + leanX * 0.7;
  const frontHandX = isPalmThrust ? cx + 14.5 * s : isStompImpact ? cx + 9.5 * s : cx + 3.5 * s;
  const frontHandY = isPalmThrust ? shoulderY + 1 : isStompImpact ? shoulderY + 9 : shoulderY - 6;

  drawLimb(ctx, frontShoulderX, shoulderY + 2, frontHandX, frontHandY, 4.0, palette.tunic, palette.tunicLight);

  ctx.fillStyle = '#78716c';
  ctx.strokeStyle = '#a3e635';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(frontHandX, frontHandY, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
function renderAirLevitateFrame(ctx, cx, groundY, opts) {
  const { frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount, tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE', facingBack = dir === 'NE' || dir === 'NW', s = facingRight ? 1 : -1;
  const bob = Math.sin(t * tau) * 2.4;
  ctx.save();
  for (let r = 0; r < 3; r++) {
    const ry = groundY - 3 - r * 3.2 + bob * 0.4, rx = 7 + r * 3.5 + Math.sin(t * tau + r) * 1.2;
    ctx.strokeStyle = r === 2 ? 'rgba(186, 230, 253, 0.85)' : 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(cx, ry, rx, rx * 0.38, 0, 0, tau); ctx.stroke();
  }
  ctx.restore();
  const hipY = groundY - 12 + bob, shoulderY = hipY - 10.5, headY = shoulderY - 6.2;
  drawArticulatedLimb(ctx, cx - 2.5 * s, hipY, cx - 7.5 * s, hipY + 2.5, cx + 1.5 * s, hipY + 3.2, 3.8, '#3b2f26', '#5c4a3c');
  drawArticulatedLimb(ctx, cx + 2.5 * s, hipY, cx + 7.5 * s, hipY + 2.5, cx - 1.5 * s, hipY + 3.2, 3.8, '#4a3b30', '#6d5848');
  ctx.save();
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(cx - 5 * s, shoulderY + 1);
  ctx.quadraticCurveTo(cx - 13 * s, shoulderY - 3 + Math.sin(t * tau) * 3, cx - 16 * s, shoulderY + 4); ctx.stroke();
  ctx.fillStyle = palette.tunic; ctx.strokeStyle = '#1e1b18'; ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(cx - 5.4, shoulderY); ctx.lineTo(cx + 5.4, shoulderY); ctx.lineTo(cx + 6.4, hipY + 2); ctx.lineTo(cx - 6.4, hipY + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e4b796'; ctx.beginPath(); ctx.arc(cx, headY, 5.3, 0, tau); ctx.fill(); ctx.stroke();
  if (!facingBack) {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.moveTo(cx + 0.8 * s, headY - 4.2); ctx.lineTo(cx + 2.6 * s, headY - 1.5); ctx.lineTo(cx - 0.8 * s, headY - 1.5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  drawLimb(ctx, cx - 4.5 * s, shoulderY + 2, cx + 2.5 * s, shoulderY + 6.5, 3.5, palette.tunicDark, '#fbbf24');
  drawLimb(ctx, cx + 4.5 * s, shoulderY + 2, cx + 4.5 * s, shoulderY + 6.5, 3.5, palette.tunic, '#fde047');
  ctx.save(); ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)'; ctx.fillStyle = 'rgba(224, 242, 254, 0.65)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(cx + 3.8 * s, shoulderY + 5.2, 3.2, 0, tau); ctx.fill(); ctx.stroke(); ctx.restore();
}
function renderAirFlightFrame(ctx, cx, groundY, opts) {
  const { frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount, tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE', facingBack = dir === 'NE' || dir === 'NW', s = facingRight ? 1 : -1;
  const bankWave = Math.sin(t * tau) * 2.0, leanX = 4.2 * s, scooterY = groundY - 6 + bankWave * 0.5;
  ctx.save();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; ctx.strokeStyle = 'rgba(224, 242, 254, 0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(cx, scooterY, 8.5, 0, tau); ctx.fill(); ctx.stroke();
  ctx.restore();
  const hipY = groundY - 11 + bankWave, shoulderY = hipY - 10.5, headY = shoulderY - 6.0;
  drawArticulatedLimb(ctx, cx - 2 * s, hipY, cx - 7 * s, hipY + 3, cx - 12 * s, groundY - 4 + bankWave, 3.8, '#3b2f26', '#5c4a3c');
  drawArticulatedLimb(ctx, cx + 2 * s, hipY, cx + 4 * s, hipY + 2, cx + 1 * s, groundY - 5 + bankWave, 3.8, '#4a3b30', '#6d5848');
  drawLimb(ctx, cx - 3.5 * s + leanX * 0.6, shoulderY + 2, cx - 12 * s, shoulderY + 5, 3.5, palette.tunicDark, '#fbbf24');
  ctx.save();
  ctx.fillStyle = palette.tunic; ctx.strokeStyle = '#1e1b18'; ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(cx - 5 + leanX * 0.8, shoulderY); ctx.lineTo(cx + 5.5 + leanX * 0.8, shoulderY); ctx.lineTo(cx + 5.8 + leanX * 0.2, hipY + 2); ctx.lineTo(cx - 5.8 + leanX * 0.2, hipY + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  const headX = cx + leanX;
  ctx.fillStyle = '#e4b796'; ctx.beginPath(); ctx.arc(headX, headY, 5.2, 0, tau); ctx.fill(); ctx.stroke();
  if (!facingBack) {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.moveTo(headX + 1.0 * s, headY - 4.2); ctx.lineTo(headX + 2.8 * s, headY - 1.4); ctx.lineTo(headX - 0.6 * s, headY - 1.4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const frontHandX = cx + 13.5 * s, frontHandY = shoulderY + 1 + bankWave * 0.4;
  drawLimb(ctx, cx + 4 * s + leanX * 0.7, shoulderY + 2, frontHandX, frontHandY, 3.6, palette.tunic, '#fde047');
}
function renderFireKataFrame(ctx, cx, groundY, opts) {
  const { frameIndex, dir } = opts;
  const facingRight = dir === 'SE' || dir === 'NE', facingBack = dir === 'NE' || dir === 'NW', s = facingRight ? 1 : -1;
  const isBlazeKick = frameIndex === 2 || frameIndex === 3, isLightningPoint = frameIndex >= 4;
  const bobY = isBlazeKick ? -4.5 : isLightningPoint ? 2.2 : 1.8, leanX = (isBlazeKick ? -2.4 : isLightningPoint ? 2.8 : 3.6) * s;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.36)'; ctx.beginPath(); ctx.ellipse(cx + 1.5, groundY, 11.5, 4.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isLightningPoint ? 'rgba(56, 189, 248, 0.85)' : 'rgba(249, 115, 22, 0.82)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.ellipse(cx + 2 * s, groundY, 12.5, 5.2, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  const hipY = groundY - 9 + bobY, shoulderY = hipY - 11, headY = shoulderY - 6.5;
  const rightKneeX = isBlazeKick ? cx + 7.2 * s : cx + 5.8 * s, rightKneeY = isBlazeKick ? groundY - 15.5 : groundY - 5.5;
  const rightFootX = isBlazeKick ? cx + 14.5 * s : cx + 7.2 * s, rightFootY = isBlazeKick ? groundY - 19.5 : groundY - 1.0;
  drawArticulatedLimb(ctx, cx - 2.6 * s, hipY, cx - 4.8 * s, groundY - 5.5, cx - 5.8 * s, groundY - 1.2, 4.0, '#450a0a', '#7f1d1d');
  drawArticulatedLimb(ctx, cx + 2.6 * s, hipY, rightKneeX, rightKneeY, rightFootX, rightFootY, 4.0, '#7f1d1d', '#b91c1c');
  if (isBlazeKick) {
    ctx.save(); ctx.strokeStyle = '#f97316'; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.arc(cx + 2 * s, hipY - 3, 14.5, facingRight ? -1.05 : Math.PI + 0.1, facingRight ? 0.05 : Math.PI + 1.05); ctx.stroke();
    ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
  }
  drawLimb(ctx, cx - 4 * s + leanX * 0.6, shoulderY + 2, isLightningPoint ? cx - 8 * s : cx + 9.5 * s, isLightningPoint ? shoulderY - 4 : shoulderY + 1.5, 3.6, '#450a0a', '#dc2626');
  ctx.save();
  ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(cx - 5.8 + leanX * 0.8, shoulderY); ctx.lineTo(cx + 5.8 + leanX * 0.8, shoulderY); ctx.lineTo(cx + 6.8 + leanX * 0.2, hipY + 2); ctx.lineTo(cx - 6.8 + leanX * 0.2, hipY + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  const headX = cx + leanX;
  ctx.fillStyle = '#e4b796'; ctx.beginPath(); ctx.arc(headX, headY, 5.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(headX - 2, headY - 6); ctx.lineTo(headX, headY - 10); ctx.lineTo(headX + 2, headY - 6); ctx.closePath(); ctx.fill();
  if (!facingBack) { ctx.fillStyle = '#1f1916'; ctx.fillRect(headX + 1.2 * s, headY - 0.4, 1.3, 1.3); }
  ctx.restore();
  const frontHandX = cx + 14.5 * s, frontHandY = shoulderY + 0.5;
  drawLimb(ctx, cx + 4.2 * s + leanX * 0.7, shoulderY + 2, frontHandX, frontHandY, 3.8, '#b91c1c', '#fbbf24');
  ctx.save();
  if (isLightningPoint) {
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.moveTo(frontHandX, frontHandY); ctx.lineTo(frontHandX + 5 * s, frontHandY - 3); ctx.lineTo(frontHandX + 9 * s, frontHandY + 2); ctx.lineTo(frontHandX + 14 * s, frontHandY - 2); ctx.stroke();
    ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(frontHandX + 1 * s, frontHandY, 2.8, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(frontHandX + 2 * s, frontHandY, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(frontHandX + 1.5 * s, frontHandY, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function renderFireJetFrame(ctx, cx, groundY, opts) {
  const { frameIndex, frameCount, dir } = opts;
  const t = frameIndex / frameCount, tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE', s = facingRight ? 1 : -1;
  const jetPulse = Math.sin(t * tau * 2) * 2.2, leanX = 4.6 * s;
  const hipY = groundY - 12 + jetPulse * 0.4, shoulderY = hipY - 10.5, headY = shoulderY - 6.0;
  ctx.save();
  for (const footOffY of [0, 3]) {
    const fx = cx - 8 * s, fy = groundY - 5 + footOffY;
    ctx.fillStyle = 'rgba(249, 115, 22, 0.88)';
    ctx.beginPath(); ctx.moveTo(fx, fy - 2.5); ctx.lineTo(fx - (13 + jetPulse) * s, fy + 2); ctx.lineTo(fx, fy + 2.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(fx - 2 * s, fy, 2.4, 0, tau); ctx.fill();
  }
  ctx.restore();
  drawArticulatedLimb(ctx, cx - 2 * s, hipY, cx - 5 * s, hipY + 3, cx - 8 * s, groundY - 5, 3.8, '#450a0a', '#7f1d1d');
  drawArticulatedLimb(ctx, cx + 2 * s, hipY, cx - 3 * s, hipY + 4, cx - 7 * s, groundY - 2, 3.8, '#7f1d1d', '#b91c1c');
  drawLimb(ctx, cx + leanX * 0.6, shoulderY + 2, cx - 9 * s, shoulderY + 6, 3.6, '#991b1b', '#fbbf24');
  ctx.save();
  ctx.fillStyle = '#991b1b'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(cx - 5 + leanX * 0.8, shoulderY); ctx.lineTo(cx + 5.5 + leanX * 0.8, shoulderY); ctx.lineTo(cx + 5.8 + leanX * 0.2, hipY + 2); ctx.lineTo(cx - 5.8 + leanX * 0.2, hipY + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e4b796'; ctx.beginPath(); ctx.arc(cx + leanX, headY, 5.2, 0, tau); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function renderVillagerFrame(ctx, cx, groundY, opts) {
  if (opts.state === 'fire_kata') return renderFireKataFrame(ctx, cx, groundY, opts);
  if (opts.state === 'fire_jet') return renderFireJetFrame(ctx, cx, groundY, opts);
  if (opts.state === 'air_levitate') return renderAirLevitateFrame(ctx, cx, groundY, opts);
  if (opts.state === 'air_flight') return renderAirFlightFrame(ctx, cx, groundY, opts);
  if (opts.state === 'earth_stomp') {
    renderEarthStompFrame(ctx, cx, groundY, opts);
    return;
  }
  if (opts.state === 'swim') {
    renderSwimFrame(ctx, cx, groundY, opts);
    return;
  }
  if (opts.state === 'water_surf') {
    renderWaterSurfFrame(ctx, cx, groundY, opts);
    return;
  }

  const { state, frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount;
  const tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE';
  const facingBack = dir === 'NE' || dir === 'NW';
  const sideSign = facingRight ? 1 : -1;

  let bobY = 0;
  let leanX = 0;
  let leftFootX = cx - 2.8 * sideSign;
  let leftFootY = groundY - 1.5;
  let leftKneeX = cx - 2.6 * sideSign;
  let leftKneeY = groundY - 5.5;

  let rightFootX = cx + 2.8 * sideSign;
  let rightFootY = groundY - 1.0;
  let rightKneeX = cx + 2.6 * sideSign;
  let rightKneeY = groundY - 5.0;

  let frontArmAngle = 0.25 * sideSign;
  let backArmAngle = -0.2 * sideSign;
  let frontElbowBend = 0.2;
  let tool = null;
  let toolAngle = 0;
  let isRoundhouseKick = false;
  let isBlockingPose = false;

  if (state === 'idle') {
    bobY = Math.sin(t * tau) * 0.9;
    frontArmAngle = (0.22 + Math.sin(t * tau) * 0.06) * sideSign;
    backArmAngle = (-0.18 - Math.sin(t * tau) * 0.06) * sideSign;
  } else if (state === 'walk') {
    const stride = Math.sin(t * tau);
    const liftL = Math.max(0, Math.cos(t * tau)) * 2.5;
    const liftR = Math.max(0, -Math.cos(t * tau)) * 2.5;
    bobY = -Math.abs(stride) * 2.1;
    leanX = 1.3 * sideSign;
    leftFootX += stride * 5.4;
    leftFootY -= liftL;
    leftKneeX = (cx - 2.6 * sideSign + leftFootX) * 0.5 + 1.2 * sideSign;
    leftKneeY = (groundY - 9 + leftFootY) * 0.5 - liftL * 0.6;

    rightFootX -= stride * 5.4;
    rightFootY -= liftR;
    rightKneeX = (cx + 2.6 * sideSign + rightFootX) * 0.5 + 1.2 * sideSign;
    rightKneeY = (groundY - 9 + rightFootY) * 0.5 - liftR * 0.6;

    frontArmAngle = (-stride * 0.68 + 0.15) * sideSign;
    backArmAngle = (stride * 0.68 - 0.15) * sideSign;
  } else if (state === 'chop') {
    tool = 'axe';
    const swing =
      t < 0.45
        ? -1.25 * (t / 0.45)
        : t < 0.7
        ? -1.25 + 2.35 * ((t - 0.45) / 0.25)
        : 1.1 * (1 - (t - 0.7) / 0.3);
    bobY = t >= 0.6 && t <= 0.78 ? 1.5 : -0.5;
    leanX = (t >= 0.55 && t <= 0.75 ? 2.5 : -0.8) * sideSign;
    frontArmAngle = swing * sideSign;
    backArmAngle = (swing * 0.7 - 0.2) * sideSign;
    toolAngle = (swing + 0.35) * sideSign;
  } else if (state === 'build') {
    tool = 'hammer';
    const strike = Math.sin(t * tau);
    bobY = strike > 0.5 ? 1.0 : 0;
    leanX = 1.4 * sideSign;
    frontArmAngle = (-0.65 + strike * 0.85) * sideSign;
    backArmAngle = -0.35 * sideSign;
    toolAngle = (-0.5 + strike * 1.1) * sideSign;
  } else if (state === 'attack') {
    if (frameIndex === 2 || frameIndex === 3) {
      isRoundhouseKick = true;
      const kickExt = frameIndex === 2 ? 0.75 : 1.0;
      bobY = -2.2;
      leanX = -2.6 * sideSign;
      leftFootX = cx - 2.0 * sideSign;
      leftFootY = groundY - 1.0;
      rightKneeX = cx + 6.5 * sideSign;
      rightKneeY = groundY - 14;
      rightFootX = cx + 13.5 * kickExt * sideSign;
      rightFootY = groundY - 17.5 * kickExt;
      frontArmAngle = -0.75 * sideSign;
      backArmAngle = 0.95 * sideSign;
    } else if (frameIndex === 4) {
      tool = 'sword';
      bobY = -3.8;
      leanX = 3.2 * sideSign;
      rightKneeX = cx + 6.0 * sideSign;
      rightKneeY = groundY - 12;
      rightFootX = cx + 3.5 * sideSign;
      rightFootY = groundY - 7;
      frontArmAngle = 1.35 * sideSign;
      backArmAngle = -0.85 * sideSign;
      toolAngle = 1.55 * sideSign;
    } else {
      tool = 'sword';
      const lunge = frameIndex === 1 ? 1.0 : -0.4;
      leanX = (frameIndex === 1 ? 3.8 : -1.0) * sideSign;
      bobY = frameIndex === 1 ? 1.6 : -0.8;
      leftFootX = cx - 5.2 * sideSign;
      rightFootX = cx + 6.4 * sideSign;
      rightKneeX = cx + 5.2 * sideSign;
      frontArmAngle = lunge * 1.15 * sideSign;
      backArmAngle = -0.65 * sideSign;
      toolAngle = (lunge * 1.25 + 0.35) * sideSign;
    }
  } else if (state === 'dodge') {
    bobY = 3.8;
    leanX = -4.2 * sideSign;
    leftFootX = cx - 6.5 * sideSign;
    rightFootX = cx + 2.5 * sideSign;
    leftKneeY = groundY - 4;
    rightKneeY = groundY - 4;
    frontArmAngle = -1.1 * sideSign;
    backArmAngle = -1.3 * sideSign;
  } else if (state === 'block') {
    isBlockingPose = true;
    bobY = 1.8;
    leanX = -1.8 * sideSign;
    leftFootX = cx - 5.5 * sideSign;
    rightFootX = cx + 4.8 * sideSign;
    frontArmAngle = 0.45 * sideSign;
    backArmAngle = 0.65 * sideSign;
    frontElbowBend = -0.85;
  } else if (state === 'bend_cast') {
    const formPhase = Math.sin(t * tau);
    bobY = 2.6;
    leanX = formPhase * 2.8 * sideSign;
    leftFootX = cx - 6.2 * sideSign;
    rightFootX = cx + 6.2 * sideSign;
    leftKneeX = cx - 5.8 * sideSign;
    rightKneeX = cx + 5.8 * sideSign;
    frontArmAngle = (1.45 + formPhase * 0.25) * sideSign;
    backArmAngle = (1.15 - formPhase * 0.35) * sideSign;
  }

  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.34)';
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, groundY, 10.5, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const hipY = groundY - 9 + bobY;
  const shoulderY = hipY - 11;
  const headY = shoulderY - 6.5;

  const backShoulderX = cx - 4 * sideSign + leanX * 0.6;
  const backHandX = backShoulderX + Math.sin(backArmAngle) * 8.8;
  const backHandY = shoulderY + 2 + Math.cos(backArmAngle) * 8.8;
  drawLimb(ctx, backShoulderX, shoulderY + 2, backHandX, backHandY, 3.6, palette.tunicDark, palette.tunic);

  drawArticulatedLimb(ctx, cx - 2.6 * sideSign + leanX * 0.2, hipY, leftKneeX, leftKneeY, leftFootX, leftFootY, 4.0, '#3b2f26', '#5c4a3c');
  drawArticulatedLimb(ctx, cx + 2.6 * sideSign + leanX * 0.2, hipY, rightKneeX, rightKneeY, rightFootX, rightFootY, 4.0, '#4a3b30', '#6d5848');

  if (isRoundhouseKick) {
    ctx.save();
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(cx + 2 * sideSign, hipY - 3, 13.5, facingRight ? -0.95 : Math.PI + 0.15, facingRight ? -0.15 : Math.PI + 0.95);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  const torsoGrad = ctx.createLinearGradient(cx - 8, shoulderY, cx + 8, hipY + 3);
  torsoGrad.addColorStop(0, palette.tunicLight);
  torsoGrad.addColorStop(0.55, palette.tunic);
  torsoGrad.addColorStop(1, palette.tunicDark);
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = '#1e1b18';
  ctx.lineWidth = 1.1;

  ctx.beginPath();
  ctx.moveTo(cx - 5.5 + leanX * 0.8, shoulderY);
  ctx.lineTo(cx + 5.5 + leanX * 0.8, shoulderY);
  ctx.lineTo(cx + 6.8 + leanX * 0.2, hipY + 2);
  ctx.quadraticCurveTo(cx + leanX * 0.2, hipY + 4.5, cx - 6.8 + leanX * 0.2, hipY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#3b281c';
  ctx.fillRect(cx - 6.2 + leanX * 0.35, hipY - 2.2, 12.4, 2.4);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(cx + 1.5 * sideSign + leanX * 0.35, hipY - 2.2, 2.2, 2.4);
  ctx.restore();

  ctx.save();
  const headX = cx + leanX;
  const skinGrad = ctx.createRadialGradient(headX - 1.8, headY - 2, 1, headX, headY, 6.2);
  skinGrad.addColorStop(0, '#f3cfb3');
  skinGrad.addColorStop(0.7, '#d9a784');
  skinGrad.addColorStop(1, '#a97454');

  ctx.fillStyle = skinGrad;
  ctx.strokeStyle = '#2b1e16';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(headX, headY, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  if (facingBack) {
    ctx.arc(headX, headY - 0.5, 5.7, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(headX + 4.5, headY + 3.5);
    ctx.lineTo(headX - 4.5, headY + 3.5);
  } else {
    ctx.arc(headX - 0.4 * sideSign, headY - 1.2, 5.5, Math.PI * 0.95, Math.PI * 2.05);
  }
  ctx.closePath();
  ctx.fill();

  if (!facingBack) {
    ctx.fillStyle = '#1f1916';
    ctx.fillRect(headX + 1.2 * sideSign, headY - 0.4, 1.3, 1.4);
    ctx.fillRect(headX + 3.4 * sideSign, headY - 0.4, 1.2, 1.3);
  }
  ctx.restore();

  const frontShoulderX = cx + 4.2 * sideSign + leanX * 0.7;
  const frontHandX = frontShoulderX + Math.sin(frontArmAngle) * 8.8;
  const frontHandY =
    isBlockingPose
      ? shoulderY - 3
      : shoulderY + 2 + Math.cos(frontArmAngle + frontElbowBend * 0.2) * 8.8;

  drawTool(ctx, tool, frontHandX, frontHandY, toolAngle, facingRight);
  drawLimb(ctx, frontShoulderX, shoulderY + 2, frontHandX, frontHandY, 3.8, palette.tunic, palette.tunicLight);

  ctx.fillStyle = '#e4b796';
  ctx.beginPath();
  ctx.arc(frontHandX, frontHandY, 2.1, 0, Math.PI * 2);
  ctx.fill();

  if (isBlockingPose) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(frontHandX + 3 * sideSign, frontHandY, 6.5, facingRight ? -1.0 : Math.PI - 1.0, facingRight ? 1.0 : Math.PI + 1.0);
    ctx.stroke();
  }
}

function drawCarriedResource(ctx, x, y, carryItem, facingRight) {
  if (!carryItem) return;
  const offset = facingRight ? 6 : -6;
  ctx.save();
  ctx.translate(x + offset, y - 14);
  if (carryItem === 'wood') {
    ctx.fillStyle = '#7a5230';
    ctx.strokeStyle = '#3b2412';
    ctx.lineWidth = 1;
    ctx.fillRect(-5, -2.5, 10, 5);
    ctx.strokeRect(-5, -2.5, 10, 5);
  } else if (carryItem === 'stone') {
    ctx.fillStyle = '#9aa3ab';
    ctx.strokeStyle = '#49525a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (carryItem === 'gold' || carryItem === 'food') {
    ctx.fillStyle = carryItem === 'gold' ? '#f2c144' : '#e0533c';
    ctx.strokeStyle = '#6e4f10';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders live Swimming Wakes, Tai-Chi Waterbending Ribbons & Tidal Whips,
 * Martial Arts Blocking Shields, Dodge Afterimages, and Sovereign God-Power Auras.
 */
function drawIsometricRockMonolith(ctx, x, baseY, width, height, isLava = false) {
  if (height <= 1) return;
  const hw = width * 0.5;
  const topY = baseY - height;
  const bevel = hw * 0.45;

  ctx.save();
  // Left shaded face
  ctx.fillStyle = isLava ? '#451a03' : '#57534e';
  ctx.beginPath();
  ctx.moveTo(x - hw, baseY);
  ctx.lineTo(x, baseY + bevel);
  ctx.lineTo(x, topY + bevel);
  ctx.lineTo(x - hw * 0.85, topY);
  ctx.closePath();
  ctx.fill();

  // Right lit face
  ctx.fillStyle = isLava ? '#7c2d12' : '#78716c';
  ctx.beginPath();
  ctx.moveTo(x + hw, baseY);
  ctx.lineTo(x, baseY + bevel);
  ctx.lineTo(x, topY + bevel);
  ctx.lineTo(x + hw * 0.85, topY);
  ctx.closePath();
  ctx.fill();

  // Top facet
  ctx.fillStyle = isLava ? '#ea580c' : '#a8a29e';
  ctx.beginPath();
  ctx.moveTo(x, topY - bevel * 0.6);
  ctx.lineTo(x + hw * 0.85, topY);
  ctx.lineTo(x, topY + bevel);
  ctx.lineTo(x - hw * 0.85, topY);
  ctx.closePath();
  ctx.fill();

  // Rim & fissure highlight
  ctx.strokeStyle = isLava ? 'rgba(251, 146, 60, 0.9)' : 'rgba(163, 230, 53, 0.65)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x - hw * 0.85, topY);
  ctx.lineTo(x, topY - bevel * 0.6);
  ctx.lineTo(x + hw * 0.85, topY);
  ctx.moveTo(x, topY + bevel);
  ctx.lineTo(x, baseY + bevel);
  ctx.stroke();
  ctx.restore();
}

function drawUnitCombatAndBendingFX(ctx, unit, facingRight, scale, gameTime) {
  const f = facingRight ? 1 : -1;
  const phase = gameTime * 4.5 + (unit.id || 0) * 0.9;
  const swing = unit.swingAnim || 0;
  const kata = unit.kataTimer || 0;
  const blockAnim = unit.blockAnim || 0;
  const dodgeAnim = unit.dodgeAnim || 0;
  const inWater = isUnitInWater(unit);

  // 00. Swimming V-Wake, Foam Ripples & Air Bubbles (`inWater`)
  if (inWater && !unit.skySoar && (unit.z || 0) < 6) {
    ctx.save();
    const speed = Math.hypot(unit.vx || 0, unit.vy || 0);
    if (unit.bender === 'water' || unit.waterBendingSurf) {
      // Surfer hydro-wake spray behind wave
      for (let w = 0; w < 3; w++) {
        const wt = ((gameTime * 2.2 + w * 0.33) % 1);
        const wx = -f * (14 + wt * 22) * scale;
        ctx.strokeStyle = `rgba(186, 230, 253, ${((1 - wt) * 0.72).toFixed(3)})`;
        ctx.lineWidth = 2.0 * scale;
        ctx.beginPath();
        ctx.arc(wx, 1, (5 + wt * 8) * scale, f > 0 ? Math.PI - 0.8 : -0.8, f > 0 ? Math.PI + 0.8 : 0.8);
        ctx.stroke();
      }
    } else if (speed > 4) {
      // Swimmer V-wake trailing behind kicking feet
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-f * 10 * scale, -2);
      ctx.lineTo(-f * 26 * scale, -8 * scale);
      ctx.moveTo(-f * 10 * scale, 2);
      ctx.lineTo(-f * 26 * scale, 8 * scale);
      ctx.stroke();

      // Trailing bubbles
      for (let b = 0; b < 3; b++) {
        const bt = ((gameTime * 2.5 + b * 0.33 + (unit.id || 0) * 0.1) % 1);
        ctx.fillStyle = `rgba(224, 242, 254, ${((1 - bt) * 0.7).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(-f * (10 + bt * 18) * scale, Math.sin(gameTime * 10 + b) * 3, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Treading water concentric ripples
      const rr = 12 + Math.sin(gameTime * 5 + (unit.id || 0)) * 3;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.48)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 0. Active Block / Parry Deflection Shield (`unit.blockAnim > 0`)
  if (blockAnim > 0.02) {
    ctx.save();
    const shieldAlpha = Math.min(0.92, blockAnim * 2.2);
    const shieldX = 11 * f * scale;
    const shieldY = -17 * scale;

    ctx.strokeStyle =
      unit.bender === 'water'
        ? `rgba(56, 189, 248, ${shieldAlpha})`
        : unit.fightingStyle === 'phalanx'
        ? `rgba(56, 189, 248, ${shieldAlpha})`
        : `rgba(250, 204, 21, ${shieldAlpha})`;
    ctx.lineWidth = 3.4 * scale;
    ctx.beginPath();
    ctx.arc(shieldX * 0.4, shieldY, 14 * scale, f > 0 ? -1.15 : Math.PI - 1.15, f > 0 ? 1.15 : Math.PI + 1.15);
    ctx.stroke();

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 4; s++) {
      const sa = (f > 0 ? 0 : Math.PI) + (s - 1.5) * 0.55 + Math.sin(gameTime * 30 + s) * 0.2;
      const r1 = 10 * scale;
      const r2 = (16 + blockAnim * 12) * scale;
      ctx.beginPath();
      ctx.moveTo(Math.cos(sa) * r1, shieldY + Math.sin(sa) * r1);
      ctx.lineTo(Math.cos(sa) * r2, shieldY + Math.sin(sa) * r2);
      ctx.stroke();
    }
    if (unit.bender === 'earth') {
      const wallH = Math.min(1, blockAnim * 4.5) * 24 * scale;
      drawIsometricRockMonolith(ctx, f * 13 * scale, 2, 14 * scale, wallH, Boolean(unit.subElement));
    }
    ctx.restore();
  }

  // 0b. Evasive Dodge Wind-Streak Lines (`unit.dodgeAnim > 0`)
  if (dodgeAnim > 0.02) {
    ctx.save();
    ctx.strokeStyle = `rgba(226, 232, 240, ${Math.min(0.85, dodgeAnim * 1.8).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    for (let w = 0; w < 3; w++) {
      const wy = (-8 - w * 8) * scale;
      ctx.beginPath();
      ctx.moveTo(-f * (6 + w * 4) * scale, wy);
      ctx.lineTo(-f * (22 + w * 5) * scale, wy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 1. Sovereign Hero / Ring-Wraith Flowing Cape & Fellbeast Wings
  if (unit.isT101s || unit.isWraith || unit.skySoar) {
    const flap = Math.sin(gameTime * 7 + (unit.id || 0)) * 5;
    if ((unit.isWraith || unit.skySoar) && unit.mountType !== 'drake') {
      ctx.save();
      ctx.fillStyle = unit.isWraith ? 'rgba(30, 27, 75, 0.78)' : 'rgba(251, 191, 36, 0.38)';
      ctx.strokeStyle = unit.isWraith ? '#818cf8' : '#fde047';
      ctx.lineWidth = 1.3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -22 * scale);
        ctx.quadraticCurveTo(
          side * 22 * scale,
          (-38 + flap) * scale,
          side * 30 * scale,
          (-18 + flap * 1.3) * scale
        );
        ctx.quadraticCurveTo(side * 16 * scale, -14 * scale, 0, -14 * scale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    if (unit.isT101s) {
      const capeWave = Math.sin(gameTime * 6) * 3;
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.moveTo(-4 * f * scale, -24 * scale);
      ctx.lineTo(-14 * f * scale, (-6 + capeWave) * scale);
      ctx.lineTo(-4 * f * scale, -7 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-5 * scale, -34 * scale);
      ctx.lineTo(-4 * scale, -39 * scale);
      ctx.lineTo(0, -36 * scale);
      ctx.lineTo(0, -40 * scale);
      ctx.lineTo(4 * scale, -39 * scale);
      ctx.lineTo(5 * scale, -34 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // 2. Fighting Style Weapons & Martial Arts Gear
  const style = unit.fightingStyle;
  if (style === 'kungfu') {
    const tailWave = Math.sin(gameTime * 9 + (unit.id || 0)) * 3.5;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-4 * f * scale, -29 * scale);
    ctx.quadraticCurveTo(-11 * f * scale, (-28 + tailWave) * scale, -17 * f * scale, (-24 - tailWave * 0.6) * scale);
    ctx.stroke();

    if (swing > 0.04 || kata > 0) {
      const punchExt = (10 + Math.sin(gameTime * 28) * 5) * f * scale;
      ctx.fillStyle = 'rgba(74, 222, 128, 0.78)';
      ctx.beginPath();
      ctx.arc(punchExt, -16 * scale, 4.8 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  } else if (style === 'phalanx') {
    const thrust = swing > 0.05 ? Math.sin(swing * Math.PI) * 10 * f : 0;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8 * f + thrust, -16);
    ctx.lineTo(20 * f + thrust, -20);
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(20 * f + thrust, -22);
    ctx.lineTo(26 * f + thrust, -20);
    ctx.lineTo(20 * f + thrust, -18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(5 * f, -14, 5.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'archery') {
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(6 * f, -16, 9, f > 0 ? -1.1 : Math.PI - 1.1, f > 0 ? 1.1 : Math.PI + 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(6 * f, -24);
    ctx.lineTo(6 * f, -8);
    ctx.stroke();
  } else if (style === 'juggernaut') {
    const smash = swing > 0.05 ? Math.sin(swing * Math.PI) * 1.1 : -0.35;
    ctx.save();
    ctx.translate(6 * f, -16);
    ctx.rotate(smash * f);
    ctx.strokeStyle = '#5c2d0c';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, -18);
    ctx.stroke();
    ctx.fillStyle = '#57534e';
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-6, -23, 12, 7);
    ctx.strokeRect(-6, -23, 12, 7);
    ctx.restore();
  } else if (style === 'berserker') {
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(7 * f, -14);
    ctx.lineTo(15 * f, -21);
    ctx.moveTo(-5 * f, -13);
    ctx.lineTo(-12 * f, -19);
    ctx.stroke();
  } else if (style === 'onering' || unit.hasOneRing) {
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -42 * scale, 8, 3.2, Math.sin(gameTime * 3) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Martial Kata 360-Degree Dragon Spiral
  if (kata > 0) {
    ctx.save();
    const kataSpin = gameTime * 16;
    for (let k = 0; k < 2; k++) {
      const a = kataSpin + k * Math.PI;
      ctx.strokeStyle = k === 0 ? 'rgba(251, 191, 36, 0.88)' : 'rgba(56, 189, 248, 0.82)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, -18 * scale, 22 * scale, a, a + 1.9);
      ctx.stroke();
    }
    const ringR = 14 + ((gameTime * 28) % 22);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 2, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Choreographed Elemental & Sub-Elemental Bending
  const bender = unit.bender;
  const isActivelyBending = swing > 0.04 || unit.state === 'attack' || unit.state === 'fight' || kata > 0;
  if (bender) {
    ctx.save();
    const handX = 11 * f * scale;
    const handY = -16 * scale;

     if (bender === 'fire') {
      const hasLightningMastery = Boolean(unit.subElement);
      for (let d = 0; d < 2; d++) {
        ctx.strokeStyle = d === 0 ? (hasLightningMastery ? 'rgba(56, 189, 248, 0.86)' : 'rgba(249, 115, 22, 0.88)') : 'rgba(254, 240, 138, 0.85)';
        ctx.lineWidth = (3.4 - d * 1.1) * scale;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, ang = phase * 1.6 + t * Math.PI * 2.4 + d * Math.PI;
          const rx = Math.cos(ang) * (18 - t * 5) * scale, ry = (2 - t * 32) * scale + Math.sin(ang) * 4 * scale;
          if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const a = phase + (i * Math.PI * 2) / 3, ox = Math.cos(a) * 18 * scale, oy = -16 * scale + Math.sin(a) * 7.5 * scale;
        const grad = ctx.createRadialGradient(ox, oy, 0.5, ox, oy, 6.2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.45, hasLightningMastery && i === 0 ? '#38bdf8' : '#fef08a');
        grad.addColorStop(1, hasLightningMastery && i === 0 ? 'rgba(2, 132, 199, 0)' : 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(ox, oy, 6.2, 0, Math.PI * 2); ctx.fill();
      }
      if (isActivelyBending) {
        for (let p = 0; p < 6; p++) {
          const dist = (6 + p * 6.5 + ((gameTime * 45) % 6)) * scale;
          const fx = handX + f * dist, fy = handY + Math.sin(gameTime * 20 + p) * 4.0 * scale, r = (3.8 + p * 1.5) * scale;
          ctx.fillStyle = p < 2 ? 'rgba(254, 240, 138, 0.92)' : hasLightningMastery && p >= 4 ? 'rgba(56, 189, 248, 0.78)' : 'rgba(249, 115, 22, 0.78)';
          ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (hasLightningMastery || swing > 0.06 || isActivelyBending) {
        const chiA = (gameTime * 10) % (Math.PI * 2);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)'; ctx.lineWidth = 1.6 * scale;
        ctx.beginPath(); ctx.arc(0, -16 * scale, 13 * scale, chiA, chiA + 2.2); ctx.stroke();
        for (let b = 0; b < (isActivelyBending ? 2 : 1); b++) {
          let lx = handX, ly = handY + (b - 0.5) * 3 * scale;
          ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = (2.8 - b * 0.7) * scale;
          ctx.beginPath(); ctx.moveTo(lx, ly);
          for (let s = 0; s < 6; s++) {
            lx += f * 7.2 * scale; ly += (Math.sin(gameTime * 52 + s * 2.7 + b * 4) - 0.15) * 6.5 * scale;
            ctx.lineTo(lx, ly);
          }
          ctx.stroke();
          ctx.strokeStyle = '#f0f9ff'; ctx.lineWidth = 1.1 * scale; ctx.stroke();
        }
      }
    } else if (bender === 'water') {
      // === HIGH-END TAI-CHI WATERBENDING RIBBON & CRASHING TIDAL WHIP ===
      // Multi-layered sinuous figure-8 water stream orbiting the bender
      const reach = isActivelyBending ? 26 : 19;
      ctx.lineCap = 'round';

      // Outer deep cerulean stream
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.72)';
      ctx.lineWidth = 5.2 * scale;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const wt = (i / 20) * Math.PI * 2;
        const wx = Math.sin(wt + phase * 0.8) * reach * scale;
        const wy = -17 * scale + Math.sin(wt * 2 + phase * 1.2) * 8.5 * scale;
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();

      // Inner bright cyan core + white foam crest
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)';
      ctx.lineWidth = 2.4 * scale;
      ctx.stroke();

      // Crashing Tidal Water-Whip lashing forward during attacks!
      if (isActivelyBending) {
        const whipReach = 34 * scale;
        const whipTipX = handX + f * whipReach;
        const whipTipY = handY + Math.sin(gameTime * 16) * 8 * scale;

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.88)';
        ctx.lineWidth = 4.0 * scale;
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.bezierCurveTo(
          handX + f * 12 * scale,
          handY - 14 * scale,
          handX + f * 22 * scale,
          handY + 10 * scale,
          whipTipX,
          whipTipY
        );
        ctx.stroke();

        // White foam highlight + water droplets at whip tip
        ctx.strokeStyle = '#f0f9ff';
        ctx.lineWidth = 1.6 * scale;
        ctx.stroke();

        for (let d = 0; d < 3; d++) {
          ctx.fillStyle = 'rgba(224, 242, 254, 0.9)';
          ctx.beginPath();
          ctx.arc(
            whipTipX + f * (d * 4) + Math.cos(gameTime * 20 + d) * 3,
            whipTipY + Math.sin(gameTime * 20 + d) * 4,
            2.1 * scale,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      // Cryo-Prison Sub-Element: Faceted Floating Ice Spears
      if (unit.subElement) {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.92)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.0;
        for (let i = 0; i < 4; i++) {
          const ia = -phase * 0.9 + (i * Math.PI * 2) / 4;
          const ix = Math.cos(ia) * 21 * scale;
          const iy = -18 * scale + Math.sin(ia) * 8 * scale;
          ctx.beginPath();
          ctx.moveTo(ix, iy - 6.5);
          ctx.lineTo(ix + 3.5, iy);
          ctx.lineTo(ix, iy + 6.5);
          ctx.lineTo(ix - 3.5, iy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (bender === 'earth') {
      const isLava = Boolean(unit.subElement);
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(gameTime * 4.5);
      ctx.strokeStyle = isLava ? `rgba(249, 115, 22, ${(0.28 + pulse * 0.25).toFixed(3)})` : `rgba(163, 230, 53, ${(0.25 + pulse * 0.25).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 1, (16 + pulse * 5) * scale, (7 + pulse * 2.2) * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < 3; i++) {
        const a = phase * 0.8 + (i * Math.PI * 2) / 3;
        const rx = Math.cos(a) * 18 * scale;
        const ry = -14 * scale + Math.sin(a) * 7 * scale;
        const r = 4.6 * scale;
        ctx.fillStyle = isLava ? '#7c2d12' : '#78716c';
        ctx.strokeStyle = isLava ? '#f97316' : '#44403c';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx, ry - r);
        ctx.lineTo(rx + r * 0.9, ry - r * 0.2);
        ctx.lineTo(rx + r * 0.65, ry + r * 0.85);
        ctx.lineTo(rx - r * 0.7, ry + r * 0.75);
        ctx.lineTo(rx - r * 0.95, ry - r * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isLava ? 'rgba(251, 146, 60, 0.75)' : 'rgba(214, 211, 209, 0.55)';
        ctx.beginPath();
        ctx.moveTo(rx, ry - r);
        ctx.lineTo(rx + r * 0.9, ry - r * 0.2);
        ctx.lineTo(rx, ry + r * 0.1);
        ctx.closePath();
        ctx.fill();
      }

      if (isLava) {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.78)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.ellipse(0, 1.5, 19 * scale, 8.2 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (isActivelyBending) {
        for (let sIdx = 0; sIdx < 3; sIdx++) {
          const seq = Math.max(0, Math.min(1, Math.sin(gameTime * 10 - sIdx * 0.7) * 0.5 + 0.65));
          const px = f * (16 + sIdx * 10) * scale;
          const py = 2 + (sIdx % 2 === 0 ? 1 : -1) * 2 * scale;
          const pillarH = (10 + sIdx * 5) * seq * scale;
          drawIsometricRockMonolith(ctx, px, py, (9 + sIdx * 1.5) * scale, pillarH, isLava);
        }
      }
    } else if (bender === 'air') {
      const airSpeed = Math.hypot(unit.vx || 0, unit.vy || 0);
      const isGliding = airSpeed > 8 || Boolean(unit.subElement) || Boolean(unit.skySoar);
      for (let r = 0; r < 4; r++) {
        const ringY = (10 - r * 6.5) * scale, ringRX = (6 + r * 4.5 + Math.sin(gameTime * 7 + r) * 1.5) * scale;
        const startA = (phase * 2.2 + r * 1.35) % (Math.PI * 2);
        ctx.strokeStyle = r >= 2 ? 'rgba(125, 211, 252, 0.82)' : 'rgba(226, 232, 240, 0.65)';
        ctx.lineWidth = (1.5 + r * 0.25) * scale;
        ctx.beginPath(); ctx.ellipse(0, ringY, ringRX, ringRX * 0.42, 0, startA, startA + 4.2); ctx.stroke();
      }
      if (isGliding && unit.mountType !== 'drake') {
        const bank = Math.sin(gameTime * 6 + (unit.id || 0)) * 3.5;
        ctx.save(); ctx.translate(0, (-24 + bank * 0.3) * scale);
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2.4 * scale;
        ctx.beginPath(); ctx.moveTo(-22 * f * scale, 2 * scale); ctx.lineTo(18 * f * scale, -2 * scale); ctx.stroke();
        for (const side of [-1, 1]) {
          ctx.fillStyle = 'rgba(220, 38, 38, 0.86)'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(4 * f * scale, 0);
          ctx.quadraticCurveTo(side * 16 * scale, (-16 + bank * side * 0.4) * scale, (-16 * f + side * 18) * scale, (-6 + bank * 0.5) * scale);
          ctx.lineTo(-10 * f * scale, 2 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      if (isActivelyBending || airSpeed > 12) {
        const gustDist = (16 + ((gameTime * 55) % 24)) * f * scale;
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.92)'; ctx.lineWidth = 2.5 * scale;
        ctx.beginPath(); ctx.arc(gustDist, -16 * scale, 11 * scale, f > 0 ? -0.9 : Math.PI - 0.9, f > 0 ? 0.9 : Math.PI + 0.9); ctx.stroke();
      }
      
    } else if (bender === 'avatar') {
      const ringColors = ['#f97316', '#38bdf8', '#a3e635', '#f8fafc'];
      for (let r = 0; r < 4; r++) {
        ctx.save();
        ctx.translate(0, -18 * scale);
        ctx.rotate((r * Math.PI) / 4 + Math.sin(gameTime * 1.5 + r) * 0.35);
        ctx.strokeStyle = ringColors[r];
        ctx.lineWidth = 2.0;
        const startA = (gameTime * (3.5 + r * 0.6)) % (Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, 22 * scale, 7.5 * scale, 0, startA, startA + 4.4);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // 5. Invincibility Sacred Geometry Dome
  if (unit.invincible && !unit.isShadowClone) {
    ctx.save();
    const pulse = 0.45 + Math.sin(gameTime * 6) * 0.15;
    ctx.strokeStyle = `rgba(250, 204, 21, ${pulse.toFixed(3)})`;
    ctx.fillStyle = `rgba(250, 204, 21, ${(pulse * 0.18).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = gameTime * 1.5 + (i * Math.PI) / 3;
      const hx = Math.cos(a) * 19 * scale;
      const hy = -18 * scale + Math.sin(a) * 21 * scale;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 6. Lightning Speed Bio-Electric Crackles
  if (unit.lightningSpeed) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    for (let b = 0; b < 2; b++) {
      const seed = Math.floor(gameTime * 24) + b * 7 + (unit.id || 0);
      const sx = (hash2D(seed, 1) - 0.5) * 18 * scale;
      const sy = (-6 - hash2D(seed, 2) * 24) * scale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (hash2D(seed, 3) - 0.5) * 12, sy - 6);
      ctx.lineTo(sx + (hash2D(seed, 4) - 0.5) * 12, sy - 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. Tapered Multi-Layered Slash Arc
  if (swing > 0.05) {
    ctx.save();
    const swingColor =
      bender === 'fire'
        ? '#f97316'
        : bender === 'water'
        ? '#38bdf8'
        : bender === 'earth'
        ? '#a3e635'
        : bender === 'avatar'
        ? '#fde047'
        : unit.isT101s
        ? '#f43f5e'
        : '#f8fafc';

    ctx.globalAlpha = Math.min(1, swing * 1.6);
    const arcCenterY = -16 * scale;
    const startA = f > 0 ? -1.15 : Math.PI - 0.75;
    const endA = f > 0 ? 0.75 : Math.PI + 1.15;

    ctx.strokeStyle = swingColor;
    ctx.lineWidth = 5.0 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(f * 7 * scale, arcCenterY, 17 * scale, startA, endA);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0 * scale;
    ctx.beginPath();
    ctx.arc(f * 7 * scale, arcCenterY, 16.5 * scale, startA + 0.15, endA - 0.15);
    ctx.stroke();
    ctx.restore();
  }
}

export class VillagerSpriteBank {
  constructor({ cellWidth = 48, cellHeight = 56 } = {}) {
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.cache = new Map();
    this.rows = [];
    this.rowIndex = new Map();
    this.maxFrames = 0;

    for (const [stateName, cfg] of Object.entries(UNIT_STATES)) {
      this.maxFrames = Math.max(this.maxFrames, cfg.frames);
      for (const dir of DIRECTIONS) {
        const key = `${stateName}:${dir}`;
        this.rowIndex.set(key, this.rows.length);
        this.rows.push({ state: stateName, dir, frames: cfg.frames });
      }
    }
  }

  getAtlas(factionColor = '#2e6fd9') {
    const key = (factionColor || '#2e6fd9').toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = this.maxFrames * this.cellWidth;
    canvas.height = this.rows.length * this.cellHeight;
    const ctx = canvas.getContext('2d');

    const palette = {
      tunic: key,
      tunicLight: shadeHex(key, 0.16),
      tunicDark: shadeHex(key, -0.2),
      hair: '#3a281d',
    };

    for (let r = 0; r < this.rows.length; r++) {
      const { state, dir, frames } = this.rows[r];
      for (let f = 0; f < frames; f++) {
        const cx = f * this.cellWidth + this.cellWidth * 0.5;
        const groundY = (r + 1) * this.cellHeight - 8;
        renderVillagerFrame(ctx, cx, groundY, {
          state,
          frameIndex: f,
          frameCount: frames,
          dir,
          palette,
        });
      }
    }
    this.cache.set(key, canvas);
    return canvas;
  }

  static vectorToDirection(vx, vy, fallback = 'SE') {
    if (Math.abs(vx || 0) < 0.05 && Math.abs(vy || 0) < 0.05) return fallback;
    if (vy >= 0) return vx >= 0 ? 'SE' : 'SW';
    return vx >= 0 ? 'NE' : 'NW';
  }

  drawPrehistoricMount(ctx, unit, facingRight, scale, gameTime) {
    const f = facingRight ? 1 : -1;
    const walkSpeed = Math.hypot(unit.vx || 0, unit.vy || 0) > 2 ? 9.5 : 2.2;
    const phase = gameTime * walkSpeed + (unit.id || 0);
    const stride = Math.sin(phase) * (walkSpeed > 4 ? 5.5 : 1.0);
    const bob = Math.abs(Math.cos(phase)) * (walkSpeed > 4 ? 2.2 : 0.6);
    const mType = unit.mountType;

    ctx.save();
    if (mType === 'mammoth') {
      ctx.fillStyle = 'rgba(10, 14, 18, 0.38)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 24 * scale, 10 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      const legPairs = [
        [-11 * f, -3, stride * 0.7, '#3e2723'],
        [9 * f, -3, -stride * 0.7, '#3e2723'],
        [-9 * f, 2, -stride, '#4e342e'],
        [11 * f, 2, stride, '#4e342e'],
      ];
      for (const [lx, ly, lStride, col] of legPairs) {
        drawLimb(ctx, lx * scale, (ly - 14 - bob) * scale, (lx + lStride) * scale, ly * scale, 6.2 * scale, col, '#6d4c41');
      }

      const bodyGrad = ctx.createLinearGradient(0, -32 * scale, 0, -4 * scale);
      bodyGrad.addColorStop(0, '#795548');
      bodyGrad.addColorStop(0.6, '#4e342e');
      bodyGrad.addColorStop(1, '#271815');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#1b0f0d';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, (-16 - bob) * scale, 21 * scale, 13.5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = unit.isT101s ? '#991b1b' : '#1e3a8a';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.3;
      ctx.fillRect(-9 * scale, (-27 - bob) * scale, 18 * scale, 11 * scale);
      ctx.strokeRect(-9 * scale, (-27 - bob) * scale, 18 * scale, 11 * scale);

      const headX = 18 * f * scale;
      const headY = (-20 - bob) * scale;
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.arc(headX, headY, 9.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const trunkSwing = Math.sin(gameTime * 3.5 + (unit.id || 0)) * 4 * f;
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 4.5 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(headX + 5 * f * scale, headY);
      ctx.quadraticCurveTo(
        headX + (14 + trunkSwing) * f * scale,
        headY + 12 * scale,
        headX + (9 + trunkSwing) * f * scale,
        headY + 16 * scale
      );
      ctx.stroke();

      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 3.0 * scale;
      ctx.beginPath();
      ctx.moveTo(headX + 3 * f * scale, headY + 4 * scale);
      ctx.quadraticCurveTo(headX + 18 * f * scale, headY + 9 * scale, headX + 23 * f * scale, headY - 4 * scale);
      ctx.stroke();

      ctx.restore();
      return -20 * scale - bob;
    }

    if (mType === 'sabre') {
      ctx.fillStyle = 'rgba(10, 14, 18, 0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 3, 19 * scale, 7.5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      drawLimb(ctx, -11 * f * scale, (-10 - bob) * scale, (-13 * f - stride) * scale, 2, 4.0 * scale, '#b45309', '#f59e0b');
      drawLimb(ctx, 10 * f * scale, (-10 - bob) * scale, (12 * f + stride) * scale, 2, 4.0 * scale, '#d97706', '#fbbf24');

      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2.8 * scale;
      ctx.beginPath();
      ctx.moveTo(-14 * f * scale, (-12 - bob) * scale);
      ctx.quadraticCurveTo(-24 * f * scale, (-18 + Math.sin(gameTime * 8) * 5) * scale, -27 * f * scale, (-14 - bob) * scale);
      ctx.stroke();

      const catGrad = ctx.createLinearGradient(-15 * scale, -20 * scale, 15 * scale, -4 * scale);
      catGrad.addColorStop(0, '#fbbf24');
      catGrad.addColorStop(0.6, '#d97706');
      catGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = catGrad;
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, (-11 - bob) * scale, 16 * scale, 7.5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.4;
      for (let st = -6; st <= 4; st += 5) {
        ctx.beginPath();
        ctx.moveTo(st * scale, (-17 - bob) * scale);
        ctx.lineTo((st - 1.5) * scale, (-9 - bob) * scale);
        ctx.stroke();
      }

      const hx = 15 * f * scale;
      const hy = (-15 - bob) * scale;
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(hx, hy, 6.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(hx + 3 * f * scale, hy + 2 * scale);
      ctx.lineTo(hx + 4.5 * f * scale, hy + 10 * scale);
      ctx.lineTo(hx + 6 * f * scale, hy + 2 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      return -13 * scale - bob;
    }

    const flap = Math.sin(gameTime * 9.5 + (unit.id || 0)) * 12;
    ctx.fillStyle = 'rgba(136, 19, 55, 0.82)';
    ctx.strokeStyle = '#fda4af';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2 * f * scale, -16 * scale);
    ctx.quadraticCurveTo(-18 * f * scale, (-38 + flap) * scale, -28 * f * scale, (-20 + flap) * scale);
    ctx.lineTo(-6 * f * scale, -10 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#9f1239';
    ctx.lineWidth = 4.2 * scale;
    ctx.beginPath();
    ctx.moveTo(-14 * f * scale, -11 * scale);
    ctx.quadraticCurveTo(-28 * f * scale, (-6 + Math.sin(gameTime * 6) * 5) * scale, -36 * f * scale, -14 * scale);
    ctx.stroke();

    const drakeGrad = ctx.createLinearGradient(-16 * scale, -20 * scale, 16 * scale, -4 * scale);
    drakeGrad.addColorStop(0, '#f43f5e');
    drakeGrad.addColorStop(0.5, '#be123c');
    drakeGrad.addColorStop(1, '#4c0519');
    ctx.fillStyle = drakeGrad;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, -12 * scale, 17 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const dhx = 18 * f * scale;
    const dhy = -20 * scale;
    drawLimb(ctx, 11 * f * scale, -14 * scale, dhx, dhy, 6 * scale, '#9f1239', '#f43f5e');
    ctx.fillStyle = '#be123c';
    ctx.beginPath();
    ctx.ellipse(dhx + 3 * f * scale, dhy, 7 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(dhx, dhy - 2 * scale);
    ctx.lineTo(dhx - 8 * f * scale, dhy - 8 * scale);
    ctx.stroke();

    ctx.fillStyle = 'rgba(190, 18, 60, 0.85)';
    ctx.strokeStyle = '#fecdd3';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(2 * f * scale, -14 * scale);
    ctx.quadraticCurveTo(14 * f * scale, (-36 + flap) * scale, -18 * f * scale, (-28 + flap) * scale);
    ctx.lineTo(-6 * f * scale, -10 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return -15 * scale;
  }

  drawWorldBoss(ctx, boss, dx, sy, invTilt = 1, gameTime = 0) {
    const name = boss.name || 'World Boss';
    const f = (boss.vx || 0) < -0.05 ? -1 : boss.facing || -1;
    const phase = gameTime * 3.2 + (boss.id || 0);
    const bob = Math.sin(phase) * 3.0;
    const swing = (boss.swingAnim || 0) > 0.05 ? Math.sin(boss.swingAnim * Math.PI) * 10 * f : 0;

    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    const auraR = 42 + Math.sin(gameTime * 4) * 4;
    const auraGrad = ctx.createRadialGradient(0, 2, auraR * 0.2, 0, 2, auraR);
    auraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.32)');
    auraGrad.addColorStop(0.7, 'rgba(245, 158, 11, 0.18)');
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, auraR, auraR * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    if (name.includes('Mammoth')) {
      this.drawPrehistoricMount(ctx, { ...boss, mountType: 'mammoth', isT101s: true }, f > 0, 1.85, gameTime);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(28 * f, -32);
      ctx.quadraticCurveTo(54 * f, -22, 62 * f, -44);
      ctx.stroke();
    } else if (name.includes('Magma') || name.includes('Behemoth')) {
      const stride = Math.sin(phase) * 7;
      drawLimb(ctx, -14 * f, -18 + bob, -16 * f + stride, 4, 11, '#292524', '#ea580c');
      drawLimb(ctx, 14 * f, -18 + bob, 16 * f - stride, 4, 11, '#1c1917', '#f97316');

      const bodyGrad = ctx.createLinearGradient(-28, -64 + bob, 28, -14 + bob);
      bodyGrad.addColorStop(0, '#44403c');
      bodyGrad.addColorStop(0.5, '#1c1917');
      bodyGrad.addColorStop(1, '#7c2d12');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-26, -54 + bob);
      ctx.lineTo(0, -64 + bob);
      ctx.lineTo(26, -54 + bob);
      ctx.lineTo(20, -16 + bob);
      ctx.lineTo(-20, -16 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -56 + bob);
      ctx.lineTo(-8, -38 + bob);
      ctx.lineTo(6, -28 + bob);
      ctx.moveTo(0, -44 + bob);
      ctx.lineTo(12, -34 + bob);
      ctx.stroke();

      ctx.fillStyle = '#292524';
      ctx.strokeStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(4 * f, -66 + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(6 * f, -68 + bob, 4, 3);

      drawLimb(ctx, 22 * f, -48 + bob, 34 * f + swing, -24 + bob, 10, '#292524', '#f97316');
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(34 * f + swing, -22 + bob, 7.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (name.includes('Leviathan')) {
      for (let w = 0; w < 3; w++) {
        const wr = 18 + w * 12 + Math.sin(gameTime * 4 + w) * 3;
        ctx.strokeStyle = w === 0 ? '#e0f2fe' : '#38bdf8';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(0, 2, wr, wr * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let seg = 6; seg >= 0; seg--) {
        const t = seg / 6;
        const sx = Math.sin(phase + seg * 0.75) * 22 * (1 - t * 0.3) - seg * 4 * f;
        const sySeg = -10 - seg * 8.5 + Math.cos(phase + seg * 0.6) * 3;
        const rad = 13 - seg * 0.9;

        const segGrad = ctx.createRadialGradient(sx - 3, sySeg - 3, 1, sx, sySeg, rad);
        segGrad.addColorStop(0, '#67e8f9');
        segGrad.addColorStop(0.55, '#0284c7');
        segGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = segGrad;
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sySeg, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const hx = Math.sin(phase) * 18 + 8 * f + swing;
      const hy = -64 + bob;
      ctx.fillStyle = '#0369a1';
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(hx, hy, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(hx + 5 * f, hy - 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const hoverY = -28 + bob * 1.6;
      const wingFlap = Math.sin(gameTime * 8.5) * 22;

      for (const side of [-1, 1]) {
        const wingGrad = ctx.createLinearGradient(0, hoverY, side * 48, hoverY - 24 + wingFlap);
        wingGrad.addColorStop(0, '#f59e0b');
        wingGrad.addColorStop(0.6, '#fde047');
        wingGrad.addColorStop(1, '#38bdf8');
        ctx.fillStyle = wingGrad;
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, hoverY);
        ctx.quadraticCurveTo(side * 28, hoverY - 32 + wingFlap, side * 48, hoverY - 12 + wingFlap);
        ctx.quadraticCurveTo(side * 24, hoverY + 8, 0, hoverY + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = '#d97706';
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, hoverY, 15, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(8 * f, hoverY - 12);
      ctx.lineTo(20 * f, hoverY - 8);
      ctx.lineTo(8 * f, hoverY - 4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-28, hoverY - 8 + wingFlap * 0.5);
      ctx.lineTo(0, hoverY + 18);
      ctx.lineTo(28, hoverY - 8 + wingFlap * 0.5);
      ctx.stroke();
    }

    const hpRatio = Math.max(0, Math.min(1, (boss.hp || 1650) / (boss.maxHp || 1650)));
    const barW = 68;
    const barY = -84;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.4;
    ctx.fillRect(-barW * 0.5, barY, barW, 7);
    ctx.strokeRect(-barW * 0.5, barY, barW, 7);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-barW * 0.5 + 1, barY + 1, Math.round((barW - 2) * hpRatio), 5);

    ctx.font = 'bold 10.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(`${name} (${Math.ceil(boss.hp || 0)} HP)`, 0, barY - 4);

    ctx.restore();
  }

  drawGameUnit(ctx, unit, dx, sy, invTilt = 1, isEnemy = false, gameTime = 0, showBadges = true) {
    if (unit.isBoss) {
      this.drawWorldBoss(ctx, unit, dx, sy, invTilt, gameTime);
      return;
    }
    const factionColor = unit.isWraith
      ? '#312e81'
      : unit.isShadowClone
      ? '#7c3aed'
      : isEnemy
      ? '#c93b2b'
      : unit.isT101s
      ? '#d97706'
      : unit.color || unit.tribeColor || '#2e6fd9';

    const animState = mapUnitStateToAnim(unit);
    const dir = VillagerSpriteBank.vectorToDirection(unit.vx, unit.vy, unit._lastIsoDir || 'SE');
    unit._lastIsoDir = dir;
    const facingRight = dir === 'SE' || dir === 'NE';

    const animTime = (unit.animTime ?? gameTime) + (unit.id || 0) * 0.17;
    const baseScale = unit.isT101s ? 1.32 : unit.isWraith ? 1.22 : unit.childScale || 1.0;
    const cfg = UNIT_STATES[animState] || UNIT_STATES.idle;
    const frameIndex = Math.floor(animTime * cfg.fps) % cfg.frames;
    const row = this.rowIndex.get(`${animState}:${dir}`) ?? 0;
    const atlas = this.getAtlas(factionColor);

    const physZ = Math.max(0, unit.z || 0);
    const hoverOffset =
      -physZ +
      (unit.skySoar || unit.isWraith || unit.mountType === 'drake' || unit.bender === 'air'
        ? -18 + Math.sin(gameTime * 4 + (unit.id || 0)) * 4
        : (unit.kataTimer || 0) > 0
        ? -Math.abs(Math.sin(gameTime * 10)) * 16
        : 0);

    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    if (unit.isShadowClone) {
      ctx.globalAlpha = 0.68 + Math.sin(gameTime * 12 + (unit.id || 0)) * 0.15;
    }

    const shadowShrink = Math.max(0.32, 1 - Math.abs(Math.min(0, hoverOffset)) / 95);
    ctx.fillStyle = `rgba(10, 14, 18, ${(0.26 * shadowShrink).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 2, 11.5 * baseScale * shadowShrink, 4.8 * baseScale * shadowShrink, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, hoverOffset);

    if (unit.mountType) {
      const saddleOffsetY = this.drawPrehistoricMount(ctx, unit, facingRight, baseScale, gameTime);
      ctx.translate(0, saddleOffsetY);
    }

    const dw = this.cellWidth * baseScale;
    const dh = this.cellHeight * baseScale;

    if ((unit.dodgeAnim || 0) > 0.04) {
      const f = facingRight ? 1 : -1;
      for (let g = 2; g >= 1; g--) {
        ctx.save();
        ctx.globalAlpha = 0.22 * (3 - g);
        ctx.drawImage(
          atlas,
          frameIndex * this.cellWidth,
          row * this.cellHeight,
          this.cellWidth,
          this.cellHeight,
          Math.round(-dw * 0.5 - f * g * 11 * baseScale),
          Math.round(-dh + 8 * baseScale),
          dw,
          dh
        );
        ctx.restore();
      }
    }

    if (unit.isT101s) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 1, 16, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (unit.controlledByRing) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const isTumblingAir = Boolean(unit._isThrownProjectile) || ((unit.z || 0) > 10 && Math.hypot(unit.kx || 0, unit.ky || 0) > 65);
    const isLimping = (unit._legCrippleTimer || 0) > 0 && Math.hypot(unit.vx || 0, unit.vy || 0) > 2;
    const hasBodyRot = (unit.kataTimer || 0) > 0 || (unit._knockdownTimer || 0) > 0 || (unit._rollRecoveryTimer || 0) > 0 || isTumblingAir || isLimping;
    if (hasBodyRot) {
      ctx.save();
      const signF = facingRight ? 1 : -1;
      let bodyAngle = 0;
      if ((unit._knockdownTimer || 0) > 0) {
        bodyAngle = -signF * Math.PI * 0.46;
        ctx.translate(0, -dh * 0.18);
      } else if ((unit._rollRecoveryTimer || 0) > 0) {
        bodyAngle = (unit._rollRecoveryTimer / 0.75) * Math.PI * 2 * signF;
        ctx.translate(0, -dh * 0.42);
      } else if (isTumblingAir) {
        bodyAngle = (gameTime * 16 + (unit.id || 0)) * signF;
        ctx.translate(0, -dh * 0.45);
      } else if (isLimping) {
        const stepPhase = Math.sin(gameTime * 8.5 + (unit.id || 0));
        bodyAngle = stepPhase > 0 ? 0.22 * signF : -0.06 * signF;
        const limpDrop = stepPhase > 0 ? 4.2 * baseScale : 0;
        ctx.translate(0, -dh * 0.35 + limpDrop);
      } else {
        bodyAngle = gameTime * 14 * signF;
        ctx.translate(0, -dh * 0.45);
      }
      ctx.rotate(bodyAngle);
      ctx.drawImage(
        atlas,
        frameIndex * this.cellWidth,
        row * this.cellHeight,
        this.cellWidth,
        this.cellHeight,
        Math.round(-dw * 0.5),
        Math.round(-dh * 0.55 + 8 * baseScale),
        dw,
        dh
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        atlas,
        frameIndex * this.cellWidth,
        row * this.cellHeight,
        this.cellWidth,
        this.cellHeight,
        Math.round(-dw * 0.5),
        Math.round(-dh + 8 * baseScale),
        dw,
        dh
      );
    }

    if ((unit.carryAmount || 0) > 0 && unit.gatherType) {
      drawCarriedResource(ctx, 0, 0, unit.gatherType, facingRight);
    }

    drawUnitCombatAndBendingFX(ctx, unit, facingRight, baseScale, gameTime);

    if (unit.hp < unit.maxHp || unit.isT101s) {
      const hpRatio = Math.max(0, Math.min(1, (unit.hp || 1) / (unit.maxHp || 1)));
      const bw = unit.isT101s ? 30 : 24;
      const by = -dh + 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-bw * 0.5, by, bw, 4.5);
      ctx.fillStyle = isEnemy ? '#ef4444' : unit.isT101s ? '#fbbf24' : '#22c55e';
      ctx.fillRect(-bw * 0.5 + 0.5, by + 0.5, (bw - 1) * hpRatio, 3.5);
    }

    if (showBadges && (unit.isT101s || unit.isWraith) && unit.name) {
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = unit.isWraith ? '#c7d2fe' : '#fde68a';
      ctx.fillText(unit.name, 0, -dh - 6);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 2. 2.5D RIGID-BODY, MARTIAL REFLEXES & ENVIRONMENTAL PHYSICS ENGINE
 * ========================================================================== */

export class SovereignPhysicsEngine {
  constructor() {
    this.gravity = 580;
    this.restitution = 0.34;
    this.camShakeX = 0;
    this.camShakeY = 0;
    this.camShakeIntensity = 0;
    this.dustRings = [];
      this.seismicWaves = [];
      this.rockDebris = [];
    this.stoneSpires = [];
  }

  getUnitMass(u) {
    if (!u) return 1.0;
    if (u.isBoss) return 10.0;
    if (u.isT101s) return 3.5;
      if (u.bender === 'earth') return 2.3;
    if (u.isWraith) return 2.8;
    if (u.fightingStyle === 'juggernaut') return 2.4;
    if (u.fightingStyle === 'phalanx') return 1.9;
    if (u.childScale && u.childScale < 0.85) return 0.6;
    return 1.0;
  }

  addCameraShake(amount = 6) {
    this.camShakeIntensity = Math.min(18, this.camShakeIntensity + amount);
  }

  spawnLandingDust(x, y, strength = 1.0, color = 'rgba(214, 195, 165, 0.55)') {
    if (this.dustRings.length > 48) this.dustRings.shift();
    this.dustRings.push({
      x,
      y,
      radius: 4,
      maxRadius: Math.min(48, 12 + strength * 16),
      life: 0.42,
      maxLife: 0.42,
      color,
    });
  }

  triggerCombatReflexOnImpact(game, target, fromX, fromY, force) {
    if (!target) return 'hit';
    const style = target.fightingStyle;
    const roll = Math.random();

    const dodgeChance =
      style === 'kungfu' || target.bender === 'air'
        ? 0.42
        : target.isT101s || style === 'berserker'
        ? 0.30
        : 0.16;

    const blockChance =
      style === 'phalanx' || target.bender === 'earth' || target.bender === 'water'
        ? 0.48
        : target.isT101s || style === 'onering'
        ? 0.35
        : 0.20;

    if (roll < dodgeChance && (target.dodgeAnim || 0) <= 0) {
      target.dodgeAnim = 0.38;
      const dx = wrapDX(fromX, target.x);
      const dy = target.y - fromY;
      const len = Math.max(1, Math.hypot(dx, dy));
      const perpX = -dy / len;
      const perpY = dx / len;
      const side = (target.id || 0) % 2 === 0 ? 1 : -1;
      target.kx = (target.kx || 0) + perpX * side * 145;
      target.ky = (target.ky || 0) + perpY * side * 145;
      target.vz = Math.max(target.vz || 0, 110);
      this.spawnLandingDust(target.x, target.y, 0.7);
      return 'dodged';
    }

    if (roll < dodgeChance + blockChance && (target.blockAnim || 0) <= 0) {
      target.blockAnim = 0.42;
      if (Array.isArray(game.parryRings) && game.parryRings.length < 30) {
        game.parryRings.push({
          x: target.x,
          y: target.y - 14,
          radius: 4,
          maxRadius: 28,
          life: 0.28,
          color: target.bender === 'water' || style === 'phalanx' ? '#38bdf8' : '#facc15',
        });
      }
      if (Array.isArray(game.clashSparks) && game.clashSparks.length < 60) {
        for (let s = 0; s < 4; s++) {
          game.clashSparks.push({
            x: target.x + (Math.random() - 0.5) * 16,
            y: target.y - 12 + (Math.random() - 0.5) * 12,
            life: 0.22,
            color: target.bender === 'water' ? '#bae6fd' : '#fef08a',
          });
        }
      }
      return 'blocked';
    }

    return 'hit';
  }

  triggerEarthbenderSeismicStomp(game, caster) {
    if (!caster || !game) return;
    this.camShakeIntensity = Math.max(this.camShakeIntensity || 0, 5.5);
    this.seismicWaves.push({
      x: caster.x,
      y: caster.y,
      radius: 8,
      maxRadius: 96,
      life: 0.55,
      maxLife: 0.55,
      ownerTeam: caster.team,
    });
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.4;
      const spd = 45 + Math.random() * 65;
      this.rockDebris.push({
        x: caster.x + Math.cos(ang) * 10,
        y: caster.y + Math.sin(ang) * 6,
        z: 2 + Math.random() * 6,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.55,
        vz: 85 + Math.random() * 75,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 8,
        life: 0.7 + Math.random() * 0.35,
        maxLife: 1.05,
      });
    }
    for (let i = 0; i < 4; i++) {
      const ang = (Math.PI * 2 * i) / 4 + (Math.random() - 0.5) * 0.5;
      const dist = 22 + Math.random() * 28;
      this.stoneSpires.push({
        x: caster.x + Math.cos(ang) * dist,
        y: caster.y + Math.sin(ang) * dist * 0.55,
        width: 11 + Math.random() * 7,
        maxHeight: 26 + Math.random() * 22,
        life: 1.15,
        maxLife: 1.15,
        isLava: false,
      });
    }
    if (game.spatialGrid) {
      const nearby = game.spatialGrid.query(caster.x, caster.y, 96);
      for (const entity of nearby) {
        if (!entity || entity === caster || entity._isBuilding || entity.invincible) continue;
        if (entity.team && caster.team && entity.team === caster.team) continue;
        const dx = wrapDX(entity.x, caster.x);
        const dy = entity.y - caster.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist <= 96) {
          const falloff = 1 - dist / 96;
          const mass = this.getUnitMass(entity);
          const push = (140 * falloff) / mass;
          entity.kx = (entity.kx || 0) + (dx / dist) * push;
          entity.ky = (entity.ky || 0) + (dy / dist) * push * 0.6;
          entity.vz = Math.max(entity.vz || 0, (110 * falloff) / mass);
        }
      }
    }
  }

  stepWorldPhysics(game, dt, footpaths) {
    const totalDt = Math.min(0.05, Math.max(0.001, dt));
    const clampedDt = totalDt;
    const subSteps = 2;
    const subDt = totalDt / subSteps;

    if (Array.isArray(game.worldBosses)) {
      for (const b of game.worldBosses) {
        if (b && b.y > 3100) {
          b.y = 2280 + ((b.id || 0) % 3) * 140;
        }
      }
    }
    // Rare bending (~8%) is managed by SovereignWorldOrderEngine
    
    if (this.camShakeIntensity > 0.1) {
      this.camShakeIntensity *= Math.exp(-clampedDt * 12);
      const angle = Math.random() * Math.PI * 2;
      this.camShakeX = Math.cos(angle) * this.camShakeIntensity;
      this.camShakeY = Math.sin(angle) * this.camShakeIntensity;
    } else {
      this.camShakeIntensity = 0;
      this.camShakeX = 0;
      this.camShakeY = 0;
    }

    for (let i = this.dustRings.length - 1; i >= 0; i--) {
      const r = this.dustRings[i];
      r.life -= clampedDt;
      if (r.life <= 0) {
        this.dustRings.splice(i, 1);
      } else {
        const t = 1 - r.life / r.maxLife;
        r.radius = 4 + (r.maxRadius - 4) * t;
      }
    }

    for (let i = this.seismicWaves.length - 1; i >= 0; i--) {
      const w = this.seismicWaves[i];
      w.life -= clampedDt;
      if (w.life <= 0) {
        this.seismicWaves.splice(i, 1);
      } else {
        const t = 1 - w.life / w.maxLife;
        w.radius = 8 + (w.maxRadius - 8) * (1 - Math.pow(1 - t, 2));
      }
    }
    for (let i = this.stoneSpires.length - 1; i >= 0; i--) {
      const s = this.stoneSpires[i];
      s.life -= clampedDt;
      if (s.life <= 0) this.stoneSpires.splice(i, 1);
    }

    for (let i = this.rockDebris.length - 1; i >= 0; i--) {
      const p = this.rockDebris[i];
      p.life -= clampedDt;
      if (p.life <= 0) {
        this.rockDebris.splice(i, 1);
      } else {
        p.x = wrapX(p.x + p.vx * clampedDt, WORLD_W);
        p.y += p.vy * clampedDt;
        p.vz -= 280 * clampedDt;
        p.z += p.vz * clampedDt;
        if (p.z < 0) {
          p.z = 0;
          p.vz = -p.vz * 0.35;
          p.vx *= 0.65;
          p.vy *= 0.65;
        }
        p.rot += p.vrot * clampedDt;
      }
    }

    if (Array.isArray(game.blackHoles) && game.blackHoles.length > 0 && game.spatialGrid) {
      for (const bh of game.blackHoles) {
        const pullR = (bh.radius || 52) * 3.6;
        const nearby = game.spatialGrid.query(bh.x, bh.y, pullR);
        for (const entity of nearby) {
          if (!entity || entity._isBuilding || entity.invincible) continue;
          const dx = wrapDX(entity.x, bh.x);
          const dy = bh.y - entity.y;
          const dist = Math.max(12, Math.hypot(dx, dy));
          if (dist > pullR) continue;

          const normX = dx / dist;
          const normY = dy / dist;
          const falloff = 1 - dist / pullR;
          const swirlForce = 210 * falloff;
          const inwardForce = 180 * falloff * falloff;

          entity.kx = (entity.kx || 0) + (normX * inwardForce - normY * swirlForce) * clampedDt * 8;
          entity.ky = (entity.ky || 0) + (normY * inwardForce + normX * swirlForce) * clampedDt * 8;

          if (dist < (bh.radius || 52) * 1.4) {
            entity.vz = Math.max(entity.vz || 0, 85 * falloff);
          }
        }
      }
    }

    const allUnits = [];
    if (Array.isArray(game.villagers)) {
      for (const u of game.villagers) allUnits.push(u);
    }
    if (Array.isArray(game.enemies)) {
      for (const e of game.enemies) allUnits.push(e);
    }

    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
        if (!u) continue;
        if (u._seismicCooldown > 0) u._seismicCooldown = Math.max(0, u._seismicCooldown - clampedDt);
        if (u._fireCastCooldown > 0) u._fireCastCooldown = Math.max(0, u._fireCastCooldown - clampedDt); if (u._airCastCooldown > 0) u._airCastCooldown = Math.max(0, u._airCastCooldown - clampedDt); const _hasThreat = u.state === 'attack' || u.state === 'fight' || (u._outnumberedCount || 0) >= 1 || (u.kataTimer || 0) > 0; const _hasBio = u.isT101s || ((u.energy ?? 80) >= 24 && (u.hunger ?? 20) <= 78 && (u.chi ?? 8) >= 1 && (u.o2Breath ?? 100) >= 25); const wisEff = Math.max(0.55, 1.15 - ((u.wisdom || 10) * 0.02)); if (u.bender === 'earth' && (u.hp || 1) > 0 && _hasThreat && (u.z || 0) <= 4 && !u._inRiverWater && !(u._seismicCooldown > 0)) { if (!_hasBio) { u._consequenceTag = '🫁 Exhausted (Low ATP/O₂) — Must Breathe, Rest & Eat!'; } else { if (!u.isT101s) { u.energy = Math.max(0, (u.energy ?? 80) - 16 * wisEff); u.o2Breath = Math.max(0, (u.o2Breath ?? 100) - 22 * wisEff); u.chi = Math.max(0, (u.chi ?? 8) - 1); u.hunger = Math.min(100, (u.hunger ?? 20) + 12 * wisEff); } game._worldOrder?.spawnElementalSourceDraw?.(game, u, u.bender);
          u._seismicCooldown = 0.95;
          this.triggerEarthbenderSeismicStomp(game, u); }
        }
      if (u.bender === 'air' && (u.hp || 1) > 0 && _hasThreat && !(u._airCastCooldown > 0)) { if (!_hasBio || (!u.isT101s && (u.o2Breath ?? 100) < 25)) { u._consequenceTag = '🫁 Exhausted (Low ATP/O₂) — Must Breathe, Rest & Eat!'; } else { u._airCastCooldown = 0.95; u.dodgeAnim = 0.30; u.vz = Math.max(u.vz || 0, 85); if (!u.isT101s) { u.energy = Math.max(0, (u.energy ?? 80) - 16 * wisEff); u.o2Breath = Math.max(0, (u.o2Breath ?? 100) - 22 * wisEff); u.chi = Math.max(0, (u.chi ?? 8) - 1); u.hunger = Math.min(100, (u.hunger ?? 20) + 12 * wisEff); } game._worldOrder?.spawnElementalSourceDraw?.(game, u, u.bender); } } if (u.bender === 'fire' && (u.hp || 1) > 0 && _hasThreat && !(u._fireCastCooldown > 0)) { if (!_hasBio) { u._consequenceTag = '🫁 Exhausted (Low ATP/O₂) — Must Breathe, Rest & Eat!'; } else { u._fireCastCooldown = 0.95; u._firePowerScale = (game._worldOrder?.weatherMode === 'Rain' || game.weatherMode === 'Rain') ? 0.58 : 1; if (!u.isT101s) { u.energy = Math.max(0, (u.energy ?? 80) - 16 * wisEff); u.o2Breath = Math.max(0, (u.o2Breath ?? 100) - 22 * wisEff); u.chi = Math.max(0, (u.chi ?? 8) - 1); u.hunger = Math.min(100, (u.hunger ?? 20) + 12 * wisEff); } game._worldOrder?.spawnElementalSourceDraw?.(game, u, u.bender);
        u.swingAnim = 0.42 * (u._firePowerScale || 1); }
      }
      if (!u) continue;

      if ((u.blockAnim || 0) > 0) u.blockAnim = Math.max(0, u.blockAnim - clampedDt);
      if ((u.dodgeAnim || 0) > 0) u.dodgeAnim = Math.max(0, u.dodgeAnim - clampedDt);

      if ((u.state === 'attack' || u.state === 'fight') && (u.blockAnim || 0) <= 0 && (u.dodgeAnim || 0) <= 0) {
        if (Math.random() < clampedDt * 0.65) {
          if (u.fightingStyle === 'phalanx' || u.bender === 'earth' || u.bender === 'water') {
            u.blockAnim = 0.35;
          } else if (u.fightingStyle === 'kungfu' || u.bender === 'air') {
            u.dodgeAnim = 0.30;
            u.vz = Math.max(u.vz || 0, 85);
          }
        }
      }

      if (typeof u.z !== 'number') u.z = 0;
      if (typeof u.vz !== 'number') u.vz = 0;

      const gAccel = Math.max(520, this.gravity || 520);
        const muSurface = u._inRiverWater ? 0.55 : (footpaths && footpaths.getWearAt(u.x, u.y) >= 0.45) ? 0.48 : 0.35;
        for (let st = 0; st < subSteps; st++) {
          if ((u.z || 0) <= 0.5) {
            const surfDecay = Math.exp(-muSurface * 8 * subDt);
            if (typeof u.kx === 'number') u.kx *= surfDecay;
            if (typeof u.ky === 'number') u.ky *= surfDecay;
          }
          if (u.z > 0 || u.vz !== 0) {
            u.vz -= gAccel * subDt;
            u.vz *= Math.exp(-0.22 * subDt);
            u.z += u.vz * subDt;

            if (u.z <= 0) {
              u.z = 0;
              if (u.vz < -95) {
                const impactSpeed = Math.abs(u.vz);
                u.vz = impactSpeed * this.restitution;
                this.spawnLandingDust(u.x, u.y, impactSpeed / 220);
                if (impactSpeed > 155) {
                  const fallDmg = Math.max(8, Math.round((impactSpeed - 140) * 0.14));
                  u.hp = Math.max(0, (u.hp || 100) - fallDmg);
                  u._knockdownTimer = Math.max(u._knockdownTimer || 0, 1.35);
                  u._consequenceTag = '⛰️ Hard Fall Impact (-' + fallDmg + ' HP)!';
                }
              } else {
                u.vz = 0;
              }
            }
          }
        }

      const inRiverBand = Math.abs(u.y - RIVER_Y) < 42;
        let onBridge = false;
        let nearestBr = null;
        let nearestBrDist = Infinity;
        if (inRiverBand && Array.isArray(game.stoneBridges)) {
          for (const br of game.stoneBridges) {
            const dxBr = Math.abs(wrapDX(u.x, br.x));
            if (dxBr < nearestBrDist) {
              nearestBrDist = dxBr;
              nearestBr = br;
            }
            if (dxBr < 46) {
              onBridge = true;
              break;
            }
          }
          if (!onBridge && nearestBr && nearestBrDist < 110) {
            const toBrX = wrapDX(u.x, nearestBr.x);
            const funnelPull = (1 - nearestBrDist / 110) * 65 * clampedDt;
            u.x += (toBrX >= 0 ? 1 : -1) * Math.min(Math.abs(toBrX), funnelPull);
          }
        }

      u._inRiverWater = (inRiverBand && !onBridge && !u.skySoar && u.z < 4) || Boolean(u.inWater);
      if (u._inRiverWater) {
        if (u.bender === 'water' || u.waterBendingSurf) {
          u.x = wrapX(u.x + (u.vx || 0) * 0.25 * clampedDt, WORLD_W);
        } else {
          u.x = wrapX(u.x + 26 * clampedDt - (u.vx || 0) * 0.22 * clampedDt, WORLD_W);
          u.y -= (u.vy || 0) * 0.22 * clampedDt;
        }
      }

      if (footpaths && !u._inRiverWater && u.z === 0) {
        const wear = footpaths.getWearAt(u.x, u.y);
        if (wear >= 0.45) {
          const boost = wear >= 0.68 ? 0.18 : 0.10;
          u.x = wrapX(u.x + (u.vx || 0) * boost * clampedDt, WORLD_W);
          u.y += (u.vy || 0) * boost * clampedDt;
        }
      }

      if (!u.skySoar && u.z < 20 && u.y > 1672 && u.y < 1720) {
        let onRamp = false;
        if (Array.isArray(game.cliffRamps)) {
          for (const ramp of game.cliffRamps) {
            if (Math.abs(wrapDX(u.x, ramp.x)) < 54) {
              onRamp = true;
              break;
            }
          }
        }
        if (!onRamp) {
          if (u.y < 1696) u.y = 1672;
          else u.y = 1720;
          u.ky = -(u.ky || 0) * 0.4;
        }
      }
    }
  }

  resolveMassCollisions(game, u, dt) {
    if (!game.spatialGrid || !u || u.isT101s) return;
    const neighbors = game.spatialGrid.query(u.x, u.y, 48);
    const massA = this.getUnitMass(u);
    const radA = u.radius || (u.isT101s ? 14 : 10);

    for (let i = 0; i < neighbors.length; i++) {
      const other = neighbors[i];
      if (!other || other === u) continue;

      const dx = wrapDX(other.x, u.x);
      const dy = u.y - other.y;
      const dist = Math.hypot(dx, dy);

      if (other._isBuilding) {
        const minSep = radA + (other.radius || 32);
        if (dist < minSep && dist > 0.001) {
          const overlap = minSep - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          u.x = wrapX(u.x + nx * overlap, WORLD_W);
          u.y += ny * overlap;

          const vn = (u.vx || 0) * nx + (u.vy || 0) * ny;
          if (vn < 0) {
            u.vx -= vn * nx * 1.02;
            u.vy -= vn * ny * 1.02;
            const tangX = -ny;
            const tangY = nx;
            const vt = (u.vx || 0) * tangX + (u.vy || 0) * tangY;
            const slideSign = vt >= 0 ? 1 : -1;
            const slidePush = Math.abs(vn) * 0.35 * slideSign;
            u.vx += tangX * slidePush;
            u.vy += tangY * slidePush;
          }
        }
      } else {
        if (Math.abs((u.z || 0) - (other.z || 0)) > 24) continue;
        const radB = other.radius || (other.isT101s ? 14 : 10);
        const minSep = radA + radB;
        if (dist < minSep && dist > 0.001) {
          const overlap = minSep - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const massB = this.getUnitMass(other);
          const totalMass = massA + massB;
          const shareA = massB / totalMass;
          const shareB = massA / totalMass;

          u.x = wrapX(u.x + nx * overlap * shareA * 0.55, WORLD_W);
          u.y += ny * overlap * shareA * 0.55;
          other.x = wrapX(other.x - nx * overlap * shareB * 0.55, WORLD_W);
          other.y -= ny * overlap * shareB * 0.55;
          const vAx = (u.vx || 0) + (u.kx || 0);
          const vAy = (u.vy || 0) + (u.ky || 0);
          const vBx = (other.vx || 0) + (other.kx || 0);
          const vBy = (other.vy || 0) + (other.ky || 0);
          const closingSpeed = -((vAx - vBx) * nx + (vAy - vBy) * ny);
          if (closingSpeed > 55) {
            const e = 0.65;
            const J = ((1 + e) * closingSpeed) / (1 / massA + 1 / massB);
            u.kx = (u.kx || 0) + nx * (J / massA);
            u.ky = (u.ky || 0) + ny * (J / massA);
            other.kx = (other.kx || 0) - nx * (J / massB);
            other.ky = (other.ky || 0) - ny * (J / massB);
            if ((u._knockdownTimer || 0) > 0 || Math.hypot(u.kx || 0, u.ky || 0) > 95) {
              other._knockdownTimer = Math.max(other._knockdownTimer || 0, 1.15);
              other.hp = Math.max(0, (other.hp || 100) - 14);
              other._consequenceTag = '🎳 Domino Momentum Transfer (-14 HP)!';
            }
          }
        }
      }
    }
  }

  drawPhysicsVFX(ctx, game, invTilt = 1) {
    if (this.dustRings.length === 0 && this.seismicWaves.length === 0 && this.rockDebris.length === 0 && this.stoneSpires.length === 0) return;
    const viewHalfW = (game.canvas.width * 0.65) / game.cam.zoom;

    ctx.save();
    for (const r of this.dustRings) {
      const sx = wrapDX(game.cam.x, r.x);
      if (Math.abs(sx) > viewHalfW + 80) continue;
      const sy = r.y - game.cam.y;
      const alpha = Math.max(0, (r.life / r.maxLife) * 0.55);

      ctx.strokeStyle = `rgba(214, 195, 165, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r.radius, r.radius * 0.45 * invTilt, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const w of this.seismicWaves) {
      const sx = wrapDX(game.cam.x, w.x);
      if (Math.abs(sx) > viewHalfW + 120) continue;
      const sy = w.y - game.cam.y;
      const alpha = Math.max(0, (w.life / w.maxLife) * 0.72);
      ctx.strokeStyle = `rgba(186, 138, 82, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w.radius, w.radius * 0.46 * invTilt, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.rockDebris) {
      const sx = wrapDX(game.cam.x, p.x);
      if (Math.abs(sx) > viewHalfW + 80) continue;
      const sy = p.y - game.cam.y - (p.z || 0) * invTilt;
      const alpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.4)));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = `rgba(122, 102, 82, ${alpha.toFixed(3)})`;
      ctx.strokeStyle = `rgba(62, 50, 38, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      const s = p.size || 4;
      ctx.fillRect(-s * 0.5, -s * 0.5, s, s * 0.85);
      ctx.strokeRect(-s * 0.5, -s * 0.5, s, s * 0.85);
      ctx.restore();
    }
    for (const sp of this.stoneSpires) {
      const sx = wrapDX(game.cam.x, sp.x);
      if (Math.abs(sx) > viewHalfW + 80) continue;
      const sy = sp.y - game.cam.y;
      const progress = 1 - Math.max(0, sp.life) / sp.maxLife;
      const rise = Math.min(1, progress / 0.18);
      const sink = sp.life < 0.35 ? Math.max(0, sp.life / 0.35) : 1;
      const h = sp.maxHeight * rise * sink;
      const alpha = Math.max(0, Math.min(1, sp.life / (sp.maxLife * 0.3)));
      ctx.save();
      ctx.globalAlpha *= alpha;
      drawIsometricRockMonolith(ctx, sx, sy, sp.width, h, sp.isLava);
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ============================================================================
 * 3. SOVEREIGN POWERS & COMBAT VFX OVERLAY (`renderCombatAndArrowVFX` Upgrade)
 * ========================================================================== */

export class CombatAndPowersVFXRenderer {
  drawEnhancedCombatVFX(ctx, game, invTilt = 1) {
    const timeSec = game.time || 0;
    const viewHalfW = (game.canvas.width * 0.65) / game.cam.zoom;
    const hero = Array.isArray(game.villagers) ? game.villagers.find((u) => u.isT101s) : null;

    if ((game.globalTimeSlowTimer || 0) > 0 && hero) {
      const hx = wrapDX(game.cam.x, hero.x);
      const hy = hero.y - game.cam.y;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(1, invTilt);

      const domeR = 260 + Math.sin(timeSec * 3) * 10;
      const grad = ctx.createRadialGradient(0, 0, domeR * 0.2, 0, 0, domeR);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.0)');
      grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.10)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0.32)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, domeR, domeR * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 12; i++) {
        const a = timeSec * 0.4 + (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (domeR - 12), Math.sin(a) * (domeR - 12) * 0.6);
        ctx.lineTo(Math.cos(a) * domeR, Math.sin(a) * domeR * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (hero && (hero.bloodbendTarget || game.bloodbendActive)) {
      const hx = wrapDX(game.cam.x, hero.x);
      const hy = hero.y - game.cam.y;
      const targets = [];
      if (hero.bloodbendTarget && typeof hero.bloodbendTarget === 'object') {
        targets.push(hero.bloodbendTarget);
      } else if (Array.isArray(game.enemies)) {
        for (const e of game.enemies) {
          if (Math.abs(wrapDX(hero.x, e.x)) < 260 && Math.abs(hero.y - e.y) < 220) {
            targets.push(e);
            if (targets.length >= 4) break;
          }
        }
      }

      ctx.save();
      for (const t of targets) {
        const tx = wrapDX(game.cam.x, t.x);
        const ty = t.y - game.cam.y;
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.82)';
        ctx.lineWidth = 1.8;
        for (let strand = -1; strand <= 1; strand++) {
          ctx.beginPath();
          ctx.moveTo(hx, hy - 22 * invTilt);
          ctx.quadraticCurveTo(
            (hx + tx) * 0.5 + strand * 18,
            Math.min(hy, ty) - (42 + Math.sin(timeSec * 8 + strand) * 8) * invTilt,
            tx + strand * 5,
            ty - 16 * invTilt
          );
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
        ctx.beginPath();
        ctx.ellipse(tx, ty, 16, 7 * invTilt, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (Array.isArray(game.blackHoles)) {
      for (const bh of game.blackHoles) {
        const bx = wrapDX(game.cam.x, bh.x);
        if (Math.abs(bx) > viewHalfW + 180) continue;
        const by = bh.y - game.cam.y;
        const r = bh.radius || 52;

        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(1, invTilt);

        const halo = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r * 1.65);
        halo.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
        halo.addColorStop(0.38, 'rgba(88, 28, 135, 0.85)');
        halo.addColorStop(0.68, 'rgba(217, 70, 239, 0.45)');
        halo.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
        ctx.fill();

        for (let arm = 0; arm < 4; arm++) {
          const startA = -timeSec * 5.5 + (arm * Math.PI) / 2;
          ctx.strokeStyle = arm % 2 === 0 ? 'rgba(244, 114, 182, 0.78)' : 'rgba(56, 189, 248, 0.72)';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.15, r * 0.58, 0.25, startA, startA + 1.85);
          ctx.stroke();
        }

        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#f0abfc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }
    }

    if (Array.isArray(game.fallingMeteors)) {
      for (const m of game.fallingMeteors) {
        const tx = wrapDX(game.cam.x, m.targetX ?? m.x);
        if (Math.abs(tx) > viewHalfW + 240) continue;
        const ty = (m.targetY ?? m.y) - game.cam.y;
        const prog = Math.max(0, Math.min(1, m.progress ?? 0.5));

        ctx.save();
        ctx.strokeStyle = `rgba(249, 115, 22, ${(0.35 + prog * 0.55).toFixed(3)})`;
        ctx.fillStyle = `rgba(220, 38, 38, ${(0.12 + prog * 0.22).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(tx, ty, 38 * (0.4 + prog * 0.6), 18 * (0.4 + prog * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const mx = wrapDX(game.cam.x, m.x);
        const my = m.y - game.cam.y;

        const tailGrad = ctx.createLinearGradient(mx, my, mx - 55, my - 95 * invTilt);
        tailGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
        tailGrad.addColorStop(0.4, 'rgba(249, 115, 22, 0.75)');
        tailGrad.addColorStop(1, 'rgba(124, 45, 18, 0.0)');
        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - 55, my - 95 * invTilt);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(mx - 2, my - 2, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (Array.isArray(game.slashRibbons)) {
      for (const s of game.slashRibbons) {
        const sx = wrapDX(game.cam.x, s.x);
        if (Math.abs(sx) > viewHalfW + 80) continue;
        const sy = s.y - game.cam.y;
        const f = s.facing || 1;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, invTilt);

        ctx.strokeStyle = s.color || '#38bdf8';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(f * 6, -15, 19, f > 0 ? -1.05 : Math.PI - 0.85, f > 0 ? 0.85 : Math.PI + 1.05);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(f * 6, -15, 18.5, f > 0 ? -0.85 : Math.PI - 0.65, f > 0 ? 0.65 : Math.PI + 0.85);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

/* ============================================================================
 * 4. EARTH SURFACE BIOME & 24% MOUNTAIN RENDERER (71% Ocean / 29% Land)
 * ========================================================================== */

export class EarthBiomeRenderer {
  constructor() {
    this.peakCache = new Map();
    this.biomeStampCache = new Map();
  }
  getBiomeStampCanvas(key) {
    if (this.biomeStampCache.has(key)) return this.biomeStampCache.get(key);
    const size = 256;
    const half = size * 0.5;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    let grad;
    if (key === 'coastalSea') {
      grad = ctx.createRadialGradient(half, half, half * 0.15, half, half, half);
      grad.addColorStop(0, 'rgba(3, 105, 161, 0.88)');
      grad.addColorStop(0.7, 'rgba(2, 132, 199, 0.68)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    } else if (key === 'deepOcean') {
      grad = ctx.createRadialGradient(half, half, half * 0.15, half, half, half);
      grad.addColorStop(0, 'rgba(12, 74, 110, 0.94)');
      grad.addColorStop(0.75, 'rgba(3, 105, 161, 0.75)');
      grad.addColorStop(1, 'rgba(3, 105, 161, 0.0)');
    } else {
      const biomePalette = {
        forest: ['rgba(20, 62, 32, 0.58)', 'rgba(30, 86, 49, 0.28)', 'rgba(30, 86, 49, 0.0)'],
        grassland: ['rgba(107, 142, 35, 0.45)', 'rgba(132, 169, 66, 0.20)', 'rgba(132, 169, 66, 0.0)'],
        desert: ['rgba(212, 163, 106, 0.72)', 'rgba(194, 162, 107, 0.38)', 'rgba(194, 162, 107, 0.0)'],
        agriUrban: ['rgba(132, 169, 66, 0.38)', 'rgba(180, 148, 72, 0.18)', 'rgba(180, 148, 72, 0.0)'],
        iceTundra: ['rgba(226, 232, 240, 0.82)', 'rgba(203, 213, 225, 0.45)', 'rgba(203, 213, 225, 0.0)'],
      };
      const stops = biomePalette[key] || biomePalette.grassland;
      grad = ctx.createRadialGradient(half, half, half * 0.12, half, half, half);
      grad.addColorStop(0, stops[0]);
      grad.addColorStop(0.65, stops[1]);
      grad.addColorStop(1, stops[2]);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    this.biomeStampCache.set(key, c);
    return c;
  }


  getMountainPeakCanvas(biomeType = 'grassland') {
    if (this.peakCache.has(biomeType)) return this.peakCache.get(biomeType);

    const w = 140;
    const h = 110;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const cx = w * 0.5;
    const baseY = h - 14;

    ctx.fillStyle = 'rgba(10, 14, 20, 0.26)';
    ctx.beginPath();
    ctx.ellipse(cx + 12, baseY + 2, 54, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const palettes = {
      iceTundra: { left: '#cbd5e1', right: '#64748b', cap: '#f8fafc', ridge: '#e2e8f0' },
      desert: { left: '#d6a868', right: '#8c5e2a', cap: '#e7cba0', ridge: '#b47d3c' },
      forest: { left: '#57534e', right: '#292524', cap: '#cbd5e1', ridge: '#78716c' },
      agriUrban: { left: '#78716c', right: '#44403c', cap: '#e2e8f0', ridge: '#a8a29e' },
      grassland: { left: '#64748b', right: '#334155', cap: '#f1f5f9', ridge: '#94a3b8' },
    };
    const pal = palettes[biomeType] || palettes.grassland;

    ctx.fillStyle = pal.left;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 54, baseY);
    ctx.lineTo(cx - 4, baseY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.right;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 4, baseY + 6);
    ctx.lineTo(cx + 56, baseY - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.cap;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 21, 46);
    ctx.lineTo(cx - 8, 42);
    ctx.lineTo(cx - 2, 49);
    ctx.lineTo(cx + 9, 43);
    ctx.lineTo(cx + 22, 46);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.left;
    ctx.beginPath();
    ctx.moveTo(cx + 28, 38);
    ctx.lineTo(cx + 4, baseY + 4);
    ctx.lineTo(cx + 26, baseY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.right;
    ctx.beginPath();
    ctx.moveTo(cx + 28, 38);
    ctx.lineTo(cx + 26, baseY + 6);
    ctx.lineTo(cx + 62, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = pal.ridge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 4, 52);
    ctx.lineTo(cx - 4, baseY + 6);
    ctx.stroke();

    this.peakCache.set(biomeType, c);
    return c;
  }

  drawEarthBiomesInViewport(ctx, cam, canvasWidth, canvasHeight, invTilt = 1, timeSec = 0) {
    if (typeof getEarthTerrainAt !== 'function') return;

    const viewHalfW = (canvasWidth * 0.65) / cam.zoom;
    const viewHalfH = (canvasHeight * 0.65) / (cam.zoom * (cam.tiltScale || 1));
    const tCell = cam.zoom < 0.22 ? 1200 : cam.zoom < 0.65 ? 520 : 260;

    const minCol = Math.floor((cam.x - viewHalfW - tCell) / tCell);
    const maxCol = Math.ceil((cam.x + viewHalfW + tCell) / tCell);
    const minRow = Math.floor(Math.max(1714, cam.y - viewHalfH - tCell) / tCell);
    const maxRow = Math.ceil(Math.min(WORLD_H - 120, cam.y + viewHalfH + tCell) / tCell);

    ctx.save();

    for (let tr = minRow; tr <= maxRow; tr++) {
      const wy = tr * tCell + tCell * 0.5;
      if (Math.abs(wy - RIVER_Y) < 115) continue;
      const ty = tr * tCell - cam.y;

      for (let tc = minCol; tc <= maxCol; tc++) {
        const wx = wrapX(tc * tCell + tCell * 0.5, WORLD_W);
        const terr = getEarthTerrainAt(wx, wy);
        if (!terr) continue;

        const tx = wrapDX(cam.x, tc * tCell);
        const cx = tx + tCell * 0.5;
        const cy = ty + tCell * 0.5;
        const h = hash2D(tc, tr);

        if (terr.isOcean) {
          const radius = tCell * 0.78;
          const stamp = this.getBiomeStampCanvas(terr.label === 'Coastal Sea' ? 'coastalSea' : 'deepOcean');
          ctx.drawImage(stamp, cx - radius, cy - radius, radius * 2, radius * 2);

          if (cam.zoom >= 0.25 && h > 0.35) {
            const waveOffset = Math.sin(timeSec * 2.0 + tc * 0.7 + tr * 0.5) * 6;
            ctx.strokeStyle =
              terr.label === 'Coastal Sea'
                ? 'rgba(186, 230, 253, 0.42)'
                : 'rgba(125, 211, 252, 0.25)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(cx - 24 + waveOffset, cy);
            ctx.quadraticCurveTo(cx + waveOffset, cy - 5, cx + 24 + waveOffset, cy);
            ctx.stroke();
          }
          continue;
        }

        const radius = tCell * 0.82;
        const stamp = this.getBiomeStampCanvas(terr.type || 'grassland');
        ctx.drawImage(stamp, cx - radius, cy - radius, radius * 2, radius * 2);

        if (cam.zoom >= 0.32) {
          if (terr.type === 'agriUrban' && h > 0.35) {
            ctx.strokeStyle = 'rgba(217, 169, 56, 0.26)';
            ctx.lineWidth = 1.4;
            for (let f = -18; f <= 18; f += 9) {
              ctx.beginPath();
              ctx.moveTo(cx - 24, cy + f);
              ctx.lineTo(cx + 24, cy + f - 6);
              ctx.stroke();
            }
          } else if (terr.type === 'desert' && h > 0.3) {
            ctx.strokeStyle = 'rgba(161, 98, 7, 0.32)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(cx, cy + 8, 22, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          } else if (terr.type === 'forest' && h > 0.3) {
            ctx.fillStyle = 'rgba(22, 101, 52, 0.32)';
            ctx.beginPath();
            ctx.ellipse(cx - 12, cy + 4, 16, 8, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 14, cy - 6, 14, 7, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (terr.type === 'iceTundra' && h > 0.35) {
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(cx - 18, cy - 4);
            ctx.lineTo(cx + 18, cy + 6);
            ctx.stroke();
          }
        }

        if (terr.isMountain && cam.zoom >= 0.2) {
          const peakCanvas = this.getMountainPeakCanvas(terr.type);
          const scale = tCell / 260;
          const pw = peakCanvas.width * scale;
          const ph = peakCanvas.height * scale * invTilt;
          ctx.drawImage(peakCanvas, cx - pw * 0.5, cy - ph * 0.72, pw, ph);
        }
      }
    }

    ctx.restore();
  }

  drawGlobeEarthBreakdownHUD(ctx, canvasWidth, canvasHeight) {
    const cardW = 310;
    const cardH = 212;
    const x = 18;
    const y = Math.max(84, canvasHeight - cardH - 86);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🌍 EARTH SURFACE BREAKDOWN (71% WATER / 29% LAND)', x + 12, y + 20);

    const barX = x + 12;
    const barY = y + 28;
    const barW = cardW - 24;
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(barX, barY, Math.round(barW * 0.71), 10);
    ctx.fillStyle = '#4d7c0f';
    ctx.fillRect(barX + Math.round(barW * 0.71), barY, Math.round(barW * 0.29), 10);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 9.5px Inter, sans-serif';
    ctx.fillText('🌊 Oceans & Seas: 71%', barX + 4, barY + 21);
    ctx.fillText('⛰️ Land: 29% (24% Mountains)', barX + 148, barY + 21);

    const rows = [
      { icon: '🌲', name: 'Forests & Woodlands', land: '31%', earth: '9.0%', color: '#2e7d32' },
      { icon: '🌾', name: 'Grasslands & Savannas', land: '26%', earth: '7.5%', color: '#84cc16' },
      { icon: '🏜️', name: 'Deserts & Barren Land', land: '19%', earth: '5.5%', color: '#d97706' },
      { icon: '🏠', name: 'Agricultural & Urban', land: '14%', earth: '4.1%', color: '#eab308' },
      { icon: '❄️', name: 'Ice, Glaciers & Tundra', land: '10%', earth: '2.9%', color: '#cbd5e1' },
    ];

    let ry = barY + 38;
    for (const r of rows) {
      ctx.fillStyle = r.color;
      ctx.fillRect(barX, ry - 7, 8, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillText(`${r.icon} ${r.name}`, barX + 13, ry);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(`${r.land} land (${r.earth} Earth)`, x + cardW - 12, ry);
      ctx.textAlign = 'left';
      ry += 22;
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 5. ENVIRONMENT SPRITE BANK (Buildings, Trees, Bridges, Siege, War Galleys)
 * ========================================================================== */

const BUILDING_SPECS = {
  town_hall: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  citadel: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  house: { halfW: 26, halfH: 13, wallH: 20, roofH: 17, chimney: true, banner: false, isStone: false },
  hut: { halfW: 26, halfH: 13, wallH: 20, roofH: 17, chimney: false, banner: false, isStone: false },
  barracks: { halfW: 36, halfH: 18, wallH: 25, roofH: 16, chimney: false, banner: true, isStone: true },
  archery_range: { halfW: 34, halfH: 17, wallH: 22, roofH: 15, chimney: false, banner: true, isStone: false },
  stable: { halfW: 36, halfH: 18, wallH: 22, roofH: 16, chimney: false, banner: true, isStone: false },
  siege_workshop: { halfW: 38, halfH: 19, wallH: 26, roofH: 15, chimney: true, banner: true, isStone: true },
  forge: { halfW: 32, halfH: 16, wallH: 24, roofH: 14, chimney: true, banner: true, isStone: true },
  lumber_camp: { halfW: 32, halfH: 16, wallH: 20, roofH: 15, chimney: false, banner: true, isStone: false },
  sawmill: { halfW: 32, halfH: 16, wallH: 20, roofH: 15, chimney: false, banner: true, isStone: false },
  mining_camp: { halfW: 32, halfH: 16, wallH: 21, roofH: 14, chimney: true, banner: false, isStone: true },
  tower: { halfW: 20, halfH: 10, wallH: 42, roofH: 16, chimney: false, banner: true, isStone: true },
  farm: { halfW: 34, halfH: 17, wallH: 6, roofH: 4, chimney: false, banner: false, isStone: false },
  town_center: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  quarry: { halfW: 32, halfH: 16, wallH: 21, roofH: 14, chimney: true, banner: false, isStone: true },
  kitchen: { halfW: 28, halfH: 14, wallH: 20, roofH: 16, chimney: true, banner: false, isStone: false },
  shrine: { halfW: 30, halfH: 15, wallH: 28, roofH: 22, chimney: false, banner: true, isStone: true },
  wonder: { halfW: 46, halfH: 23, wallH: 40, roofH: 26, chimney: false, banner: true, isStone: true },
  stables: { halfW: 36, halfH: 18, wallH: 22, roofH: 16, chimney: false, banner: true, isStone: false },
  market: { halfW: 34, halfH: 17, wallH: 20, roofH: 16, chimney: false, banner: true, isStone: false },
  shipyard: { halfW: 36, halfH: 18, wallH: 20, roofH: 15, chimney: false, banner: true, isStone: false },
  gatehouse: { halfW: 34, halfH: 17, wallH: 28, roofH: 14, chimney: false, banner: true, isStone: true },
  wall: { halfW: 22, halfH: 11, wallH: 24, roofH: 4, chimney: false, banner: false, isStone: true },
};

function traceIsoDiamond(ctx, cx, cy, halfW, halfH) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
}

function drawIsoBox(ctx, cx, baseY, halfW, halfH, height, colors) {
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY);
  ctx.lineTo(cx, baseY + halfH);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.lineTo(cx - halfW, baseY - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = colors.outline || 'rgba(20, 16, 12, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx, baseY + halfH);
  ctx.lineTo(cx + halfW, baseY);
  ctx.lineTo(cx + halfW, baseY - height);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (colors.top) {
    ctx.fillStyle = colors.top;
    traceIsoDiamond(ctx, cx, baseY - height, halfW, halfH);
    ctx.fill();
    ctx.stroke();
  }
}

function drawIsoRoof(ctx, cx, wallTopY, halfW, halfH, ridgeHeight, colors) {
  const overhang = 4;
  const hw = halfW + overhang;
  const hh = halfH + overhang * 0.5;
  const ridgeY = wallTopY - ridgeHeight;

  ctx.fillStyle = colors.left;
  ctx.strokeStyle = colors.outline || 'rgba(25, 16, 10, 0.65)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - hw, wallTopY);
  ctx.lineTo(cx, wallTopY + hh);
  ctx.lineTo(cx + halfW * 0.35, ridgeY);
  ctx.lineTo(cx - halfW * 0.35, ridgeY - halfH * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx, wallTopY + hh);
  ctx.lineTo(cx + hw, wallTopY);
  ctx.lineTo(cx + halfW * 0.35, ridgeY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function renderBuildingStage(ctx, cx, baseY, type, stage, factionColor) {
  const spec = BUILDING_SPECS[type] || BUILDING_SPECS.house;
  const { halfW, halfH, wallH, roofH, isStone } = spec;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.30)';
  const shadowScale = stage === 0 ? 1.0 : stage === 1 ? 1.12 : 1.22;
  traceIsoDiamond(ctx, cx + (stage === 0 ? 2 : 9), baseY + (stage === 0 ? 1 : 4), halfW * shadowScale, halfH * shadowScale);
  ctx.fill();
  ctx.restore();

  if (type === 'farm' && stage === 2) {
    ctx.save();
    ctx.fillStyle = '#6e5233';
    ctx.strokeStyle = '#47331d';
    traceIsoDiamond(ctx, cx, baseY, halfW + 4, halfH + 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#d4a937';
    ctx.lineWidth = 2;
    for (let i = -halfW + 6; i < halfW - 4; i += 6) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 0.5, baseY - halfH * 0.5 + i * 0.25);
      ctx.lineTo(cx + i * 0.5 - 10, baseY + i * 0.25 + 5);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = isStone ? '#7b7872' : '#7a6348';
  ctx.strokeStyle = 'rgba(38, 28, 18, 0.5)';
  ctx.lineWidth = 1;
  traceIsoDiamond(ctx, cx, baseY, halfW + 4, halfH + 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (stage === 0) {
    ctx.strokeStyle = '#5c3f26';
    ctx.lineWidth = 2;
    const corners = [
      [cx, baseY - halfH],
      [cx + halfW, baseY],
      [cx, baseY + halfH],
      [cx - halfW, baseY],
    ];
    for (const [px, py] of corners) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 9);
      ctx.stroke();
    }
    ctx.strokeStyle = '#cbb38a';
    ctx.lineWidth = 1;
    traceIsoDiamond(ctx, cx, baseY - 6, halfW, halfH);
    ctx.stroke();
    return;
  }

  if (stage === 1) {
    drawIsoBox(ctx, cx, baseY, halfW, halfH, wallH * 0.58, {
      left: '#b89f7d',
      right: '#8c7456',
      top: '#d4be9c',
    });

    ctx.strokeStyle = '#684729';
    ctx.lineWidth = 2.2;
    const poles = [
      [cx - halfW + 2, baseY + 1],
      [cx, baseY + halfH + 2],
      [cx + halfW + 2, baseY + 1],
      [cx, baseY - halfH - 1],
    ];
    for (const [px, py] of poles) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - wallH - 4);
      ctx.stroke();
    }
    return;
  }

  const wallColors = isStone
    ? { left: '#a4a098', right: '#7d7a73', top: '#bebbb3' }
    : { left: '#ab8b62', right: '#826543', top: '#c2a176' };

  drawIsoBox(ctx, cx, baseY, halfW, halfH, wallH, wallColors);

  if (spec.banner && factionColor) {
    ctx.save();
    ctx.fillStyle = factionColor;
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.65, baseY - wallH * 0.55);
    ctx.lineTo(cx, baseY + halfH * 0.35 - wallH * 0.55);
    ctx.lineTo(cx, baseY + halfH * 0.35 - wallH * 0.32);
    ctx.lineTo(cx - halfW * 0.65, baseY - wallH * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#3a2514';
  const doorW = 8;
  const doorH = 14;
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.4, baseY - halfH * 0.2);
  ctx.lineTo(cx - halfW * 0.4 + doorW, baseY - halfH * 0.2 + doorW * 0.5);
  ctx.lineTo(cx - halfW * 0.4 + doorW, baseY - halfH * 0.2 + doorW * 0.5 - doorH);
  ctx.lineTo(cx - halfW * 0.4, baseY - halfH * 0.2 - doorH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const wallTopY = baseY - wallH;
  const roofColors = isStone
    ? { left: '#4a5b6e', right: '#334252', top: '#63778d' }
    : { left: '#9e3b2b', right: '#78281c', top: '#ba4836' };

  drawIsoRoof(ctx, cx, wallTopY, halfW, halfH, roofH, roofColors);

  if (spec.chimney) {
    const chX = cx + halfW * 0.35;
    const chY = wallTopY - roofH * 0.4;
    drawIsoBox(ctx, chX, chY, 5, 3, 11, {
      left: '#615d58',
      right: '#474440',
      top: '#78746e',
    });
  }

  if (type === 'town_hall' || type === 'citadel' || type === 'town_center' || type === 'wonder') {
    const topBaseY = wallTopY - roofH + 4;
    drawIsoBox(ctx, cx, topBaseY, halfW * 0.45, halfH * 0.45, 16, {
      left: '#b0ab9f',
      right: '#858075',
      top: '#c7c2b5',
    });
    drawIsoRoof(ctx, cx, topBaseY - 16, halfW * 0.45, halfH * 0.45, 12, {
      left: '#ba4836',
      right: '#802b1d',
      top: '#d45642',
    });
  }
}

function renderTree(ctx, cx, baseY, variant) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.30)';
  ctx.beginPath();
  ctx.ellipse(cx + 9, baseY + 2, 16, 7.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const trunkGrad = ctx.createLinearGradient(cx - 4, baseY - 24, cx + 4, baseY);
  trunkGrad.addColorStop(0, '#785436');
  trunkGrad.addColorStop(1, '#432c19');
  ctx.fillStyle = trunkGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, baseY + 1);
  ctx.lineTo(cx - 2.5, baseY - 24);
  ctx.lineTo(cx + 2.5, baseY - 24);
  ctx.lineTo(cx + 5, baseY + 1);
  ctx.closePath();
  ctx.fill();

  if (variant === 'pine') {
    const tiers = [
      { y: baseY - 16, w: 18, h: 18 },
      { y: baseY - 28, w: 14, h: 16 },
      { y: baseY - 39, w: 10, h: 14 },
    ];
    for (const tier of tiers) {
      ctx.fillStyle = '#3b7341';
      ctx.beginPath();
      ctx.moveTo(cx, tier.y - tier.h);
      ctx.lineTo(cx - tier.w, tier.y);
      ctx.lineTo(cx, tier.y + 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#234a28';
      ctx.beginPath();
      ctx.moveTo(cx, tier.y - tier.h);
      ctx.lineTo(cx + tier.w, tier.y);
      ctx.lineTo(cx, tier.y + 4);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const puffs = [
      { dx: 5, dy: -26, r: 12, c: '#29542d' },
      { dx: -6, dy: -25, r: 12, c: '#3d783d' },
      { dx: 0, dy: -35, r: 13, c: '#488c44' },
      { dx: -4, dy: -38, r: 8, c: '#65ab57' },
    ];
    for (const p of puffs) {
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(cx + p.dx, baseY + p.dy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export class EnvironmentSpriteBank {
  constructor() {
    this.buildingCache = new Map();
    this.treeCache = new Map();
  }

  getBuildingCanvas(type = 'house', stage = 2, factionColor = '#2e6fd9') {
    const key = `${type}:${stage}:${factionColor.toLowerCase()}`;
    if (this.buildingCache.has(key)) return this.buildingCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    renderBuildingStage(ctx, 64, 98, type, stage, factionColor);

    this.buildingCache.set(key, canvas);
    return canvas;
  }

  getTreeCanvas(variant = 'oak') {
    if (this.treeCache.has(variant)) return this.treeCache.get(variant);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 76;
    const ctx = canvas.getContext('2d');
    renderTree(ctx, 29, 64, variant);

    this.treeCache.set(variant, canvas);
    return canvas;
  }

  drawGameBuilding(ctx, building, dx, sy, invTilt = 1, timeSec = 0, showBadges = false) {
    const type = building.type || 'house';
    const progress = building.progress ?? 1.0;
    const factionColor = building.owner === 'enemy' ? '#c93b2b' : building.color || '#2e6fd9';
    const stage = progress < 0.35 ? 0 : progress < 1.0 ? 1 : 2;
    const sprite = this.getBuildingCanvas(type, stage, factionColor);

    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    ctx.drawImage(sprite, -64, -102, 128, 120);

    const spec = BUILDING_SPECS[type] || BUILDING_SPECS.house;

    if (stage < 2) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(-24, -52, 48, 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-23, -51, Math.round(46 * progress), 4);
    } else {
      if (spec.chimney) {
        const chimX = spec.halfW * 0.25;
        const chimY = -(spec.wallH + spec.roofH * 0.45 + 12);
        for (let i = 0; i < 4; i++) {
          const life = (timeSec * 0.45 + i * 0.25) % 1;
          const px = chimX + Math.sin(life * 5 + i) * 4 + life * 6;
          const py = chimY - life * 24;
          const radius = 2.5 + life * 5.5;
          ctx.fillStyle = `rgba(225, 225, 230, ${(1 - life) * 0.38})`;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (spec.banner) {
        const poleX = -spec.halfW * 0.35;
        const poleTopY = -(spec.wallH + spec.roofH + (type === 'town_hall' || type === 'citadel' ? 24 : 6));
        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(poleX, poleTopY + 14);
        ctx.lineTo(poleX, poleTopY);
        ctx.stroke();

        const wave = Math.sin(timeSec * 5 + (building.x || 0) * 0.05) * 2.5;
        ctx.fillStyle = factionColor;
        ctx.beginPath();
        ctx.moveTo(poleX, poleTopY);
        ctx.quadraticCurveTo(poleX + 7, poleTopY + 2 + wave, poleX + 13, poleTopY + 4 - wave * 0.5);
        ctx.lineTo(poleX, poleTopY + 8);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (building.hp < building.maxHp) {
      const hpRatio = Math.max(0, Math.min(1, (building.hp || 1) / (building.maxHp || 1)));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-26, -spec.wallH - spec.roofH - 18, 52, 5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-25, -spec.wallH - spec.roofH - 17, Math.round(50 * hpRatio), 3);
    }

    if (showBadges && building.name) {
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(building.name, 0, -spec.wallH - spec.roofH - 22);
    }

    ctx.restore();
  }

  drawGameResourceNode(ctx, node, dx, sy, invTilt = 1, timeSec = 0) {
    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    if (node.type === 'tree') {
      const variant = (node.id || Math.round(node.x)) % 3 === 0 ? 'pine' : 'oak';
      const sprite = this.getTreeCanvas(variant);
      const sway = Math.sin(timeSec * 1.8 + node.x * 0.03 + node.y * 0.02) * 0.022;
      ctx.transform(1, 0, sway, 1, 0, 0);
      ctx.drawImage(sprite, -29, -64, 64, 76);
    } else {
      const isGold = node.type === 'gold';
      ctx.fillStyle = 'rgba(10, 14, 18, 0.28)';
      ctx.beginPath();
      ctx.ellipse(2, 2, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isGold ? '#d4a024' : '#7d858c';
      ctx.strokeStyle = isGold ? '#6b4c0b' : '#3d4347';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(-9, -12);
      ctx.lineTo(3, -15);
      ctx.lineTo(13, -5);
      ctx.lineTo(11, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isGold ? '#f7d35c' : '#a6b0b8';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-8, -11);
      ctx.lineTo(2, -13);
      ctx.lineTo(-2, 1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  drawIsometricBridge(ctx, bx, rY, invTilt = 1, timeSec = 0) {
    ctx.save();
    ctx.translate(bx, rY);

    const halfW = 44;
    const halfH = 64;

    ctx.fillStyle = 'rgba(8, 15, 26, 0.38)';
    ctx.fillRect(-halfW - 6, -halfH + 4, (halfW + 6) * 2, halfH * 2);

    const pierYs = [-halfH + 8, -18, 18, halfH - 12];
    for (const py of pierYs) {
      const ripple = Math.sin(timeSec * 2.6 + py * 0.1) * 2;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(-halfW - 2, py + 4, 8 + ripple, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(halfW + 2, py + 4, 8 + ripple, 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.fillRect(-halfW - 6, py - 4, 8, 10);
      ctx.strokeRect(-halfW - 6, py - 4, 8, 10);
      ctx.fillRect(halfW - 2, py - 4, 8, 10);
      ctx.strokeRect(halfW - 2, py - 4, 8, 10);
    }

    const rampGradN = ctx.createLinearGradient(0, -halfH - 10, 0, -halfH + 14);
    rampGradN.addColorStop(0, '#78716c');
    rampGradN.addColorStop(1, '#57534e');
    ctx.fillStyle = rampGradN;
    ctx.beginPath();
    ctx.moveTo(-halfW + 4, -halfH - 8);
    ctx.lineTo(halfW - 4, -halfH - 8);
    ctx.lineTo(halfW, -halfH + 12);
    ctx.lineTo(-halfW, -halfH + 12);
    ctx.closePath();
    ctx.fill();

    const rampGradS = ctx.createLinearGradient(0, halfH - 12, 0, halfH + 10);
    rampGradS.addColorStop(0, '#57534e');
    rampGradS.addColorStop(1, '#78716c');
    ctx.fillStyle = rampGradS;
    ctx.beginPath();
    ctx.moveTo(-halfW, halfH - 12);
    ctx.lineTo(halfW, halfH - 12);
    ctx.lineTo(halfW - 4, halfH + 8);
    ctx.lineTo(-halfW + 4, halfH + 8);
    ctx.closePath();
    ctx.fill();

    const deckGrad = ctx.createLinearGradient(-halfW, 0, halfW, 0);
    deckGrad.addColorStop(0, '#854d0e');
    deckGrad.addColorStop(0.5, '#a16207');
    deckGrad.addColorStop(1, '#713f12');
    ctx.fillStyle = deckGrad;
    ctx.strokeStyle = '#422006';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-halfW, -halfH + 8, halfW * 2, (halfH - 8) * 2);
    ctx.strokeRect(-halfW, -halfH + 8, halfW * 2, (halfH - 8) * 2);

    ctx.strokeStyle = 'rgba(42, 20, 5, 0.55)';
    ctx.lineWidth = 1;
    for (let py = -halfH + 13; py <= halfH - 10; py += 6) {
      ctx.beginPath();
      ctx.moveTo(-halfW + 2, py);
      ctx.lineTo(halfW - 2, py);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(120, 113, 108, 0.28)';
    ctx.fillRect(-16, -halfH + 8, 32, (halfH - 8) * 2);

    const postHeight = 10 * invTilt;
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.moveTo(-halfW + 2, -halfH + 8 - postHeight);
    ctx.lineTo(-halfW + 2, halfH - 8 - postHeight);
    ctx.moveTo(halfW - 2, -halfH + 8 - postHeight);
    ctx.lineTo(halfW - 2, halfH - 8 - postHeight);
    ctx.stroke();

    for (let py = -halfH + 10; py <= halfH - 10; py += 22) {
      ctx.fillStyle = '#5c2d0c';
      ctx.fillRect(-halfW, py - postHeight, 4, postHeight + 2);
      ctx.fillRect(halfW - 4, py - postHeight, 4, postHeight + 2);

      if (Math.abs(py) > 35) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(-halfW + 2, py - postHeight - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(halfW - 2, py - postHeight - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawIsometricWarGalley(ctx, g, gx, gy, invTilt = 1, timeSec = 0, showBadges = true) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, invTilt);

    const dir = (g.vx || 0) < 0 ? -1 : 1;
    const speed = Math.abs(g.vx || 30);
    const phase = timeSec * 4.5 + (g.id || 0) * 1.3;
    const bob = Math.sin(phase * 0.7) * 1.6;

    ctx.save();
    for (let i = 0; i < 4; i++) {
      const wakeT = (timeSec * 1.4 + i * 0.25) % 1;
      const wx = -dir * (26 + wakeT * 36);
      const spread = 6 + wakeT * 12;
      const alpha = (1 - wakeT) * 0.42;
      ctx.strokeStyle = `rgba(186, 230, 253, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(wx, 6, 8 + wakeT * 10, spread * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dir * 34, 5 + bob * 0.4, 7, dir > 0 ? -0.8 : Math.PI - 0.8, dir > 0 ? 0.8 : Math.PI + 0.8);
    ctx.stroke();
    ctx.restore();

    ctx.translate(0, bob);

    ctx.fillStyle = 'rgba(7, 16, 30, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 38, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const oarCount = 5;
    const oarSwing = Math.sin(phase * (speed > 2 ? 1.4 : 0.4)) * 6 * dir;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < oarCount; i++) {
      const ox = -18 + i * 9;
      ctx.beginPath();
      ctx.moveTo(ox, -2);
      ctx.lineTo(ox - oarSwing, -9);
      ctx.stroke();
    }

    const hullGrad = ctx.createLinearGradient(0, -10, 0, 12);
    hullGrad.addColorStop(0, '#92400e');
    hullGrad.addColorStop(0.55, '#78350f');
    hullGrad.addColorStop(1, '#451a03');

    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#271203';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-36 * dir, -6);
    ctx.lineTo(-28 * dir, -2);
    ctx.lineTo(28 * dir, -2);
    ctx.lineTo(38 * dir, -7);
    ctx.lineTo(29 * dir, 9);
    ctx.lineTo(-29 * dir, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-34 * dir, -4);
    ctx.lineTo(35 * dir, -5);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(40, 18, 4, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-30 * dir, 3);
    ctx.lineTo(31 * dir, 3);
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const sx = -20 + i * 8;
      ctx.fillStyle = i % 2 === 0 ? '#b91c1c' : '#d97706';
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, -1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (let i = 0; i < oarCount; i++) {
      const ox = -18 + i * 9;
      const bladeX = ox + oarSwing;
      const bladeY = 13 + Math.cos(phase) * 1.8;

      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(ox, 1);
      ctx.lineTo(bladeX, bladeY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(224, 242, 254, 0.7)';
      ctx.beginPath();
      ctx.ellipse(bladeX, bladeY + 1, 3.2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const prowX = 38 * dir;
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(29 * dir, 5);
    ctx.lineTo(43 * dir, 7);
    ctx.lineTo(29 * dir, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(33 * dir, -5);
    ctx.quadraticCurveTo(39 * dir, -16, 44 * dir, -14);
    ctx.lineTo(41 * dir, -9);
    ctx.lineTo(36 * dir, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(40 * dir, -13, 1.3, 0, Math.PI * 2);
    ctx.fill();

    const fireCycle = (timeSec * 0.9 + (g.id || 0) * 0.37) % 1;
    if ((g.shootTimer && g.shootTimer > 0) || fireCycle < 0.28) {
      for (let f = 0; f < 4; f++) {
        const fx = prowX + dir * (6 + f * 4.5 + fireCycle * 8);
        const fy = -12 + Math.sin(timeSec * 18 + f) * 2.5;
        ctx.fillStyle = f % 2 === 0 ? 'rgba(249, 115, 22, 0.85)' : 'rgba(253, 224, 71, 0.85)';
        ctx.beginPath();
        ctx.arc(fx, fy, 4.2 - f * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, -44);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(214, 211, 209, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-28 * dir, -3);
    ctx.lineTo(0, -40);
    ctx.lineTo(28 * dir, -4);
    ctx.stroke();

    const billow = (7 + Math.sin(phase * 0.8) * 2.2) * dir;
    const sailGrad = ctx.createLinearGradient(-16, -38, 16, -12);
    sailGrad.addColorStop(0, '#dc2626');
    sailGrad.addColorStop(0.5, '#991b1b');
    sailGrad.addColorStop(1, '#7f1d1d');

    ctx.fillStyle = sailGrad;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, -38);
    ctx.quadraticCurveTo(0, -39, 16, -38);
    ctx.quadraticCurveTo(16 + billow, -24, 15, -11);
    ctx.quadraticCurveTo(0, -10, -15, -11);
    ctx.quadraticCurveTo(-16 + billow * 0.75, -24, -16, -38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(billow * 0.45, -24, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(billow * 0.45 + 1.5 * dir, -25, 3.2, 0, Math.PI * 2);
    ctx.fill();

    const wave = Math.sin(timeSec * 6 + (g.id || 0)) * 2.5;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.quadraticCurveTo(8 * dir, -43 + wave, 16 * dir, -41 - wave * 0.5);
    ctx.lineTo(0, -39);
    ctx.closePath();
    ctx.fill();

    if (showBadges) {
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 8.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(g.name || '🐉 WAR GALLEY', 0, -49);
    }

    ctx.restore();
  }

  drawGameSiegeEngine(ctx, s, sx, sy, invTilt = 1, timeSec = 0, showBadges = true) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, invTilt);

    const name = (s.name || s.type || '').toLowerCase();
    const isRam = name.includes('ram') || name.includes('mammoth') || s.type === 'battering_ram';
    const facing = (s.vx || 0) < -0.05 ? -1 : 1;

    ctx.fillStyle = 'rgba(10, 14, 18, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawWheel = (wx, wy, r = 7.5) => {
      const spin = ((s.x || 0) + (s.y || 0)) * 0.08;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.fillStyle = '#451a03';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 0.6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const a = spin + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -r, Math.sin(a) * -r);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
    };

    if (isRam) {
      drawWheel(-15, -4, 7);
      drawWheel(15, -4, 7);

      drawIsoBox(ctx, 0, -2, 24, 11, 6, {
        left: '#78350f',
        right: '#451a03',
        top: '#92400e',
      });

      const swing = Math.sin(timeSec * 5 + (s.id || 0)) * 3.5 * facing;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-10, -24);
      ctx.lineTo(-8 + swing, -12);
      ctx.moveTo(10, -24);
      ctx.lineTo(8 + swing, -12);
      ctx.stroke();

      ctx.fillStyle = '#5c2d0c';
      ctx.strokeStyle = '#271203';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-18 + swing, -15, 36, 6);
      ctx.strokeRect(-18 + swing, -15, 36, 6);

      drawIsoRoof(ctx, 0, -18, 22, 10, 12, {
        left: '#a16207',
        right: '#713f12',
        outline: '#422006',
      });

      const skullX = (19 + swing) * facing;
      ctx.fillStyle = '#e7e5e4';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(skullX, -12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(skullX, -10);
      ctx.quadraticCurveTo(skullX + 9 * facing, -8, skullX + 12 * facing, -16);
      ctx.stroke();
    } else {
      drawWheel(-16, -3, 6.5);
      drawWheel(16, -3, 6.5);

      drawIsoBox(ctx, 0, -2, 24, 11, 5, {
        left: '#92400e',
        right: '#5c2d0c',
        top: '#b45309',
      });

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.lineTo(0, -34);
      ctx.lineTo(14, -6);
      ctx.stroke();

      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-9, -16);
      ctx.lineTo(9, -16);
      ctx.stroke();

      const cooldown = s.attackCooldown || 0;
      const armAngle =
        cooldown > 0.5
          ? -0.55 * facing
          : (-0.25 + Math.sin(timeSec * 2.2 + (s.id || 0)) * 0.18) * facing;

      ctx.save();
      ctx.translate(0, -32);
      ctx.rotate(armAngle);

      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-12 * facing, 0);
      ctx.lineTo(26 * facing, 0);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-16 * facing, 0);
      ctx.lineTo(-8 * facing, 0);
      ctx.lineTo(-9 * facing, 11);
      ctx.lineTo(-15 * facing, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(26 * facing, 0);
      ctx.lineTo(29 * facing, 10);
      ctx.stroke();

      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.arc(29 * facing, 11, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(0, -32, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.hp < s.maxHp) {
      const hpRatio = Math.max(0, Math.min(1, (s.hp || 1) / (s.maxHp || 1)));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-20, -48, 40, 4.5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-19, -47, Math.round(38 * hpRatio), 2.5);
    }

    if (showBadges && s.name) {
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 8.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(typeof s.ammo === 'number' ? `${s.name} • 🪨:${s.ammo}/${s.maxAmmo || 6}` : s.name, 0, -52);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 6. CONSTANT-ALPHA OFFSCREEN FOOTPATH COMPOSITOR
 * ========================================================================== */

export class PlanetaryFootpathOverlay {
  constructor({ cellSize = 28 } = {}) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  getWearAt(x, y) {
    const col = Math.floor(wrapX(x, WORLD_W) / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return this.cells.get(`${col}:${row}`) || 0;
  }

  updateTraffic(villagers, dt = 1 / 60) {
    if (!villagers) return;
    const gain = 0.045 * dt * 10;
    for (let i = 0; i < villagers.length; i++) {
      const u = villagers[i];
      if (Math.hypot(u.vx || 0, u.vy || 0) < 2) continue;
      const col = Math.floor(wrapX(u.x, WORLD_W) / this.cellSize);
      const row = Math.floor(u.y / this.cellSize);
      const key = `${col}:${row}`;
      const prev = this.cells.get(key) || 0;
      if (prev < 1) {
        this.cells.set(key, Math.min(1, prev + gain));
      }
    }
  }

  stampBuilding(x, y, radius = 44) {
    if (typeof y !== 'number') return;
    const c0 = Math.floor(wrapX(x, WORLD_W) / this.cellSize);
    const r0 = Math.floor(y / this.cellSize);
    const rad = Math.ceil(radius / this.cellSize);
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const d = Math.hypot(dc, dr) / Math.max(1, rad);
        if (d <= 1) {
          const key = `${c0 + dc}:${r0 + dr}`;
          const val = 0.55 * (1 - d * 0.45);
          if (val > (this.cells.get(key) || 0)) {
            this.cells.set(key, val);
          }
        }
      }
    }
  }

  drawVisiblePaths(ctx, cam, canvasWidth, canvasHeight) {
    if (!ctx || !cam) return;
    const halfW = (canvasWidth * 0.65) / cam.zoom;
    const halfH = (canvasHeight * 0.65) / (cam.zoom * (cam.tiltScale || 1));
    const minCol = Math.floor((cam.x - halfW) / this.cellSize);
    const maxCol = Math.ceil((cam.x + halfW) / this.cellSize);
    const minRow = Math.floor((cam.y - halfH) / this.cellSize);
    const maxRow = Math.ceil((cam.y + halfH) / this.cellSize);
    const totalCols = Math.ceil(WORLD_W / this.cellSize);

    const dirtPath = new Path2D();
    const cobblePath = new Path2D();
    let hasDirt = false;
    let hasCobble = false;

    const neighbors = [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ];

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const wrappedC = ((c % totalCols) + totalCols) % totalCols;
        const wear = this.cells.get(`${wrappedC}:${r}`);
        if (!wear || wear < 0.14) continue;

        const wx = (c + 0.5) * this.cellSize - cam.x;
        const wy = (r + 0.5) * this.cellSize - cam.y;

        for (const [dc, dr] of neighbors) {
          const nc = (((c + dc) % totalCols) + totalCols) % totalCols;
          const nw = this.cells.get(`${nc}:${r + dr}`);
          if (nw && nw >= 0.14) {
            const nx = wx + dc * this.cellSize;
            const ny = wy + dr * this.cellSize;
            dirtPath.moveTo(wx, wy);
            dirtPath.lineTo(nx, ny);
            hasDirt = true;

            if (wear >= 0.68 && nw >= 0.68) {
              cobblePath.moveTo(wx, wy);
              cobblePath.lineTo(nx, ny);
              hasCobble = true;
            }
          }
        }
      }
    }

    if (!hasDirt && !hasCobble) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (hasDirt) {
      ctx.strokeStyle = 'rgba(139, 108, 74, 0.34)';
      ctx.lineWidth = this.cellSize * 0.95;
      ctx.stroke(dirtPath);
    }

    if (hasCobble) {
      ctx.strokeStyle = 'rgba(168, 162, 158, 0.36)';
      ctx.lineWidth = this.cellSize * 0.55;
      ctx.stroke(cobblePath);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 7. ONE-LINE INSTALLER FOR PrehistoricPlanetaryGame
 * ========================================================================== */
const MASTERPLAN_HOME_LAYOUT = {
  shipyard: [{ x: 780, y: 2108 }],
shrine: [{ x: 780, y: 2205 }],
town_center: [{ x: 780, y: 2320 }],
market: [{ x: 780, y: 2435 }],
quarry: [{ x: 640, y: 2205 }],
sawmill: [{ x: 640, y: 2320 }],
kitchen: [{ x: 640, y: 2435 }],
forge: [{ x: 920, y: 2205 }],
barracks: [{ x: 920, y: 2320 }],
hut: [{ x: 920, y: 2435 }, { x: 510, y: 2320 }, { x: 510, y: 2435 }, { x: 510, y: 2205 }],
tower: [{ x: 1065, y: 2205 }, { x: 1065, y: 2435 }],
gatehouse: [{ x: 1065, y: 2320 }],
};

const WAR_MOTIVES = [
{ reason: '🌾 Famine Raid → Kitchen', targetTypes: ['kitchen', 'market'] },
{ reason: '⚖️ Avenging Kin → Barracks', targetTypes: ['barracks', 'tower', 'gatehouse'] },
{ reason: '⚒️ Seizing Iron → Forge', targetTypes: ['forge', 'quarry', 'sawmill'] },
{ reason: '💍 Ring Crusade → Citadel', targetTypes: ['town_center', 'shrine'] },
];

const WEAPON_ARSENAL = [ { id: 'spear', label: '🗡️ Spear', bonusDmg: 4 }, { id: 'sword', label: '⚔️ Sword', bonusDmg: 5 }, { id: 'bow', label: '🏹 Bow', bonusDmg: 3 }, { id: 'battleaxe', label: '🪓 Battle-Axe', bonusDmg: 7 }, { id: 'warhammer', label: '🔨 War-Maul', bonusDmg: 8 }, { id: 'twin_daggers', label: '🗡️ Twin Daggers', bonusDmg: 4 }, ]; const PROFESSIONS = [ { id: 'builder', label: '🔨 Builder' }, { id: 'cook', label: '🍲 Cook' }, { id: 'fisherman', label: '🎣 Fisherman' }, { id: 'hunter', label: '🏹 Hunter' }, { id: 'trader', label: '⚖️ Trader' }, { id: 'miner', label: '⛏️ Gatherer' }, { id: 'soldier', label: '🛡️ Soldier' }, ]; export class SovereignWorldOrderEngine { constructor() { this.worldChronicle = [{ time: '00:00', text: '👑 One Ring Known World Founded (Zero Spawning Active)' }]; this.syxCutawayRooms = true; this.packMuleCaravans = []; this.merchantShips = []; this.diplomaticEnvoys = []; this.treatyCeremonies = []; this.treeStumps = []; this.depositPopups = []; this._universalCycleIdx = 0; this.droppedCargoCrates = []; this.waterSplashes = []; this.ricochetArrows = []; this.elementalPatches = []; this.collapsingStructures = []; this.rubbleRuins = []; this.wildHerds = []; this.cropPlots = []; this.memorialGraves = []; this.hydroLightningArcs = []; this.verletChains = []; this.bernoulliVortices = []; this.tsunamiWaves = []; this.fulcrumLevers = []; this.avalancheSlides = []; this.machCones = []; this.elasticPoleVaults = []; this.magneticFields = []; this.widelandsFlags = []; this.widelandsRoads = []; this.widelandsCarriers = []; this.widelandsProductionSites = []; this.widelandsTrainingSites = []; this.syxGuardPosts = []; this.syxJanitors = []; this.syxTourists = []; this.syxLawMode = 'balanced'; this.syxMarketPrices = { wood: 3, ore: 5, bread: 4, armor: 14 }; this.lightingMode = 'day'; this.weatherMode = 'clear'; this.weatherParticles = []; this.cultureRooms = null; } dropCarriedCargoOnImpact(target, force = 160) { if (!target || (target.carryAmount || 0) <= 0 || force < 110) return; if (this.droppedCargoCrates.length > 20) this.droppedCargoCrates.shift(); this.droppedCargoCrates.push({ id: Date.now() + Math.random(), x: target.x + (Math.random() - 0.5) * 16, y: target.y + (Math.random() - 0.5) * 10, z: 18, vz: 95, amount: target.carryAmount, type: target.gatherType || 'wood', life: 25.0 }); target._consequenceTag = `📦 Dropped ${target.carryAmount} ${(target.gatherType || 'wood').toUpperCase()} from Impact!`; target._consequenceTimer = 3.2; target.carryAmount = 0; } spawnWaterSplash(x, y, label = '🌊 River Plunge Splash!') { if (this.waterSplashes.length > 20) this.waterSplashes.shift(); this.waterSplashes.push({ x, y, radius: 6, maxRadius: 34, life: 0.75, maxLife: 0.75, label }); } stepHumanAttackStructure(game, u, dt) { const b = u._attackBuildingTarget; if (b && typeof b.hp !== 'number') { b.maxHp = b.maxHp || 600; b.hp = b.maxHp; } if (!b || !Array.isArray(game.buildings) || !game.buildings.includes(b) || (b.hp ?? 600) <= 0) { u._attackBuildingTarget = null; return false; } const dx = wrapDX(u.x, b.x), dy = b.y - u.y, dist = Math.hypot(dx, dy); if (dist > (b.radius || 32) + 22) { const spd = u.isT101s ? 98 : 46; u.x = wrapX(u.x + (dx / dist) * spd * dt, WORLD_W); u.y += (dy / dist) * spd * dt; u.state = 'move'; u.facing = dx >= 0 ? 1 : -1; u._roleBadge = `⚔️ Marching to Destroy ${b.name} (${Math.ceil(b.hp)}/${b.maxHp} HP)`; return true; } u.vx = 0; u.vy = 0; u.state = 'attack'; u.facing = dx >= 0 ? 1 : -1; u._siegeSwingCd = (u._siegeSwingCd || 0) - dt; if (u._siegeSwingCd <= 0) { u._siegeSwingCd = 0.85; u.swingAnim = 0.55; const dmg = Math.round(u.isT101s ? 95 : (u.attack || 24) * 1.6); b.hp = Math.max(0, (b.hp || 500) - dmg); b._hitShake = 0.48; b._scorchTimer = 5.0; this.awardUnitXP(u, 16, 'Structure Demolition'); this.depositPopups.push({ x: b.x, y: b.y - 12, text: `💥 -${dmg} HP (${Math.ceil(b.hp)}/${b.maxHp})`, color: '#f87171', life: 1.4, maxLife: 1.4 }); if (b.hp <= 0) { this.triggerStructureCollapse(game, b, u.name || 'Attacker'); u._attackBuildingTarget = null; } } u._roleBadge = `💥 Destroying ${b.name} (${Math.ceil(b.hp)}/${b.maxHp} HP)`; return true; } triggerStructureCollapse(game, b, destroyerName = 'Siege') { if (!b || b._collapsed) return; b._collapsed = true; this.logChronicleEvent(`🏚️ ${b.name || 'Structure'} was destroyed by ${(destroyerName || 'Siege').split('-')[0]}!`); this.collapsingStructures.push({ ...b, life: 1.45, maxLife: 1.45, destroyerName }); this.rubbleRuins.push({ x: b.x, y: b.y, radius: b.radius || 32, name: b.name || 'Structure', destroyerName: (destroyerName || 'Human').split('-')[0], life: 65.0 }); const idx = Array.isArray(game.buildings) ? game.buildings.indexOf(b) : -1; if (idx !== -1) game.buildings.splice(idx, 1); if (typeof game.showToast === 'function') game.showToast(`🏚️ ${b.name} was destroyed by ${destroyerName}!`, 'rose'); } passDownFamilyInheritance(game, deceased) { if (!deceased || deceased._inheritanceProcessed || deceased.isBoss) return; deceased._inheritanceProcessed = true; if (this.memorialGraves.length > 24) this.memorialGraves.shift(); this.memorialGraves.push({ x: deceased.x, y: deceased.y, name: (deceased.name || 'Founder').split('-')[0], age: Math.floor(deceased.age ?? 58), house: deceased.familyHouse || 'Aethelgard', life: 90.0 }); const pool = Array.isArray(game.villagers) ? game.villagers : []; const heir = pool.find((u) => u && u !== deceased && u.hp > 0 && u.id === deceased.spouseId) || pool.find((u) => u && u !== deceased && u.hp > 0 && u.familyHouse && u.familyHouse === deceased.familyHouse) || pool.find((u) => u && u !== deceased && u.hp > 0 && !u.isT101s); if (heir) { const legacyGold = Math.max(4, Math.round(deceased.walletGold || 8)); heir.walletGold = (heir.walletGold || 0) + legacyGold; const heirFirst = (heir.name || 'Heir').split('-')[0]; let inheritedBldg = null; if (Array.isArray(game.buildings)) { for (const b of game.buildings) { if (b && (b.privateOwnerId === deceased.id || b.privateOwnerName === (deceased.name || '').split('-')[0])) { b.privateOwnerId = heir.id; b.privateOwnerName = heirFirst; inheritedBldg = b.name; } } } heir._consequenceTag = inheritedBldg ? `📜 Inherited ${legacyGold}🪙 & ${inheritedBldg} from ${(deceased.name || 'Kin').split('-')[0]}!` : `📜 Inherited ${legacyGold}🪙 Estate from ${(deceased.name || 'Kin').split('-')[0]}!`; heir._consequenceTimer = 5.5; } } spawnFallingTree(x, y, fallDir = 1) { if (!this.fallingTrees) this.fallingTrees = []; if (this.fallingTrees.length > 12) this.fallingTrees.shift(); this.fallingTrees.push({ x, y, fallDir: fallDir >= 0 ? 1 : -1, angle: 0.04, angularVel: 1.15, phase: 'falling', dustRadius: 6, life: 3.6, maxLife: 3.6 }); } spawnBladeClashAndDisarm(x, y, foe = null, forceDisarm = false) { if (!this.bladeClashes) this.bladeClashes = []; if (!this.disarmedWeapons) this.disarmedWeapons = []; if (this.bladeClashes.length > 16) this.bladeClashes.shift(); this.bladeClashes.push({ x, y, life: 0.65, maxLife: 0.65 }); if (foe && (forceDisarm || Math.random() < 0.32) && (foe._disarmedTimer || 0) <= 0) { foe._disarmedTimer = 5.5; if (this.disarmedWeapons.length > 14) this.disarmedWeapons.shift(); this.disarmedWeapons.push({ x: foe.x, y: foe.y, z: 18, vx: (Math.random() - 0.5) * 95, vy: (Math.random() - 0.5) * 60, vz: 145, angle: 0, vRot: 16, weaponType: foe.weaponType || 'sword', weaponLabel: foe.weaponLabel || 'Steel Blade', ownerId: foe.id, life: 11.0 }); foe._consequenceTag = `\u{1F5E1}\uFE0F Disarmed (${foe.weaponLabel || 'Blade'} Flying)!`; foe._consequenceTimer = 3.5; } } spawnRollingBoulder(x, y, dirX = 1, dirY = 0.15, launcherName = 'Earthbender') { if (!this.rollingBoulders) this.rollingBoulders = []; if (this.rollingBoulders.length > 10) this.rollingBoulders.shift(); const mag = Math.max(0.01, Math.hypot(dirX, dirY)); this.rollingBoulders.push({ id: Date.now() + Math.random(), x, y, z: 14, vx: (dirX / mag) * 145, vy: (dirY / mag) * 95, vz: 85, rot: 0, radius: 15, mass: 8.5, launcherName, life: 4.8, maxLife: 4.8 }); } applyShieldArmorKineticAndHitStop(game, attacker, target, baseDamage = 24, isBlunt = false, isSlash = true) { if (!target || target.hp <= 0) return baseDamage; if (!this.shieldShards) this.shieldShards = []; if (!this.sonicRings) this.sonicRings = []; if (!this.bloodSplatters) this.bloodSplatters = []; if (typeof target.shieldHp !== 'number') target.shieldHp = 100; if (typeof target.armorHp !== 'number') target.armorHp = 100; const avx = attacker ? (attacker.vx || 0) : 0; const avy = attacker ? (attacker.vy || 0) : 0; const tvx = target.vx || 0; const tvy = target.vy || 0; const vRel = Math.hypot(avx - tvx, avy - tvy) + Math.abs((attacker && attacker.vz) || 0) * 0.45; const keMult = Math.min(2.5, Math.max(1.0, 1.0 + vRel / 180)); if (keMult >= 1.35) { this.sonicRings.push({ x: target.x, y: target.y, z: target.z || 8, r: 8, maxR: 52, life: 0.45, maxLife: 0.45 }); } let dmg = Math.round(baseDamage * keMult); if (target.shieldHp > 0) { const shieldDmg = Math.round(dmg * (isBlunt ? 1.65 : 1.0)); target.shieldHp = Math.max(0, target.shieldHp - shieldDmg); dmg = Math.round(dmg * (target.shieldHp > 0 ? 0.45 : 0.75)); if (target.shieldHp <= 0) { for (let i = 0; i < 7; i++) { const ang = (Math.PI * 2 * i) / 7 + Math.random() * 0.4; this.shieldShards.push({ x: target.x, y: target.y, z: (target.z || 10) + 12, vx: Math.cos(ang) * (55 + Math.random() * 65), vy: Math.sin(ang) * (55 + Math.random() * 65), vz: 95 + Math.random() * 85, angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 14, life: 1.6 }); } target._consequenceTag = '🛡️💥 Shield Shattered! Guard Broken!'; target._consequenceTimer = 3.0; } } else { target.armorHp = Math.max(0, target.armorHp - Math.round(dmg * 0.65)); } if (isSlash && target.armorHp <= 45) { target._bleedTimer = 5.0; } if (dmg >= 28) { target._hitStopTimer = 0.065; if (attacker) attacker._hitStopTimer = 0.065; } if ((target.z || 0) > 4) { target.vz = Math.max(target.vz || 0, 155); target._consequenceTag = `⬆️ Air-Juggle Combo! (KE ${keMult.toFixed(1)}× • -${dmg} HP)`; target._consequenceTimer = 3.0; } const hitAng = attacker ? Math.atan2(target.y - attacker.y, wrapDX(attacker.x, target.x)) : Math.random() * Math.PI * 2; for (let i = 0; i < 4; i++) { const a = hitAng + (Math.random() - 0.5) * 0.9; const spd = 45 + Math.random() * 75; this.bloodSplatters.push({ x: target.x, y: target.y, z: (target.z || 8) + 10, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, vz: 65 + Math.random() * 55, r: 2 + Math.random() * 2.5, life: 1.4 }); } return dmg; } resolveAnatomicalHitZone(game, attacker, target, baseDamage = 24, forcedZone = null) { if (!target || target.hp <= 0) return { zone: 'none', zHit: 0, finalDmg: 0 }; const isBlunt = attacker && (attacker.weaponType === 'warhammer' || attacker.bender === 'earth'); baseDamage = this.applyShieldArmorKineticAndHitStop(game, attacker, target, baseDamage, isBlunt, !isBlunt); if (!this.flyingHelmets) this.flyingHelmets = []; if (!this.anatomicalPopups) this.anatomicalPopups = []; const zHit = forcedZone === 'head' ? 26 : (forcedZone === 'arm' ? 15 : (forcedZone === 'leg' ? 5 : Math.round(4 + Math.random() * 26))); const tName = (target.name || 'Unit').split('-')[0]; if (zHit >= 22) { const finalDmg = Math.round(baseDamage * 2.0); if (typeof target.hp === 'number' && !target.invincible) target.hp = Math.max(0, target.hp - finalDmg); target.headHp = Math.max(0, (target.headHp ?? 100) - 48); target._headConcussionTimer = 6.5; target._stunTimer = Math.max(target._stunTimer || 0, 1.25); if (this.flyingHelmets.length > 14) this.flyingHelmets.shift(); this.flyingHelmets.push({ x: target.x, y: target.y, z: 24, vx: (Math.random() - 0.5) * 110, vy: (Math.random() - 0.5) * 70, vz: 165, angle: 0, vRot: 14, label: '🪖 Flying Helmet (' + tName + ')', life: 8.5 }); if (this.anatomicalPopups.length > 18) this.anatomicalPopups.shift(); this.anatomicalPopups.push({ x: target.x, y: target.y, z: 32, text: `🎯 HEAD CONCUSSION! (z=${zHit} • 2.0× Crit -${finalDmg} HP • 🪖 Helmet Flying!)`, color: '#fb7185', life: 2.2, maxLife: 2.2 }); target._consequenceTag = `🎯 Head Concussion (2.0× Crit -${finalDmg} HP • 🪖 Helmet Flying!)`; target._consequenceTimer = 4.0; return { zone: 'head', zHit, finalDmg }; } else if (zHit >= 10) { const finalDmg = Math.round(baseDamage * 1.35); if (typeof target.hp === 'number' && !target.invincible) target.hp = Math.max(0, target.hp - finalDmg); target.armHp = Math.max(0, (target.armHp ?? 100) - 45); target._armFractureTimer = 8.0; if (this.anatomicalPopups.length > 18) this.anatomicalPopups.shift(); this.anatomicalPopups.push({ x: target.x, y: target.y, z: 26, text: `💪 ARM FRACTURE! (z=${zHit} • -${finalDmg} HP • -35% Swing Spd!)`, color: '#fb923c', life: 2.2, maxLife: 2.2 }); target._consequenceTag = `💪 Arm Fracture (-${finalDmg} HP • -35% Swing Spd!)`; target._consequenceTimer = 4.0; return { zone: 'arm', zHit, finalDmg }; } else { const finalDmg = Math.round(baseDamage * 1.25); if (typeof target.hp === 'number' && !target.invincible) target.hp = Math.max(0, target.hp - finalDmg); target.legHp = Math.max(0, (target.legHp ?? 100) - 52); target._legCrippleTimer = 9.0; if (this.anatomicalPopups.length > 18) this.anatomicalPopups.shift(); this.anatomicalPopups.push({ x: target.x, y: target.y, z: 20, text: `🦵 HAMSTRING CRIPPLED! (z=${zHit} • -${finalDmg} HP • -50% Spd Limp!)`, color: '#facc15', life: 2.2, maxLife: 2.2 }); target._consequenceTag = `🦵 Hamstring Crippled (-${finalDmg} HP • -50% Spd Limp!)`; target._consequenceTimer = 4.0; return { zone: 'leg', zHit, finalDmg }; } } spawnGrappleShoulderThrow(game, thrower, target) { if (!thrower || !target) return; if (!this.thrownBodies) this.thrownBodies = []; const f = thrower.facing || 1; thrower.facing = -f; thrower.swingAnim = 0.7; thrower._consequenceTag = '🤼 Judo Shoulder-Throw on ' + ((target.name || 'Foe').split('-')[0]) + '!'; thrower._consequenceTimer = 3.5; target.vz = 175; target.z = 18; target.kx = f * 155; target.ky = -25; target._isThrownProjectile = true; target._consequenceTag = '🤼 Hurled Through Air (Human Projectile)!'; target._consequenceTimer = 3.5; if (this.thrownBodies.length > 10) this.thrownBodies.shift(); this.thrownBodies.push({ unit: target, startX: thrower.x, startY: thrower.y, x: target.x, y: target.y, throwerName: (thrower.name || 'Master').split('-')[0], targetName: (target.name || 'Challenger').split('-')[0], rot: 0, life: 2.8, maxLife: 2.8 }); } spawnImpactCrater(x, y, radius = 26, label = '🕳️ Impact Crater (-20% Spd)') { if (!this.impactCraters) this.impactCraters = []; if (this.impactCraters.length > 14) this.impactCraters.shift(); this.impactCraters.push({ x, y, radius, label, life: 55.0, maxLife: 55.0 }); } spawnMountedCavalryCharge(x, y, dirX = 1, riderName = 'Aethelgard Lancer') { if (!this.cavalryCharges) this.cavalryCharges = []; if (this.cavalryCharges.length > 6) this.cavalryCharges.shift(); this.cavalryCharges.push({ id: Date.now() + Math.random(), x, y, vx: (dirX >= 0 ? 1 : -1) * 135, vy: 8, mount: Math.random() < 0.5 ? 'mammoth' : 'sabre', riderName, life: 4.2 }); } triggerRadialPressureShockwave(game, x, y, maxRadius = 155, peakForce = 240, label = '💥 1/r² Newtonian Shockwave!') { if (!this.pressureShockwaves) this.pressureShockwaves = []; if (this.pressureShockwaves.length > 10) this.pressureShockwaves.shift(); this.pressureShockwaves.push({ id: Date.now() + Math.random(), x, y, radius: 12, maxRadius, peakForce, label, life: 0.95, maxLife: 0.95 }); } triggerThermoAndHydroConductivity(game, sourceUnit) { if (!game || !sourceUnit) return; if (!Array.isArray(this.hydroLightningArcs)) this.hydroLightningArcs = []; if (Array.isArray(this.elementalPatches)) { for (const ep of this.elementalPatches) { if (!ep) continue; if (ep.type === 'ice') { ep.type = 'water_puddle'; ep.label = '💧 Melted Water Puddle'; ep.life = Math.max(ep.life || 8, 12); } else if (ep.type === 'magma') { ep.type = 'obsidian'; ep.label = '🪨 Solidified Obsidian Crust'; ep.life = Math.max(ep.life || 10, 15); } } } const pool = [...(game.villagers || []), ...(game.enemies || [])].filter(v => v && v !== sourceUnit && (v.hp ?? 100) > 0 && Math.hypot(wrapDX(sourceUnit.x, v.x), sourceUnit.y - v.y) < 175).slice(0, 4); let prev = sourceUnit; for (const target of pool) { target.hp = Math.max(0, (target.hp ?? 100) - 26); target._stunTimer = Math.max(target._stunTimer || 0, 1.4); target._hitFlash = 0.35; target._consequenceTag = '⚡ Hydro-Conductive Lightning Arc (-26 HP • Wet Zone)!'; target._consequenceTimer = 3.2; this.hydroLightningArcs.push({ x1: prev.x, y1: prev.y, x2: target.x, y2: target.y, label: '⚡ Hydro-Conductive Arc!', life: 0.75, maxLife: 0.75 }); prev = target; } } spawnVerletWhipChain(game, owner, target) { if (!owner || !target) return; if (!Array.isArray(this.verletChains)) this.verletChains = []; const nodes = []; for (let i = 0; i < 8; i++) { const t = i / 7; const nx = owner.x + (target.x - owner.x) * t; const ny = owner.y + (target.y - owner.y) * t; nodes.push({ x: nx, y: ny, oldX: nx, oldY: ny }); } target._consequenceTag = '⛓️ Verlet Whip-Chain Yank (F=285N Tension)!'; target._consequenceTimer = 3.2; this.verletChains.push({ owner, target, nodes, restLen: 12, life: 2.6, maxLife: 2.6 }); } spawnBernoulliVortex(x, y) { if (!Array.isArray(this.bernoulliVortices)) this.bernoulliVortices = []; this.bernoulliVortices.push({ x, y, radius: 92, life: 3.4, maxLife: 3.4, phase: 0 }); } spawnRiverTsunamiWave(x, dirX = 1) { if (!Array.isArray(this.tsunamiWaves)) this.tsunamiWaves = []; this.tsunamiWaves.push({ x, y: RIVER_Y, vx: (dirX >= 0 ? 1 : -1) * 125, width: 68, height: 26, life: 4.2, maxLife: 4.2 }); } spawnFulcrumLeverCatapult(game, x, y, victim) { if (!Array.isArray(this.fulcrumLevers)) this.fulcrumLevers = []; this.fulcrumLevers.push({ id: Date.now() + Math.random(), x, y, angle: -0.38, targetAngle: 0.46, life: 2.8, maxLife: 2.8 }); if (victim) { victim.vz = 195; victim.z = 26; victim._consequenceTag = '🪵 Fulcrum Lever Launch (τ=420 N·m • z=44px)!'; victim._consequenceTimer = 3.8; } } spawnGranularAvalanche(x, y) { if (!Array.isArray(this.avalancheSlides)) this.avalancheSlides = []; const rocks = []; for (let i = 0; i < 8; i++) { rocks.push({ dx: (i - 3.5) * 9 + (Math.random() - 0.5) * 6, dy: (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 18, vy: 58 + Math.random() * 34, r: 4 + (i % 3) * 1.6 }); } this.avalancheSlides.push({ id: Date.now() + Math.random(), x, y, rocks, mu: 0.42, life: 3.2, maxLife: 3.2 }); } spawnSupersonicMachCone(game, x, y, dirX = 1, ownerName = 't101s') { if (!Array.isArray(this.machCones)) this.machCones = []; const dir = dirX >= 0 ? 1 : -1; this.machCones.push({ id: Date.now() + Math.random(), x, y, dir, vx: dir * 165, ownerName, life: 2.2, maxLife: 2.2 }); } spawnElasticPoleVault(unit) { if (!unit) return; if (!Array.isArray(this.elasticPoleVaults)) this.elasticPoleVaults = []; unit.vz = Math.max(unit.vz || 0, 165); unit.z = Math.max(unit.z || 0, 22); unit._consequenceTag = '🎋 Elastic Pole-Vault (U=½kx² • z=34px)!'; unit._consequenceTimer = 3.2; this.elasticPoleVaults.push({ x: unit.x, y: unit.y, unit, bend: 14, life: 2.2, maxLife: 2.2 }); } spawnFerromagneticLorentzField(game, x, y) { if (!Array.isArray(this.magneticFields)) this.magneticFields = []; this.magneticFields.push({ id: Date.now() + Math.random(), x, y, radius: 105, phase: 'attract', life: 3.4, maxLife: 3.4 }); } triggerAdvancedPhysicsShowcase(game, actor) { const u = actor || (game && game.getSelectedUnit ? game.getSelectedUnit() : null) || (game && game.villagers && game.villagers[0]); if (!game || !u) return; const f = u.facing || 1; this.spendPhysicalResource(game, 0, 1, 0, 0); this.spawnRollingBoulder(u.x + 18 * f, u.y, f, 0.12, u.greatTitle || u.name || 'Sovereign'); this.triggerRadialPressureShockwave(game, u.x + 48 * f, u.y + 10, 155, 240, '💥 1/r² Newtonian Shockwave!'); this.spawnFallingTree(u.x - 42 * f, u.y - 18, f); if (Array.isArray(this.treeStumps)) this.treeStumps.push({ x: u.x - 42 * f, y: u.y - 18 }); const targetFoe = (Array.isArray(game.enemies) && game.enemies.find((e) => e && !e.isBoss)) || (Array.isArray(game.villagers) && game.villagers.find((v) => v && v !== u)); this.spawnBladeClashAndDisarm(u.x + 28 * f, u.y + 6, targetFoe || u, true); if (targetFoe) { targetFoe._knockdownTimer = 1.65; targetFoe._rollRecoveryTimer = 0.75; targetFoe.vz = 115; targetFoe._consequenceTag = '\u{1F9B5} Leg-Sweep Knockdown \u2192 \u{1F938} Kip-Up Roll!'; targetFoe._consequenceTimer = 4.0; } if (targetFoe) { this.spawnGrappleShoulderThrow(game, u, targetFoe); } this.spawnImpactCrater(u.x + 48 * f, u.y + 10, 28, '🕳️ Blast Crater (-20% Spd)'); this.spawnMountedCavalryCharge(u.x - 35 * f, u.y + 22, f, u.greatTitle || u.name || 'Sovereign'); if (!this.buoyantRiverObjects) this.buoyantRiverObjects = []; this.buoyantRiverObjects.push({ id: Date.now() + Math.random(), x: u.x, y: RIVER_Y + (Math.random() - 0.5) * 28, vx: 36, type: 'log', label: '🌊 Buoyant Timber Log (Drifting Downstream)', life: 35.0 }); this.windSpeed = 34; this.windAngle = f >= 0 ? 0.18 : Math.PI - 0.18; this.windVx = Math.cos(this.windAngle) * this.windSpeed; this.windVy = Math.sin(this.windAngle) * this.windSpeed * 0.45; if (!this.windGustParticles) this.windGustParticles = []; for (let w = 0; w < 10; w++) { this.windGustParticles.push({ x: u.x + (Math.random() - 0.5) * 260, y: u.y + (Math.random() - 0.5) * 160, vx: this.windVx * 4.2, vy: this.windVy * 4.2, len: 28 + Math.random() * 22, life: 1.4 }); } u.swingAnim = 0.65; const foeFirst = targetFoe ? (targetFoe.name || 'Foe').split('-')[0] : 'Challenger'; const anatPool = [...(Array.isArray(game.enemies) ? game.enemies : []), ...(Array.isArray(game.villagers) ? game.villagers : [])].filter(v => v && v !== u && v.hp > 0); ['head', 'arm', 'leg'].forEach((zone, zIdx) => { const victim = anatPool[zIdx] || targetFoe || u; if (zIdx === 0 && victim) { victim.shieldHp = 25; victim.armorHp = 30; victim.z = 16; } this.resolveAnatomicalHitZone(game, u, victim, 24, zone); }); this.triggerThermoAndHydroConductivity(game, u); if (targetFoe) this.spawnVerletWhipChain(game, u, targetFoe); this.spawnBernoulliVortex(u.x + 54 * f, u.y - 14); this.spawnRiverTsunamiWave(u.x, f); this.spawnFulcrumLeverCatapult(game, u.x - 28 * f, u.y + 18, targetFoe); this.spawnGranularAvalanche(u.x + 68 * f, u.y - 24); this.spawnSupersonicMachCone(game, u.x, u.y - 6, f, u.greatTitle || u.name || 't101s'); this.spawnElasticPoleVault(u); this.spawnFerromagneticLorentzField(game, u.x + 36 * f, u.y + 14); const b0 = Array.isArray(game.buildings) ? game.buildings.find(b => b && b.hp > 0 && b.type !== 'town_center') : null; if (b0) b0._leanAngle = 0.28 * f; u._consequenceTag = '🪵 Fulcrum Lever + ⛰️ Avalanche + 🔊 Mach 1.4 Cone + 🎋 Pole-Vault + 🧲 Lorentz Rail!'; u._consequenceTimer = 4.8; if (typeof document !== 'undefined') { const bannerEl = document.getElementById('eventBannerText'); if (bannerEl) { bannerEl.textContent = `\u{1FAA8} 2.5D PHYSICS: Rolling Boulder + \u{1F332} Timber-Felling Arc + \u2694\uFE0F Blade-Lock Disarm + \u{1F32C}\uFE0F Wind (${this.windSpeed} mph) + \u{1F9B5} Knockdown Roll!`; } } if (typeof game.showToast === 'function') { game.showToast('\u{1FAA8} Triggered 2.5D Rolling Boulder, Timber-Felling Arc, Blade-Lock Disarm, Wind Gusts & Knockdown Roll!', 'amber'); } } triggerOneVsTenArenaTrial(game, champion) { if (!game || !champion || !Array.isArray(game.enemies)) return; champion.knowledge = Math.max(78, (champion.knowledge || 40) + 25); champion.understanding = Math.max(84, (champion.understanding || 45) + 25); champion.wisdom = Math.max(82, (champion.wisdom || 40) + 25); champion.renown = (champion.renown || 20) + 45; champion.chosenLifePath = '🐉 Path of the 1-vs-10 Peerless Master'; const knownRivals = (game.enemies || []).filter((e) => e && !e.isBoss && e !== champion && (e.age ?? 20) >= 18 && (e.hp ?? 100) > 0).slice(0, 10); if (!knownRivals.length) { champion._consequenceTag = '🕊️ NO ADULT RIVALS AVAILABLE FOR TRIAL'; champion._consequenceTimer = 3.5; return; } knownRivals.forEach((foe, k) => { const ang = (k / Math.max(1, knownRivals.length)) * Math.PI * 2; foe.x = wrapX(champion.x + Math.cos(ang) * 52, WORLD_W); foe.y = Math.max(1450, Math.min(WORLD_H - 180, champion.y + Math.sin(ang) * 38)); foe.vx = 0; foe.vy = 0; foe.facing = Math.cos(ang) > 0 ? -1 : 1; foe._isTrialChallenger = true; foe._trialTarget = champion; foe.state = 'attack'; }); if (game.cam) { game.cam.followSelected = false; game.cam.targetX = champion.x; game.cam.targetY = champion.y; if ((game.cam.targetZoom || 1) < 1.25) game.cam.targetZoom = 1.45; if (typeof game.updateZoomHUD === 'function') game.updateZoomHUD(); } champion._whirlwindCd = 0.05; champion._consequenceTag = '🐉 1-vs-10 PEERLESS TRIAL BEGINS!'; champion._consequenceTimer = 4.5; if (typeof document !== 'undefined') { const bannerEl = document.getElementById('eventBannerText'); if (bannerEl) { bannerEl.textContent = `⚔️ 1-vs-${knownRivals.length} TRIAL (Zero Spawning): ${champion.greatTitle || champion.name} faces ${knownRivals.length} known rival warriors!`; } } if (typeof game.updateInspector === 'function') game.updateInspector(); if (typeof game.showToast === 'function') { game.showToast(`⚔️ ${champion.name} enters a 1-vs-10 Trial of Knowledge, Understanding & Wisdom!`, 'amber'); } } stepProjectileAmmoAndResupply(game, u, dt, isEnemy = false) { if (u.bender) { if (typeof u.maxChi !== 'number') { u.maxChi = 8; u.chi = 8; } if ((u._chiCastCd || 0) > 0) u._chiCastCd = Math.max(0, u._chiCastCd - dt); if (u.chi > 0 && ((u.kataTimer || 0) > 0 || (u.swingAnim || 0) > 0.28) && (u._chiCastCd || 0) <= 0) { u._chiCastCd = 1.1; u.chi = Math.max(0, u.chi - 1); } if (u._isSleeping || (u.hunger || 0) < 10) { u.chi = Math.min(u.maxChi, u.chi + dt * 1.4); } } const isBow = u && (u.weaponType === 'bow' || u.isArcher || (u.weaponLabel && u.weaponLabel.toLowerCase().includes('bow'))); if (!isBow) return false; if (typeof u.maxAmmo !== 'number') u.maxAmmo = 12; if (typeof u.ammo !== 'number') u.ammo = 6 + ((u.id || 0) % 7); u._ammoCooldown = Math.max(0, (u._ammoCooldown || 0) - dt); if (!u._resupplyingArrows && (u.state === 'attack' || (u.swingAnim || 0) > 0.28) && u._ammoCooldown <= 0 && u.ammo > 0) { u.ammo = Math.max(0, u.ammo - 1); u._ammoCooldown = 0.85; } if (u.ammo <= 0) u._resupplyingArrows = true; if (u._resupplyingArrows) { u._roleBadge = '🏹 Out of Arrows (0/12)! Walking to Store to Craft More!'; const ownerId = isEnemy ? u.aiOwnerId : 'player'; const candidates = (game.buildings || []).filter((b) => b && b.owner === ownerId && (b.type === 'market' || b.type === 'town_center' || b.type === 'barracks')); let storeB = null; let bestDist = Infinity; for (const b of candidates) { const d = Math.hypot(wrapDX(u.x, b.x), b.y - u.y); if (d < bestDist) { bestDist = d; storeB = b; } } if (!storeB && game.buildings && game.buildings[0]) storeB = game.buildings[0]; if (storeB) { const dx = wrapDX(u.x, storeB.x); const dy = storeB.y - u.y; const dist = Math.hypot(dx, dy); if (dist > (storeB.radius || 32) + 18) { u.x = wrapX(u.x + (dx / Math.max(1, dist)) * 52 * dt, WORLD_W); u.y += (dy / Math.max(1, dist)) * 38 * dt; u.state = 'move'; u._motiveBadge = u._roleBadge; return true; } if (!isEnemy) this.spendPhysicalResource(game, 2, 1, 0, 0); u.ammo = u.maxAmmo; u._resupplyingArrows = false; u._consequenceTag = '🏹 Crafted +12 Arrows (-2🪵 -1🪨)'; u._consequenceTimer = 3.2; if (Array.isArray(this.depositPopups)) { this.depositPopups.push({ x: storeB.x, y: storeB.y - 30, text: '🏹 Crafted +12 Arrows (-2🪵 -1🪨)', color: '#38bdf8', life: 2.0, maxLife: 2.0 }); } } return true; } return false; } stepKnowledgeWisdomAndGreatness(game, u, dt, isEnemy = false) { if (!u || u.isBoss) return; if (typeof u.knowledge !== 'number') { const s = u.id || 1; u.knowledge = u.isT101s ? 88 : 22 + (s * 13) % 45; u.understanding = u.isT101s ? 92 : 20 + (s * 17) % 48; u.wisdom = u.isT101s ? 90 : 18 + (s * 19) % 46; u.renown = u.isT101s ? 95 : 10 + (s * 11) % 35; const PATHS = ['⚔️ Path of the 1-vs-10 Peerless Fighter', '🦉 Path of the All-Wise Sage', '🏛️ Path of the Grand Architect', '👑 Path of the Sovereign Conqueror']; u.chosenLifePath = u.isT101s ? '👑 Path of the One Ring Sovereign' : PATHS[s % PATHS.length]; } if (u.state === 'chop' || u.state === 'build') { u.knowledge = Math.min(100, u.knowledge + dt * 0.45); u.understanding = Math.min(100, u.understanding + dt * 0.35); } else if (u.state === 'attack' || (u.swingAnim || 0) > 0.05) { u.understanding = Math.min(100, u.understanding + dt * 0.85); u.wisdom = Math.min(100, u.wisdom + dt * 0.55); } const opponents = isEnemy ? (game.villagers || []) : (game.enemies || []); const foes = []; for (const f of opponents) { if (f && (f.hp ?? 100) > 0 && Math.hypot(wrapDX(u.x, f.x), u.y - f.y) < 115) { foes.push(f); if (foes.length >= 10) break; } } u._outnumberedCount = foes.length; if (foes.length >= 2 && ((u.understanding || 0) >= 35 || u.isT101s || (u.level || 1) >= 2)) { u._whirlwindCd = (u._whirlwindCd || 0) - dt; if (u._whirlwindCd <= 0) { u._whirlwindCd = 0.82; u.swingAnim = 0.65; u.blockAnim = 0.45; u.dodgeAnim = 0.32; const mult = 1 + 0.18 * foes.length + ((u.understanding || 40) + (u.wisdom || 40)) / 200; const dmg = Math.round((u.attack || 22) * mult); let defeated = 0; for (const f of foes) { f.hp = Math.max(0, (f.hp || 120) - dmg); f.hitFlash = 0.22; const dxF = wrapDX(u.x, f.x), dyF = f.y - u.y, dF = Math.max(6, Math.hypot(dxF, dyF)); f.kx = (dxF / dF) * 135; f.ky = (dyF / dF) * 135; f.vz = 125; this.resolveAnatomicalHitZone(game, u, f, dmg); if (f.hp <= 0) { defeated++; const idx = opponents.indexOf(f); if (idx !== -1 && !f.isBoss && !f.isT101s) opponents.splice(idx, 1); } } u.hp = Math.min(u.maxHp || 250, (u.hp || 200) + foes.length * 8); u.renown = (u.renown || 10) + foes.length * 4 + defeated * 12; u.kills = (u.kills || 0) + defeated; u.understanding = Math.min(100, (u.understanding || 40) + 4); u.wisdom = Math.min(100, (u.wisdom || 40) + 4); this.awardUnitXP(u, 22 + foes.length * 5, '1-vs-10 Mastery'); u._consequenceTag = `🐉 1-vs-${foes.length} Counter-Sweep! (-${dmg} HP to all • ${u.greatTitle || 'Rising Legend'})`; u._consequenceTimer = 2.8; } } const baseName = (u.baseName || u.name || 'Hero').replace(/ the Great| the Peerless| the Wise/gi, ''); u.baseName = baseName; const totalMind = (u.knowledge || 0) + (u.understanding || 0) + (u.wisdom || 0); if ((u.renown || 0) >= 85 || (u.kills || 0) >= 6 || totalMind >= 235 || u.isT101s) { if (!u._crownedGreat) { u._crownedGreat = true; u.greatTitle = `${baseName.split('-')[0]} THE GREAT`; u.maxHp = (u.maxHp || 220) + 120; u.hp = u.maxHp; u.attack = (u.attack || 22) + 18; u._consequenceTag = `👑 Ascended as "${u.greatTitle}"!`; this.logChronicleEvent(`👑 ${u.greatTitle} ascended in glory!`); u._consequenceTimer = 5.5; } } else if ((u.renown || 0) >= 50 || (u.understanding || 0) >= 65) u.greatTitle = `${baseName.split('-')[0]} the Peerless`; else if ((u.wisdom || 0) >= 65) u.greatTitle = `${baseName.split('-')[0]} the Wise`; } awardUnitXP(u, amount = 10, reason = 'Practice') { if (!u || u.isBoss) return; if (typeof u.xp !== 'number') u.xp = 20 + ((u.id || 0) % 5) * 15; if (typeof u.level !== 'number') u.level = 1; if (!Array.isArray(u.unlockedSkills)) u.unlockedSkills = ['Basic Training']; u.xp += amount; if (u.xp >= u.level * 100 && u.level < 10) { u.level += 1; u._levelUpTimer = 3.5; u.maxHp = (u.maxHp || 180) + 28; u.hp = Math.min(u.maxHp, (u.hp || 180) + 45); u.attack = (u.attack || 16) + 4; const RANKS = ['Novice', 'Novice', 'Apprentice', 'Adept', 'Master', 'Grandmaster']; u.rankTitle = RANKS[Math.min(5, u.level)] || `Lv.${u.level} Legend`; let newSkill = ''; if (u.bender) { if (u.level === 2) newSkill = u.bender === 'fire' ? 'Jet-Stepping' : u.bender === 'water' ? 'Wave-Surfing' : u.bender === 'earth' ? 'Seismic Sense' : 'Air-Scooter'; else if (u.level === 3) newSkill = `${u.bender.toUpperCase()} Bulwark Shield`; else if (u.level === 4) { u.subElement = u.bender === 'fire' ? 'lightning' : u.bender === 'water' ? 'ice' : u.bender === 'earth' ? 'lava' : 'flight'; newSkill = u.bender === 'fire' ? '⚡ Lightning Generation' : u.bender === 'water' ? '❄️ Ice & Blood Mastery' : u.bender === 'earth' ? '🌋 Lavabending' : '🦅 Weightless Flight'; } else newSkill = '⛩️ Elemental Grandmaster'; } else if (u.talent === 'martial_prodigy' || u.weaponType || u.profession === 'soldier' || u.profession === 'hunter') { if (u.level === 2) newSkill = '🛡️ Shield Parry & Dodge'; else if (u.level === 3) { u.talent = 'martial_prodigy'; newSkill = `⚔️ ${u.weaponLabel || 'Weapon'} Crit Mastery`; } else if (u.level === 4) newSkill = '🦣 Prehistoric Mount Mastery'; else newSkill = '👑 Warlord Command'; } else { if (u.level === 2) newSkill = '💪 Strong Back (-50% Load Drag)'; else if (u.level === 3) { u.talent = 'master_artisan'; newSkill = '⚒️ Master Artisan (+50% Speed)'; } else if (u.level === 4) newSkill = '⚖️ Merchant Tycoon (+4🪙 Wage)'; else newSkill = '🏛️ Guild Grandmaster'; } if (newSkill && !u.unlockedSkills.includes(newSkill)) u.unlockedSkills.push(newSkill); u._consequenceTag = `⬆️ LEVEL UP! Lv.${u.level} ${u.rankTitle} • Unlocked: ${newSkill || reason}!`; u._consequenceTimer = 4.2; } } spendPhysicalResource(game, costWood = 0, costStone = 0, costFood = 0, costGold = 0) { if (!game || !game.resources) return false; const r = game.resources; if ((r.wood || 0) < costWood || (r.stone || 0) < costStone || (r.food || 0) < costFood || (r.gold || 0) < costGold) return false; r.wood = Math.max(0, (r.wood || 0) - costWood); r.stone = Math.max(0, (r.stone || 0) - costStone); r.food = Math.max(0, (r.food || 0) - costFood); r.gold = Math.max(0, (r.gold || 0) - costGold); game._authorizedResourceSnapshot = { ...r }; if (typeof game.updateHUD === 'function') game.updateHUD(); if (typeof document !== 'undefined') { const wEl = document.getElementById('resWood'); const sEl = document.getElementById('resStone'); const fEl = document.getElementById('resFood'); const gEl = document.getElementById('resGold'); if (wEl) wEl.textContent = Math.floor(r.wood); if (sEl) sEl.textContent = Math.floor(r.stone); if (fEl) fEl.textContent = Math.floor(r.food); if (gEl) gEl.textContent = Math.floor(r.gold); } return true; } resolveSmartLabelY(sx, sy, textWidth = 110, isPriority = false) { if (this.labelMode === 'minimal' && !isPriority) return null; if (this.labelMode === 'all') return sy; if (!Array.isArray(this._frameLabelBoxes)) this._frameLabelBoxes = []; let y = sy; for (let i = 0; i < 3; i++) { const hit = this._frameLabelBoxes.some(b => Math.abs(b.y - y) < 11 && sx + textWidth * 0.5 > b.x1 && sx - textWidth * 0.5 < b.x2); if (!hit) break; y -= 12; } this._frameLabelBoxes.push({ x1: sx - textWidth * 0.5, x2: sx + textWidth * 0.5, y }); return y; } loadKnownWorld(game) { if (!game || typeof localStorage === 'undefined') return false; try { const raw = localStorage.getItem('one_ring_known_world_v1'); if (!raw) return false; const data = JSON.parse(raw); if (!data) return false; if (data.resources && game.resources) Object.assign(game.resources, data.resources); if (Array.isArray(data.villagers) && Array.isArray(game.villagers)) { for (const sv of data.villagers) { const v = game.villagers.find(u => u && (u.id === sv.id || (sv.name && u.name === sv.name))); if (v) { if (typeof sv.x === 'number') v.x = sv.x; if (typeof sv.y === 'number') v.y = sv.y; if (typeof sv.hp === 'number') v.hp = sv.hp; if (typeof sv.k === 'number') v.knowledge = sv.k; if (typeof sv.u === 'number') v.understanding = sv.u; if (typeof sv.w === 'number') v.wisdom = sv.w; if (typeof sv.gold === 'number') v.walletGold = sv.gold; } } } if (Array.isArray(data.buildings) && Array.isArray(game.buildings)) { for (const sb of data.buildings) { const b = game.buildings.find(bd => bd && (bd.id === sb.id || (sb.name && bd.name === sb.name))); if (b && typeof sb.hp === 'number') b.hp = sb.hp; } } this.logChronicleEvent(`📂 Loaded Known World Snapshot (${(data.villagers || []).length} Citizens Restored)!`); if (typeof game.showToast === 'function') game.showToast(`📂 Loaded Known World Snapshot (${(data.villagers || []).length} Citizens Restored)!`, 'lime'); this._lastCensusRenderMs = 0; this.updateWorldCensusHUD(game); return true; } catch (_) { return false; } } ransomCapturedPrisoner(game) { if (!game) return; const all = [...(game.enemies || []), ...(game.villagers || [])]; const pris = all.find(u => u && u._isCapturedPrisoner && !u.deceased); if (!pris) { if (typeof game.showToast === 'function') game.showToast('⛓️ No captured prisoners in the Stockade to ransom!', 'amber'); return; } pris._isCapturedPrisoner = false; pris._motiveBadge = '🕊️ Ransomed & Released'; pris.hp = Math.max(pris.hp || 1, Math.round((pris.maxHp || 100) * 0.5)); pris.x = Math.min(WORLD_W - 80, (pris.x || 560) + 180); if (game.resources) { game.resources.gold = (game.resources.gold || 0) + 25; game._authorizedResourceSnapshot = { ...game.resources }; if (typeof game.updateHUD === 'function') game.updateHUD(); if (typeof document !== 'undefined') { const gEl = document.getElementById('resGold'); if (gEl) gEl.textContent = Math.floor(game.resources.gold); } } this.logChronicleEvent(`🪙 Ransomed prisoner ${pris.name} for +25🪙 Gold!`); if (typeof game.showToast === 'function') game.showToast(`🪙 Ransomed ${pris.name} for +25🪙 Gold!`, 'emerald'); } logChronicleEvent(text) { if (!this.worldChronicle) this.worldChronicle = []; const now = new Date(); const mm = String(now.getMinutes()).padStart(2, '0'); const ss = String(now.getSeconds()).padStart(2, '0'); this.worldChronicle.unshift({ time: `${mm}:${ss}`, text }); if (this.worldChronicle.length > 24) this.worldChronicle.length = 24; } saveKnownWorld(game) { if (!game || typeof localStorage === 'undefined') return false; try { const payload = { savedAt: Date.now(), villagers: (game.villagers || []).map(u => ({ id: u.id, name: u.name, age: u.age, hp: u.hp, maxHp: u.maxHp, x: u.x, y: u.y, role: u.role, greatTitle: u.greatTitle })), rivals: (game.enemies || []).map(e => ({ id: e.id, name: e.name, tribe: e.tribeName || e.tribe, age: e.age, hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y, isBoss: e.isBoss })), buildings: (game.buildings || []).map(b => ({ id: b.id, name: b.name, type: b.type, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp })), resources: game.resources || {}, chronicle: this.worldChronicle || [] }; localStorage.setItem('one_ring_known_world_v1', JSON.stringify(payload)); this.logChronicleEvent(`💾 Known World Saved (${payload.villagers.length} citizens, ${payload.rivals.length} rivals, ${payload.buildings.length} structures)`); if (typeof game.showToast === 'function') game.showToast('💾 Known World saved!', 'lime'); this._lastCensusRenderMs = 0; this.updateWorldCensusHUD(game); return true; } catch (_) { return false; } } recruitKnownRival(game) { if (!game || !Array.isArray(game.enemies) || !Array.isArray(game.villagers)) return null; const idx = game.enemies.findIndex(e => e && !e.isBoss && e.hp > 0 && (e.age ?? 22) >= 16); if (idx === -1) { if (typeof game.showToast === 'function') game.showToast('No eligible adult rival available to recruit.', 'amber'); return null; } const [rival] = game.enemies.splice(idx, 1); const rName = (rival.name || 'Wanderer').split('-')[0]; const rTribe = rival.tribeName || rival.tribe || 'Rival Tribe'; rival.isEnemy = false; rival.tribe = 'Aethelgard'; rival.tribeName = 'Aethelgard'; rival._consequenceTag = `🤝 Migrated from ${rTribe}!`; rival._consequenceTimer = 4.5; game.villagers.push(rival); this.logChronicleEvent(`🤝 ${rName} migrated from ${rTribe} to Aethelgard!`); if (typeof game.showToast === 'function') game.showToast(`🤝 ${rName} joined Aethelgard!`, 'lime'); this._lastCensusRenderMs = 0; this.updateWorldCensusHUD(game); return rival; } updateWorldCensusHUD(game) { if (!game || typeof document === 'undefined') return; const playerHumans = Array.isArray(game.villagers) ? game.villagers.filter((v) => v && (v.hp ?? 1) > 0).length : 0; const rivalHumans = Array.isArray(game.enemies) ? game.enemies.filter((e) => e && !e.isBoss && (e.hp ?? 1) > 0).length : 0; const totalHumans = playerHumans + rivalHumans; const buildings = Array.isArray(game.buildings) ? game.buildings : []; const totalHouses = buildings.filter((b) => b && b.type === 'hut').length; const totalStructures = buildings.length; const totalNodes = Array.isArray(game.resourcesNodes) ? game.resourcesNodes.length : 0; const btn = document.getElementById('btnWorldCensus'); if (btn) btn.textContent = `📊 Census: ${totalHumans} Humans • ${totalHouses} Houses (${totalStructures} Bldgs) • 🚫0 Spawns`; const panel = document.getElementById('oneRingCensusPanel'); const body = document.getElementById('oneRingCensusBody'); if (panel && body && !panel.classList.contains('hidden') && panel.style.display !== 'none') { if (!body._delegatedBound) { body._delegatedBound = true; body.onclick = (ev) => { const t = ev?.target; if (!t || typeof t.closest !== 'function') return; if (t.closest('#btnSaveKnownWorld')) { this.saveKnownWorld(game); return; } if (t.closest('#btnLoadKnownWorld')) { this.loadKnownWorld(game); return; } if (t.closest('#btnRecruitRivalInPanel')) { this.recruitKnownRival(game); return; } if (t.closest('#btnRansomPrisonerInPanel')) { this.ransomCapturedPrisoner(game); return; } const jumpEl = t.closest('[data-jump-uid]'); if (jumpEl) { const uid = Number(jumpEl.getAttribute('data-jump-uid')); const found = [...(game.villagers || []), ...(game.enemies || [])].find(x => x && Number(x.id) === uid); if (found) { game.selectedIds = [found.id]; if (game.cam) { game.cam.targetX = found.x; game.cam.targetY = found.y; } if (typeof game.updateInspector === 'function') game.updateInspector(); if (typeof game.updateZoomHUD === 'function') game.updateZoomHUD(); if (typeof game.showToast === 'function') game.showToast(`🎯 Focused on ${(found.name || 'Human').split('-')[0]}`, 'sky'); } } }; } const nowMs = Date.now(); if (this._lastCensusRenderMs && nowMs - this._lastCensusRenderMs < 550) return; this._lastCensusRenderMs = nowMs; const tribeCounts = new Map(); for (const v of (game.villagers || [])) { if (!v || (v.hp ?? 1) <= 0) continue; const t = v.tribeName || v.tribe || 'Player Tribe'; tribeCounts.set(t, (tribeCounts.get(t) || 0) + 1); } for (const e of (game.enemies || [])) { if (!e || e.isBoss || (e.hp ?? 1) <= 0) continue; const t = e.tribeName || e.tribe || 'Rival Tribe'; tribeCounts.set(t, (tribeCounts.get(t) || 0) + 1); } const rows = Array.from(tribeCounts.entries()).map(([t, c]) => `<div class="flex justify-between text-xs py-0.5 border-b border-slate-700/60"><span>${t}</span><span class="font-bold text-amber-300">${c}</span></div>`).join(''); body.innerHTML = `<div class="text-xs text-slate-300 mb-2">Humans: <b>${totalHumans}</b> (${playerHumans} Player / ${rivalHumans} Rival) • Houses: <b>${totalHouses}</b> • Structures: <b>${totalStructures}</b> • Nodes: <b>${totalNodes}</b> • Spawns: <b class="text-emerald-400">🚫 0</b></div>${rows || '<div class="text-xs text-slate-400">No living humans recorded.</div>'}<div class="flex gap-2 my-2"><button id="btnSaveKnownWorld" class="px-2 py-1 text-xs font-bold rounded bg-emerald-700 hover:bg-emerald-600 text-white">💾 Save World</button><button id="btnLoadKnownWorld" class="px-2 py-1 text-xs font-bold rounded bg-sky-700 hover:bg-sky-600 text-white">📂 Load</button><button id="btnRecruitRivalInPanel" class="px-2 py-1 text-xs font-bold rounded bg-amber-700 hover:bg-amber-600 text-white">🤝 Recruit Rival</button><button id="btnRansomPrisonerInPanel" class="px-2 py-1 text-xs font-bold rounded bg-yellow-700 hover:bg-yellow-600 text-white">🪙 Ransom</button></div><div class="text-xs font-bold text-amber-300 mt-2 mb-1">📖 Clickable Known Humans</div><div class="max-h-36 overflow-y-auto">${[...(game.villagers || []).filter(v => v && (v.hp ?? 1) > 0).map(v => ({ u: v, icon: '🧑' })), ...(game.enemies || []).filter(e => e && !e.isBoss && (e.hp ?? 1) > 0).map(e => ({ u: e, icon: '⚔️' }))].map(({ u, icon }) => `<div data-jump-uid="${u.id}" class="flex justify-between text-xs py-0.5 px-1 rounded hover:bg-slate-700/60 cursor-pointer border-b border-slate-800"><span>${icon} ${(u.name || 'Human').split('-')[0]} (Age ${Math.floor(u.age ?? 20)})</span><span class="text-emerald-300">HP ${Math.ceil(u.hp ?? 0)}/${Math.ceil(u.maxHp ?? u.hp ?? 100)}</span></div>`).join('') || '<div class="text-xs text-slate-400">None</div>'}</div><div class="text-xs font-bold text-sky-300 mt-2 mb-1">📜 World Chronicle</div><div class="max-h-32 overflow-y-auto">${(this.worldChronicle || []).slice(0, 12).map(ev => `<div class="text-xs text-slate-300 py-0.5 border-b border-slate-800/70"><span class="text-amber-400 font-mono">[${ev.time}]</span> ${ev.text}</div>`).join('') || '<div class="text-xs text-slate-400">No events yet.</div>'}</div>`;  } } syncOneRingBrandingAndUI(game) { if (typeof document === 'undefined') return; if (document.title !== 'One Ring') document.title = 'One Ring'; if (!document.getElementById('oneRingMobileStyles')) { const style = document.createElement('style'); style.id = 'oneRingMobileStyles'; style.textContent = `.hud-interactive .flex-wrap, #unitActionGroup { flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; max-width: 96vw !important; scrollbar-width: none !important; gap: 4px !important; padding-bottom: 2px !important; } .hud-interactive .flex-wrap::-webkit-scrollbar, #unitActionGroup::-webkit-scrollbar { display: none !important; } .hud-interactive button, #unitActionGroup button { flex-shrink: 0 !important; white-space: nowrap !important; } body.or-compact-hud header, body.or-compact-hud .fixed.top-0 { max-height: 11vh !important; overflow: hidden !important; } body.or-compact-hud #planetaryRadarContainer, body.or-compact-hud canvas#radarCanvas { max-height: 30px !important; } @media (max-width: 900px) { .hud-interactive { font-size: 9px !important; padding: 3px 5px !important; } .hud-interactive button { padding: 2px 6px !important; font-size: 9px !important; } }`; document.head.appendChild(style); if (typeof window !== 'undefined' && window.innerWidth <= 900) document.body.classList.add('or-compact-hud'); if (game && game.canvas && !game.canvas._orTouchBound) { game.canvas._orTouchBound = true; let lastDist = 0, sx = 0, sy = 0, moved = false; game.canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); else if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; moved = false; } }, { passive: true }); game.canvas.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && game.cam) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (lastDist > 10) { game.cam.targetZoom = Math.max(0.12, Math.min(3.2, (game.cam.targetZoom || 1) * (d / lastDist))); if (typeof game.updateZoomHUD === 'function') game.updateZoomHUD(); } lastDist = d; } else if (e.touches.length === 1 && Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 14) moved = true; }, { passive: true }); game.canvas.addEventListener('touchend', (e) => { if (!moved && e.changedTouches && e.changedTouches.length === 1 && typeof game.handleWorldTap === 'function') { game.handleWorldTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY, true); } }, { passive: true }); } } const ageEl = document.getElementById('ageTitleText'); if (ageEl && !ageEl.textContent.includes('ONE RING')) ageEl.textContent = `💍 ONE RING • ${ageEl.textContent}`; const bannerEl = document.getElementById('eventBannerText'); if (bannerEl && bannerEl.textContent.includes('Prehistoric Tribes')) bannerEl.textContent = bannerEl.textContent.replace('Prehistoric Tribes', 'One Ring'); const actionGroup = document.getElementById('unitActionGroup'); if (actionGroup && !document.getElementById('btnWorldCensus')) { const btnCensus = document.createElement('button'); btnCensus.id = 'btnWorldCensus'; btnCensus.className = 'px-2 py-1 rounded bg-emerald-800/90 hover:bg-emerald-700 text-white font-bold text-[10px] shadow'; btnCensus.textContent = '📊 Census: 0 Humans • 0 Houses (0 Bldgs) • 🚫0 Spawns'; btnCensus.onclick = () => { const p = document.getElementById('oneRingCensusPanel'); if (p) { const hidden = p.classList.toggle('hidden'); p.style.display = hidden ? 'none' : 'block'; if (!hidden) this.updateWorldCensusHUD(game); } }; actionGroup.prepend(btnCensus); } if (!document.getElementById('oneRingCensusPanel')) { const panel = document.createElement('div'); panel.id = 'oneRingCensusPanel'; panel.className = 'hidden fixed top-16 right-4 z-50 w-80 max-h-96 overflow-y-auto rounded-lg bg-slate-900/95 border border-amber-500/40 p-3 text-white shadow-2xl'; panel.style.display = 'none'; panel.innerHTML = '<div class="flex items-center justify-between mb-2"><span class="font-bold text-sm text-amber-300">🌍 One Ring Known World Census</span><button id="closeOneRingCensusPanel" class="text-xs px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600">✕</button></div><div id="oneRingCensusBody"></div>'; document.body.appendChild(panel); const closeBtn = document.getElementById('closeOneRingCensusPanel'); if (closeBtn) closeBtn.onclick = () => { panel.classList.add('hidden'); panel.style.display = 'none'; }; } if (actionGroup && !document.getElementById('btnToggleLabelMode')) { const btnLbl = document.createElement('button'); btnLbl.id = 'btnToggleLabelMode'; btnLbl.className = 'px-2 py-1 rounded bg-slate-700/90 hover:bg-slate-600 text-white font-bold text-[10px] shadow'; btnLbl.textContent = '🏷️ Labels: Smart'; btnLbl.onclick = () => { const modes = ['smart', 'minimal', 'all']; this.labelMode = modes[(modes.indexOf(this.labelMode || 'smart') + 1) % modes.length]; btnLbl.textContent = this.labelMode === 'minimal' ? '🏷️ Labels: MINIMAL' : this.labelMode === 'all' ? '🏷️ Labels: ALL' : '🏷️ Labels: Smart'; }; actionGroup.prepend(btnLbl); } if (actionGroup && !document.getElementById('btnToggleSyxLaw')) { const btnSyx = document.createElement('button'); btnSyx.id = 'btnToggleSyxLaw'; btnSyx.className = 'px-2 py-1 rounded bg-amber-700/90 hover:bg-amber-600 text-white font-bold text-[10px] shadow'; btnSyx.textContent = '⚖️ Syx Law: Balanced'; btnSyx.onclick = () => { const modes = ['balanced', 'utopia', 'tyranny']; this.syxLawMode = modes[(modes.indexOf(this.syxLawMode || 'balanced') + 1) % modes.length]; btnSyx.textContent = this.syxLawMode === 'utopia' ? '⚖️ Syx Law: Utopia (+😊)' : (this.syxLawMode === 'tyranny' ? '⚖️ Syx Law: Tyranny (+⚖️)' : '⚖️ Syx Law: Balanced'); }; actionGroup.prepend(btnSyx); } if (actionGroup && !document.getElementById('btnToggleCutaway')) { const btnCutaway = document.createElement('button'); btnCutaway.id = 'btnToggleCutaway'; btnCutaway.className = 'px-2 py-1 rounded bg-stone-700/90 hover:bg-stone-600 text-amber-200 font-bold text-[10px] shadow'; btnCutaway.textContent = this.syxCutawayRooms ? '🏛️ Cutaway Rooms: ON' : '🏛️ Cutaway Rooms: OFF'; btnCutaway.onclick = () => { this.syxCutawayRooms = !this.syxCutawayRooms; btnCutaway.textContent = this.syxCutawayRooms ? '🏛️ Cutaway Rooms: ON' : '🏛️ Cutaway Rooms: OFF'; }; actionGroup.prepend(btnCutaway); } if (actionGroup && !document.getElementById('btnToggleDayWeather')) { const btnDW = document.createElement('button'); btnDW.id = 'btnToggleDayWeather'; btnDW.className = 'px-2 py-1 rounded bg-indigo-800/90 hover:bg-indigo-700 text-amber-100 font-bold text-[10px] shadow'; const _dwLabel = () => this.lightingMode === 'dusk' ? '🌧️ Dusk • Rain (Mud μ=0.78)' : (this.lightingMode === 'night' ? '🌙 Night • Frost (Torch Glow)' : '🌤️ Day • Clear'); btnDW.textContent = _dwLabel(); btnDW.onclick = () => { const seq = ['day', 'dusk', 'night']; const idx = (seq.indexOf(this.lightingMode || 'day') + 1) % seq.length; this.lightingMode = seq[idx]; this.weatherMode = this.lightingMode === 'dusk' ? 'rain' : (this.lightingMode === 'night' ? 'frost' : 'clear'); btnDW.textContent = _dwLabel(); }; actionGroup.prepend(btnDW); } if (actionGroup && !document.getElementById('btnUniversalCycle')) { const btnSiege = document.createElement('button'); btnSiege.id = 'btnCommandDemolish'; btnSiege.className = 'px-2 py-1 rounded bg-rose-700/90 hover:bg-rose-600 text-white font-bold text-[10px] shadow'; btnSiege.textContent = '💥 Attack Structure'; btnSiege.onclick = () => { const u = game.getSelectedUnit ? game.getSelectedUnit() : null; if (u && Array.isArray(game.buildings) && game.buildings.length > 0) { const candidates = game.buildings.filter(b => b && (b.type === 'market' || b.type === 'hut')); const pool = candidates.length > 0 ? candidates : game.buildings; let bestB = null, bestD = Infinity; for (const b of pool) { if (!b) continue; const d = Math.hypot(wrapDX(u.x, b.x), u.y - b.y); if (d < bestD) { bestD = d; bestB = b; } } if (bestB) { bestB.hp = bestB.hp ?? (bestB.maxHp || 600); bestB.maxHp = bestB.maxHp || 600; u._attackBuildingTarget = bestB; u._directMoveTimer = 0; u._forcedGatherType = null; u._consequenceTag = `💥 Commanded: Attack & Destroy ${bestB.name}!`; u._consequenceTimer = 4.0; } } }; actionGroup.prepend(btnSiege); const btnCycle = document.createElement('button'); btnCycle.id = 'btnUniversalCycle'; btnCycle.className = 'px-2 py-1 rounded bg-amber-600/90 hover:bg-amber-500 text-white font-bold text-[10px] shadow'; btnCycle.textContent = '👁️ Inspect Next Human/Raider'; btnCycle.onclick = () => { const all = [...(game.villagers || []), ...(game.enemies || [])]; if (!all.length) return; this._universalCycleIdx = (this._universalCycleIdx + 1) % all.length; const picked = all[this._universalCycleIdx]; if (picked) { game.selectedIds = [picked.id]; game.duelCamActive = false; if (game.cam) { game.cam.followSelected = false; game.cam.targetX = picked.x; game.cam.targetY = picked.y; if (game.cam.targetZoom < 1.15) game.cam.targetZoom = 1.35; } if (typeof game.updateInspector === 'function') game.updateInspector(); if (typeof game.updateZoomHUD === 'function') game.updateZoomHUD(); } }; const btnCut = document.createElement('button'); btnCut.id = 'btnCommandCutWood'; btnCut.className = 'px-2 py-1 rounded bg-emerald-700/90 hover:bg-emerald-600 text-white font-bold text-[10px] shadow'; btnCut.textContent = '🌲 Cut Wood → Store'; btnCut.onclick = () => { const u = game.getSelectedUnit ? game.getSelectedUnit() : null; if (u) { u._forcedGatherType = 'tree'; u._directMoveTimer = 0; u._consequenceTag = '🌲 Commanded: Cut Wood → Take to Store!'; u._consequenceTimer = 4.0; } }; const btnEnv = document.createElement('button'); btnEnv.id = 'btnCommandEnvoy'; btnEnv.className = 'px-2 py-1 rounded bg-sky-700/90 hover:bg-sky-600 text-white font-bold text-[10px] shadow'; btnEnv.textContent = '🕊️ Dispatch Envoy'; btnEnv.onclick = () => this.spawnDiplomaticEnvoy(game, null, 'PEACE & TRADE PACT'); actionGroup.prepend(btnEnv); actionGroup.prepend(btnCut); actionGroup.prepend(btnCycle); } if (actionGroup && !document.getElementById('btnToggleCompactHUD')) { const btnMobileHUD = document.createElement('button'); btnMobileHUD.id = 'btnToggleCompactHUD'; btnMobileHUD.className = 'px-2 py-1 rounded bg-slate-700/90 hover:bg-slate-600 text-amber-300 font-bold text-[10px] shadow'; btnMobileHUD.textContent = '📱 Compact HUD'; btnMobileHUD.onclick = () => { document.body.classList.toggle('or-compact-hud'); }; actionGroup.prepend(btnMobileHUD); } if (actionGroup && !document.getElementById('btnCommandBoulder')) { const btnBoulder = document.createElement('button'); btnBoulder.id = 'btnCommandBoulder'; btnBoulder.className = 'px-2 py-1 rounded bg-amber-700/90 hover:bg-amber-600 text-white font-bold text-[10px] shadow'; btnBoulder.textContent = '\u{1FAA8} Boulder & Physics'; btnBoulder.onclick = () => { const u = game.getSelectedUnit ? game.getSelectedUnit() : null; this.triggerAdvancedPhysicsShowcase(game, u); }; actionGroup.prepend(btnBoulder); } if (actionGroup && !document.getElementById('btnCommand1v10')) { const btn1v10 = document.createElement('button'); btn1v10.id = 'btnCommand1v10'; btn1v10.className = 'px-2 py-1 rounded bg-purple-700/90 hover:bg-purple-600 text-white font-bold text-[10px] shadow'; btn1v10.textContent = '⚔️ 1-vs-10 Trial (Become GREAT)'; btn1v10.onclick = () => { const u = game.getSelectedUnit ? game.getSelectedUnit() : null; if (u) this.triggerOneVsTenArenaTrial(game, u); }; actionGroup.prepend(btn1v10); } } spawnDiplomaticEnvoy(game, targetAI = null, pactTitle = 'ALLIANCE & TRADE TREATY') { if (!game || !Array.isArray(game.aiPlayers) || !game.aiPlayers.length) return; const ai = targetAI || game.aiPlayers[this.diplomaticEnvoys.length % game.aiPlayers.length]; if (!ai) return; this.diplomaticEnvoys.push({ id: Date.now() + Math.random(), x: 780, y: 2290, startX: 780, targetX: ai.x || 2800, yPos: 2290, vx: 62, returning: false, aiName: ai.tribe || 'Sun-Spear Dynasty', pactTitle, bannerColor: ai.color || '#10b981', statusLabel: `🕊️ Envoy → ${ai.tribe} (${pactTitle})` }); this.treatyCeremonies.push({ x: 780, y: 2300, life: 4.5, maxLife: 4.5, title: `📜 Envoy Dispatched: ${pactTitle} with ${ai.tribe}!` }); } stepPhysicalHarvestAndStoreCycle(game, u, dt, isEnemy = false) { if (!Array.isArray(game.resourcesNodes) || !Array.isArray(game.buildings)) return; if ((u._directMoveTimer || 0) > 0) { u._directMoveTimer = Math.max(0, u._directMoveTimer - dt); const dx = wrapDX(u.x, u._cmdTargetX || u.x), dy = (u._cmdTargetY || u.y) - u.y, dist = Math.hypot(dx, dy); if (dist > 14) { u.x = wrapX(u.x + (dx / dist) * 52 * dt, WORLD_W); u.y += (dy / dist) * 38 * dt; u.state = 'move'; u._roleBadge = `👑 Commanded Move → (${Math.round(u._cmdTargetX)}, ${Math.round(u._cmdTargetY)})`; return; } u._directMoveTimer = 0; } const ownerId = isEnemy ? u.aiOwnerId : 'player'; const storeB = game.buildings.find((b) => b && b.owner === ownerId && b.type === 'market') || game.buildings.find((b) => b && b.owner === ownerId && b.type === 'town_center') || game.buildings[0]; if ((u.carryAmount || 0) < 5) { let targetNode = u._targetNodeRef; if (!targetNode || (targetNode.amount || 0) <= 0 || !game.resourcesNodes.includes(targetNode)) { const wantType = u._forcedGatherType || (u.id % 3 === 0 ? 'stone' : 'tree'); let bestD = Infinity; targetNode = null; for (const n of game.resourcesNodes) { if (!n || (n.amount || 0) <= 0) continue; if (wantType && n.type !== wantType && bestD < 500) continue; const d = Math.hypot(wrapDX(u.x, n.x), u.y - n.y); if (d < bestD) { bestD = d; targetNode = n; } } u._targetNodeRef = targetNode; } if (targetNode) { const dx = wrapDX(u.x, targetNode.x), dy = targetNode.y - u.y, dist = Math.hypot(dx, dy); const resLabel = targetNode.type === 'tree' ? 'Wood' : targetNode.type === 'stone' ? 'Stone' : 'Gold Ore'; if (dist > 28) { u.x = wrapX(u.x + (dx / dist) * 42 * dt, WORLD_W); u.y += (dy / dist) * 32 * dt; u.state = 'move'; u._roleBadge = `🌲 Walking to Cut ${resLabel} (${u.walletGold || 0}🪙)`; } else { u.vx = 0; u.vy = 0; u.state = 'chop'; targetNode._beingHarvested = true; targetNode._hitTilt = Math.sin((game.time || 0) * 28) * 0.12; u._chopProgress = (u._chopProgress || 0) + dt * 1.45; if (u._chopProgress >= 1.0) { this.awardUnitXP(u, 8, 'Resource Harvesting'); u._chopProgress = 0; u.carryAmount = (u.carryAmount || 0) + 1; u.gatherType = targetNode.type === 'tree' ? 'wood' : targetNode.type; targetNode.amount = Math.max(0, (targetNode.amount || 60) - 4); if (targetNode.amount <= 0) { if (targetNode.type === 'tree') this.treeStumps.push({ x: targetNode.x, y: targetNode.y }); const idx = game.resourcesNodes.indexOf(targetNode); if (idx !== -1) game.resourcesNodes.splice(idx, 1); u._targetNodeRef = null; } } u._roleBadge = `🪓 Cutting ${resLabel} (${u.carryAmount || 0}/5 • Left: ${Math.ceil(targetNode.amount || 0)})`; } } return; } if (storeB) { const dxS = wrapDX(u.x, storeB.x), dyS = storeB.y - u.y, distS = Math.hypot(dxS, dyS); if (distS > (storeB.radius || 32) + 16) { const encumbMult = Math.max(0.68, 1 - (u.carryAmount || 0) * ((u.level || 1) >= 2 ? 0.025 : 0.055)); u.x = wrapX(u.x + (dxS / distS) * 38 * encumbMult * dt, WORLD_W); u.y += (dyS / distS) * 28 * encumbMult * dt; u.state = 'move'; u._roleBadge = `🪵 Hauling ${u.carryAmount} ${u.gatherType || 'Wood'} (-${Math.round((1 - encumbMult) * 100)}% Load Spd) → ${storeB.name}`; } else { this.awardUnitXP(u, 24, 'Store Delivery'); const delivered = u.carryAmount || 5, rKey = u.gatherType === 'wood' ? 'wood' : u.gatherType === 'stone' ? 'stone' : 'gold'; if (!isEnemy && game.resources) game.resources[rKey] = (game.resources[rKey] || 0) + delivered; storeB._stockpileWood = (storeB._stockpileWood || 0) + delivered; u.carryAmount = 0; u._forcedGatherType = null; u.walletGold = (u.walletGold || 0) + 6; u._consequenceTag = `📦 Stored +${delivered}🪵 in ${storeB.name} (+6🪙 Wage!)`; u._consequenceTimer = 3.5; this.depositPopups.push({ x: storeB.x, y: storeB.y, text: `+${delivered}🪵 Stored!`, life: 1.8, maxLife: 1.8 }); } } } organizeCityLayouts(game) { if (!Array.isArray(game.buildings)) return; if (!game._humbleBeginningsInitialized && game.buildings.length >= 5) { game._humbleBeginningsInitialized = true; if (game.resources) { game.resources.wood = 40; game.resources.food = 45; game.resources.stone = 25; game.resources.gold = 12; } const kept = []; let hasTC = false, hasHut = false, hasMarket = false; for (const b of game.buildings) { if (!b) continue; if (b.owner === 'player') { if (b.type === 'town_center' && !hasTC) { hasTC = true; b.x = 780; b.y = 2320; b.constructionProgress = 1.0; b._authorized = true; b._gridAligned = true; b.privateOwnerName = 'Sovereign Clan'; kept.push(b); } else if (b.type === 'hut' && !hasHut) { hasHut = true; b.x = 645; b.y = 2320; b.constructionProgress = 1.0; b._authorized = true; b._gridAligned = true; b._householdName = 'House Kael'; b.privateOwnerName = 'House Kael'; kept.push(b); } else if (b.type === 'market' && !hasMarket) { hasMarket = true; b.x = 915; b.y = 2320; b.constructionProgress = 0.38; b._authorized = true; b._gridAligned = true; b.privateOwnerName = 'Community Guild'; kept.push(b); } } else if (b.type === 'town_center') { b._authorized = true; b._gridAligned = true; b.constructionProgress = 1.0; kept.push(b); } } if (!hasHut) { kept.push({ type: 'hut', name: 'Hut', owner: 'player', x: 645, y: 2320, hp: 620, maxHp: 620, constructionProgress: 1.0, _authorized: true, _gridAligned: true, _householdName: 'House Kael', privateOwnerName: 'House Kael' }); } if (!hasMarket) { kept.push({ type: 'market', name: 'Market', owner: 'player', x: 915, y: 2320, hp: 720, maxHp: 720, constructionProgress: 0.38, _authorized: true, _gridAligned: true, privateOwnerName: 'Community Guild' }); } for (const kb of kept) { kb.maxHp = kb.maxHp || 600; kb.hp = kb.hp ?? kb.maxHp; } game.buildings.length = 0; for (const kb of kept) game.buildings.push(kb); if (Array.isArray(game.villagers) && game.villagers.length > 7) { const hero = game.villagers.find((v) => v && v.isT101s); const others = game.villagers.filter((v) => v && !v.isT101s).slice(0, 6); game.villagers.length = 0; if (hero) { hero.x = 780; hero.y = 2245; hero.targetX = null; hero.targetY = null; game.villagers.push(hero); } for (const o of others) game.villagers.push(o); } if (Array.isArray(game.enemies)) { const bosses = game.enemies.filter((e) => e && e.isBoss); const clan = game.enemies.filter((e) => e && !e.isBoss).slice(0, 12); for (let m = 0; m < clan.length; m++) { clan[m].age = m % 2 === 0 ? 2.4 + (m % 5) : 21; clan[m].childScale = clan[m].age < 18 ? 0.36 + 0.62 * (clan[m].age / 18) : 1.0; clan[m]._authorizedEnemy = true; } game.enemies.length = 0; for (const b of bosses) game.enemies.push(b); for (const c of clan) game.enemies.push(c); } } for (let i = game.buildings.length - 1; i >= 0; i--) { if (game.buildings[i] && !game.buildings[i]._authorized) game.buildings.splice(i, 1); } if (!game._humbleBeginningsInitialized && game.buildings.length >= 5) { game._humbleBeginningsInitialized = true; game._imperialMasterplanApplied = true; game.resources = { wood: 40, food: 45, stone: 25, gold: 12 }; const kept = []; const pTc = game.buildings.find((b) => b && b.owner === 'player' && b.type === 'town_center'); if (pTc) { pTc.x = 780; pTc.y = 2320; pTc.constructionProgress = 1.0; pTc._gridAligned = true; pTc._authorized = true; kept.push(pTc); } const pHut = game.buildings.find((b) => b && b.owner === 'player' && b.type === 'hut'); if (pHut) { pHut.x = 645; pHut.y = 2320; pHut.constructionProgress = 1.0; pHut._householdName = 'House Kael'; pHut.privateOwnerName = 'House Kael'; pHut._gridAligned = true; pHut._authorized = true; kept.push(pHut); } const pMkt = game.buildings.find((b) => b && b.owner === 'player' && b.type === 'market') || { id: 'init_mkt_' + Date.now(), owner: 'player', type: 'market', name: 'Market', radius: 36, hp: 400, maxHp: 400 }; pMkt.x = 915; pMkt.y = 2320; pMkt.constructionProgress = 0.35; pMkt.privateOwnerName = 'Community Guild'; pMkt._gridAligned = true; pMkt._authorized = true; kept.push(pMkt); if (Array.isArray(game.aiPlayers)) { for (const ai of game.aiPlayers) { if (!ai) continue; if (CONTINENTS && CONTINENTS[ai.cont]) { ai.x = CONTINENTS[ai.cont].xStart + 2800; ai.y = 2320; } const aiTc = game.buildings.find((b) => b && b.owner === ai.id && b.type === 'town_center'); if (aiTc) { aiTc.x = ai.x; aiTc.y = 2320; aiTc.constructionProgress = 1.0; aiTc._gridAligned = true; aiTc._authorized = true; kept.push(aiTc); } const aiHut = game.buildings.find((b) => b && b.owner === ai.id && b.type === 'hut') || { id: 'ai_hut_' + ai.id, owner: ai.id, type: 'hut', name: 'Hut', radius: 28, hp: 250, maxHp: 250 }; aiHut.x = ai.x - 135; aiHut.y = 2320; aiHut.constructionProgress = 1.0; aiHut._gridAligned = true; aiHut._authorized = true; kept.push(aiHut); } } game.buildings = kept; if (Array.isArray(game.villagers)) { const hero = game.villagers.find((v) => v && (v.isHero || v.id === 't101s' || String(v.name || '').toLowerCase().includes('t101s'))); const others = game.villagers.filter((v) => v && v !== hero).slice(0, hero ? 6 : 7); const founders = hero ? [hero, ...others] : others; let adultIdx = 0, childIdx = 0; const totalNonHero = others.length; for (const v of founders) { v._lifecycleInitialized = true; if (v === hero) { v.age = 24; v.childScale = 1.0; v.lifeStage = 'adult'; v.personalGold = v.personalGold ?? 12; } else if (childIdx < 2 && adultIdx >= totalNonHero - 2) { const age = childIdx === 0 ? 2.4 : 7.5; v.age = age; v.childScale = 0.36 + 0.62 * (age / 18); v.lifeStage = 'child'; v.personalGold = 0; v.weaponType = null; childIdx++; } else { v.age = 22 + adultIdx * 3; v.childScale = 1.0; v.lifeStage = 'adult'; v.personalGold = adultIdx === 0 ? 72 : 4 + (adultIdx * 3) % 9; adultIdx++; } } game.villagers = founders; } if (Array.isArray(game.enemies) && Array.isArray(game.aiPlayers)) { const keptEnemies = []; for (const ai of game.aiPlayers) { if (!ai) continue; const tribeMembers = game.enemies.filter((e) => e && !e.isBoss && e.aiOwnerId === ai.id).slice(0, 4); tribeMembers.forEach((e, idx) => { e._authorizedEnemy = true; e._lifecycleInitialized = true; if (idx < 2) { e.age = 24 + idx * 2; e.childScale = 1.0; e.lifeStage = 'adult'; e.personalGold = idx === 0 ? 72 : 8; } else { const age = idx === 2 ? 2.2 : 6.5; e.age = age; e.childScale = 0.36 + 0.62 * (age / 18); e.lifeStage = 'child'; e.personalGold = 0; e.weaponType = null; } keptEnemies.push(e); }); } for (const e of game.enemies) { if (!e) continue; if (!Number.isFinite(e.x)) e.x = 780; if (!Number.isFinite(e.y)) e.y = 2320; if (!Number.isFinite(e.vx)) e.vx = 0; if (!Number.isFinite(e.vy)) e.vy = 0; if (!Number.isFinite(e.z)) e.z = 0; if (!Number.isFinite(e.vz)) e.vz = 0; if (e.isBoss) keptEnemies.push(e); } game.enemies = keptEnemies; } } if (game._humbleBeginningsInitialized) { game.buildings = game.buildings.filter((b) => { if (!b) return false; if (b._authorized) return true; if ((game._playerManualBuildWindow || 0) > 0 && b.owner === 'player') { b._authorized = true; return true; } return false; }); if (Array.isArray(game.enemies)) { game.enemies = game.enemies.filter((e) => e && (e.isBoss || e._authorizedEnemy)); } } for (const b of game.buildings) { if (!b) continue; if (typeof b.constructionProgress !== 'number') b.constructionProgress = b.type === 'town_center' ? 1.0 : 0.08; if (b._gridAligned) continue; if (b.type === 'town_center' || b.type === 'shipyard') { b._gridAligned = true; continue; } const center = game.buildings.find((tc) => tc && tc.owner === b.owner && tc.type === 'town_center') || { x: b.owner === 'player' ? 780 : b.x, y: 2320 }; const cols = [-270, -135, 0, 135, 270, 405], rows = [-115, 0, 115, 230]; let bestSpot = null, bestDist = Infinity; for (const dy of rows) { for (const dx of cols) { if (dx === 0 && dy === 0) continue; const cx = wrapX(center.x + dx, WORLD_W), cy = Math.max(2165, Math.min(2680, center.y + dy)); if (!game.buildings.some((o) => o && o !== b && Math.hypot(wrapDX(cx, o.x), cy - o.y) < 105)) { const d = Math.hypot(wrapDX(b.x, cx), b.y - cy); if (d < bestDist) { bestDist = d; bestSpot = { x: cx, y: cy }; } } } } if (bestSpot) { b.x = bestSpot.x; b.y = bestSpot.y; } b._gridAligned = true; } } drawCityBoulevardsAndPlazas(ctx, game, invTilt) { if (!Array.isArray(game.buildings) || !game.cam) return; this._frameLabelBoxes = []; const viewHalfW = (game.canvas.width * 0.65) / game.cam.zoom; ctx.save(); const _nowSec = (game.time || Date.now() * 0.001); if (Array.isArray(this.cultureRooms)) { for (const cr of this.cultureRooms) { ctx.save(); ctx.fillStyle = cr.type === 'stockade' ? 'rgba(51,65,85,0.85)' : (cr.type === 'tavern' ? 'rgba(120,53,15,0.82)' : (cr.type === 'apothecary' ? 'rgba(6,78,59,0.85)' : 'rgba(30,58,138,0.82)')); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.fillRect(cr.x - cr.w * 0.5, cr.y - cr.h * 0.5, cr.w, cr.h); ctx.strokeRect(cr.x - cr.w * 0.5, cr.y - cr.h * 0.5, cr.w, cr.h); ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; if (cr.type === 'apothecary') { ctx.fillStyle = '#ffffff'; ctx.fillRect(cr.x - 22, cr.y - 6, 14, 7); ctx.fillRect(cr.x - 22, cr.y + 4, 14, 7); ctx.fillStyle = '#22c55e'; ctx.fillRect(cr.x + 8, cr.y - 11, 16, 6); ctx.fillStyle = '#ef4444'; ctx.fillRect(cr.x + 12, cr.y - 1, 8, 3); ctx.fillRect(cr.x + 14.5, cr.y - 3.5, 3, 8); } ctx.fillText(cr.name, cr.x, cr.y - cr.h * 0.5 - 5); ctx.restore(); } } if (Array.isArray(this.mineCarts)) { for (const mc of this.mineCarts) { const sy1 = mc.startY || 2185, sy2 = mc.endY || 2345; ctx.save(); ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2; for (let ty = sy1; ty <= sy2; ty += 12) { ctx.beginPath(); ctx.moveTo(mc.x - 8, ty); ctx.lineTo(mc.x + 8, ty); ctx.stroke(); } ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mc.x - 5, sy1); ctx.lineTo(mc.x - 5, sy2); ctx.moveTo(mc.x + 5, sy1); ctx.lineTo(mc.x + 5, sy2); ctx.stroke(); ctx.fillStyle = '#b45309'; ctx.fillRect(mc.x - 7, mc.y - 6, 14, 12); ctx.fillStyle = '#fde68a'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🛒 Mine Cart: ${mc.ore ?? 8}🪨 (Downhill g·sinθ)`, mc.x, mc.y - 12); ctx.restore(); } } if (this.lightingMode === 'dusk' || this.lightingMode === 'night') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = this.lightingMode === 'dusk' ? 'rgba(124,45,18,0.18)' : 'rgba(15,23,42,0.34)'; ctx.fillRect(0, 0, game.canvas.width, game.canvas.height); ctx.restore(); } if (Array.isArray(this.weatherParticles) && this.weatherParticles.length) { ctx.save(); ctx.strokeStyle = this.weatherMode === 'rain' ? 'rgba(147,197,253,0.6)' : 'rgba(224,242,254,0.85)'; ctx.fillStyle = 'rgba(224,242,254,0.85)'; ctx.lineWidth = 1.2; for (const p of this.weatherParticles) { if (this.weatherMode === 'rain') { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + 10); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill(); } } ctx.restore(); } if (Array.isArray(this.widelandsRoads) && Array.isArray(this.widelandsFlags)) { ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]); for (const r of this.widelandsRoads) { const fA = this.widelandsFlags[r.from]; const fB = this.widelandsFlags[r.to]; if (!fA || !fB) continue; const ax = wrapDX(game.cam.x, fA.x), ay = fA.y - game.cam.y; const bx = wrapDX(game.cam.x, fB.x), by = fB.y - game.cam.y; if (Math.abs(ax) > viewHalfW + 250 && Math.abs(bx) > viewHalfW + 250) continue; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); } ctx.restore(); } if (Array.isArray(this.widelandsFlags)) { for (const fl of this.widelandsFlags) { const fx = wrapDX(game.cam.x, fl.x); if (Math.abs(fx) > viewHalfW + 120) continue; const fy = fl.y - game.cam.y; ctx.save(); ctx.fillStyle = '#fef08a'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🚩 ${fl.name} (${fl.wares.length}/8 Wares)`, fx, fy - 14); if (fl.wares.length > 0) { ctx.font = '10px Inter, sans-serif'; ctx.fillText(fl.wares.map(w => w.split(' ')[0]).join(' '), fx, fy + 10); } ctx.restore(); } } if (Array.isArray(this.widelandsCarriers)) { for (const c of this.widelandsCarriers) { const cx = wrapDX(game.cam.x, c.x); if (Math.abs(cx) > viewHalfW + 100) continue; const cy = c.y - game.cam.y; ctx.save(); ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(cx, cy - 6, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`📦 Carrier ${c.name}: ${c.carry || 'Empty'}`, cx, cy - 16); ctx.restore(); } } if (Array.isArray(this.widelandsProductionSites)) { for (const s of this.widelandsProductionSites) { const sx = wrapDX(game.cam.x, s.x); if (Math.abs(sx) > viewHalfW + 140) continue; const sy = s.y - game.cam.y; ctx.save(); ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'; ctx.fillRect(sx - 92, sy - 22, 184, 20); ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${s.name} [${s.inputA.ware}:${s.inputA.count} ${s.inputB.ware}:${s.inputB.count}]`, sx, sy - 9); ctx.restore(); } } if (Array.isArray(this.widelandsTrainingSites)) { for (const ts of this.widelandsTrainingSites) { const tx = wrapDX(game.cam.x, ts.x); if (Math.abs(tx) > viewHalfW + 140) continue; const ty = ts.y - game.cam.y; ctx.save(); ctx.fillStyle = 'rgba(30, 41, 59, 0.82)'; ctx.fillRect(tx - 88, ty - 22, 176, 20); ctx.fillStyle = '#f472b6'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${ts.name} (H/A/D/E)`, tx, ty - 9); ctx.restore(); } } if (Array.isArray(this.syxGuardPosts)) { const _mode = String(this.syxLawMode || 'balanced').toUpperCase(); const _wP = this.syxMarketPrices?.wood ?? 3; const _bP = this.syxMarketPrices?.bread ?? 4; for (const gp of this.syxGuardPosts) { const gx = wrapDX(game.cam.x, gp.x); if (Math.abs(gx) > viewHalfW + 160) continue; const gy = gp.y - game.cam.y; ctx.save(); ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(gx, gy, gp.radius || 135, (gp.radius || 135) * 0.55 * invTilt, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'; ctx.fillRect(gx - 125, gy - 26, 250, 20); ctx.fillStyle = '#fde68a'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`⚖️ Syx Law Aura (${_mode}) • Wood:${_wP}🪙 Bread:${_bP}🪙`, gx, gy - 12); ctx.restore(); } } if (Array.isArray(this.syxJanitors)) { for (const j of this.syxJanitors) { const jx = wrapDX(game.cam.x, j.x); if (Math.abs(jx) > viewHalfW + 100) continue; const jy = j.y - game.cam.y; ctx.save(); ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(jx, jy - 6, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d1fae5'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🧹 ${j.name.replace(/^🧹\s*/, '')}`, jx, jy - 16); ctx.restore(); } } if (Array.isArray(this.syxTourists)) { for (const t of this.syxTourists) { const vx = wrapDX(game.cam.x, t.x); if (Math.abs(vx) > viewHalfW + 120) continue; const vy = t.y - game.cam.y; ctx.save(); ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(vx, vy - 6, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ede9fe'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🎓 Scholar Alaric (Tourist) (+${t.goldSpent || 0}🪙)`, vx, vy - 16); ctx.restore(); } } if (Array.isArray(this.bloodSplatters)) { for (const bs of this.bloodSplatters) { const bx = wrapDX(game.cam.x, bs.x); if (Math.abs(bx) > viewHalfW + 80) continue; const by = bs.y - game.cam.y - (bs.z || 0) * invTilt; ctx.save(); ctx.globalAlpha = Math.min(1, bs.life || 1); ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(bx, by, bs.r || 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } if (Array.isArray(this.sonicRings)) { for (const sr of this.sonicRings) { const sx = wrapDX(game.cam.x, sr.x); if (Math.abs(sx) > viewHalfW + 100) continue; const sy = sr.y - game.cam.y - (sr.z || 0) * invTilt; const prog = 1 - Math.max(0, (sr.life || 0) / (sr.maxLife || 0.45)); const rad = (sr.r || 8) + ((sr.maxR || 52) - (sr.r || 8)) * prog; ctx.save(); ctx.translate(sx, sy); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(250, 204, 21, ' + Math.max(0.1, 1 - prog) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * 0.55, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } } if (Array.isArray(this.shieldShards)) { for (const sh of this.shieldShards) { const shx = wrapDX(game.cam.x, sh.x); if (Math.abs(shx) > viewHalfW + 80) continue; const shy = sh.y - game.cam.y - (sh.z || 0) * invTilt; ctx.save(); ctx.translate(shx, shy); ctx.rotate(sh.angle || 0); ctx.globalAlpha = Math.min(1, sh.life || 1); ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, -1); ctx.lineTo(1, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); } } if (Array.isArray(this.flyingHelmets)) { for (const fh of this.flyingHelmets) { const fx = wrapDX(game.cam.x, fh.x); if (Math.abs(fx) > viewHalfW + 80) continue; const fy = fh.y - game.cam.y; ctx.save(); ctx.translate(fx, fy); ctx.scale(1, invTilt); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.save(); ctx.translate(fx, fy - (fh.z || 0) * invTilt); ctx.rotate(fh.angle || 0); ctx.fillStyle = '#94a3b8'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 6.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.save(); ctx.translate(fx, fy - (fh.z || 0) * invTilt - 11); ctx.fillStyle = '#fde68a'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fh.label || '🪖 Flying Helmet', 0, 0); ctx.restore(); } } if (Array.isArray(this.anatomicalPopups)) { for (const ap of this.anatomicalPopups) { const ax = wrapDX(game.cam.x, ap.x); if (Math.abs(ax) > viewHalfW + 120) continue; const ay = ap.y - game.cam.y - (ap.z || 24) * invTilt; ctx.save(); ctx.globalAlpha = Math.max(0.15, Math.min(1, (ap.life || 1) / (ap.maxLife || 2.2))); ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(15,23,42,0.82)'; const tw = ctx.measureText(ap.text || '').width + 10; ctx.fillRect(ax - tw / 2, ay - 11, tw, 15); ctx.fillStyle = ap.color || '#fb7185'; ctx.fillText(ap.text || '', ax, ay); ctx.restore(); } } if (Array.isArray(this.impactCraters)) { for (const ic of this.impactCraters) { const cx = wrapDX(game.cam.x, ic.x); if (Math.abs(cx) > viewHalfW + 100) continue; const cy = ic.y - game.cam.y; ctx.save(); ctx.translate(cx, cy); ctx.scale(1, invTilt); ctx.fillStyle = 'rgba(28, 25, 23, 0.72)'; ctx.strokeStyle = '#78716c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, ic.radius || 26, (ic.radius || 26) * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ic.label || '🕳️ Impact Crater (-20% Spd)', 0, -(ic.radius || 26) * 0.65); ctx.restore(); } } if (Array.isArray(this.biomeFootprints)) { for (const fp of this.biomeFootprints) { const fx = wrapDX(game.cam.x, fp.x); if (Math.abs(fx) > viewHalfW + 80) continue; const fy = fp.y - game.cam.y; ctx.save(); ctx.translate(fx, fy); ctx.scale(1, invTilt); ctx.fillStyle = fp.kind === 'scorched' ? 'rgba(234, 88, 12, 0.45)' : (fp.kind === 'hoof' ? 'rgba(68, 64, 60, 0.55)' : 'rgba(120, 113, 108, 0.45)'); ctx.beginPath(); ctx.ellipse(0, 0, fp.kind === 'hoof' ? 4 : 3, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } if (Array.isArray(this.waterWakeRipples)) { for (const wk of this.waterWakeRipples) { const wx = wrapDX(game.cam.x, wk.x); if (Math.abs(wx) > viewHalfW + 80) continue; const wy = wk.y - game.cam.y; ctx.save(); ctx.translate(wx, wy); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(186, 230, 253, ' + Math.max(0.1, (wk.life / (wk.maxLife || 1.1)) * 0.75) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, wk.r, wk.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } } if (Array.isArray(this.buoyantRiverObjects)) { for (const bo of this.buoyantRiverObjects) { const bx = wrapDX(game.cam.x, bo.x); if (Math.abs(bx) > viewHalfW + 100) continue; const by = bo.y - game.cam.y; ctx.save(); ctx.translate(bx, by); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(224, 242, 254, 0.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-28, -10); ctx.moveTo(-14, 4); ctx.lineTo(-28, 10); ctx.stroke(); ctx.fillStyle = bo.type === 'crate' ? '#b45309' : '#78350f'; ctx.fillRect(-12, -5, 24, 10); ctx.fillStyle = '#bae6fd'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(bo.label || '🌊 Buoyant Timber Log', 0, -12); ctx.restore(); } } if (Array.isArray(this.cavalryCharges)) { for (const cc of this.cavalryCharges) { const cx = wrapDX(game.cam.x, cc.x); if (Math.abs(cx) > viewHalfW + 120) continue; const cy = cc.y - game.cam.y; const dir = (cc.vx || 135) >= 0 ? 1 : -1; ctx.save(); ctx.translate(cx, cy); ctx.scale(1, invTilt); ctx.fillStyle = 'rgba(168, 162, 158, 0.45)'; ctx.beginPath(); ctx.ellipse(-18 * dir, 10, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = cc.mount === 'mammoth' ? '#57534e' : '#d97706'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(14 * dir, 2); ctx.quadraticCurveTo(24 * dir, -2, 26 * dir, -9); ctx.stroke(); ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4 * dir, -10); ctx.lineTo(30 * dir, -12); ctx.stroke(); ctx.fillStyle = '#fde68a'; ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🦣 Cavalry Trample (' + (cc.riderName || 'Lancer') + ')', 0, -22); ctx.restore(); } } for (const tb of this.thrownBodies || []) { const tx = wrapDX(game.cam.x, tb.x || (tb.unit ? tb.unit.x : 780)); if (Math.abs(tx) > viewHalfW + 120) continue; const ty = (tb.y || (tb.unit ? tb.unit.y : 2245)) - game.cam.y; const sx = wrapDX(game.cam.x, tb.startX || (tb.x - 45)); const sy = (tb.startY || tb.y) - game.cam.y; ctx.save(); ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)'; ctx.lineWidth = 2.2 * invTilt; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(sx, sy - 14 * invTilt); ctx.quadraticCurveTo((sx + tx) * 0.5, Math.min(sy, ty) - 48 * invTilt, tx, ty - 10 * invTilt); ctx.stroke(); ctx.setLineDash([]); ctx.translate(tx, ty - 28 * invTilt); ctx.scale(1, invTilt); ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde047'; ctx.fillText(`🤼 Judo Shoulder-Throw! (${tb.targetName || 'Foe'} Hurled Through Air!)`, 0, -14); ctx.restore(); } if (Array.isArray(this.elementalSourceDraws)) { for (const d of this.elementalSourceDraws) { const p = Math.max(0, Math.min(1, 1 - (d.life / (d.maxLife || 1.35)))); const tx = d.unit ? d.unit.x : d.tx; const ty = d.unit ? (d.unit.y - 16) : d.ty; const cx = (d.sx + tx) * 0.5; const cy = Math.min(d.sy, ty) - 32; ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, (d.life / (d.maxLife || 1.35)) * 1.1)); ctx.strokeStyle = d.color || '#ff6b2b'; ctx.lineWidth = 2.2; ctx.shadowColor = d.color || '#ff6b2b'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(d.sx, d.sy); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke(); const omt = 1 - p; const ox = omt * omt * d.sx + 2 * omt * p * cx + p * p * tx; const oy = omt * omt * d.sy + 2 * omt * p * cy + p * p * ty; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ox, oy, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } if (Array.isArray(this.hydroLightningArcs)) { for (const arc of this.hydroLightningArcs) { const sx1 = wrapDX(game.cam.x, arc.x1), sy1 = arc.y1 - game.cam.y, sx2 = wrapDX(game.cam.x, arc.x2), sy2 = arc.y2 - game.cam.y; if (Math.abs(sx1) > viewHalfW + 180 && Math.abs(sx2) > viewHalfW + 180) continue; ctx.save(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo((sx1 + sx2) * 0.5 + Math.sin(_nowSec * 40) * 8, (sy1 + sy2) * 0.5 - 10); ctx.lineTo(sx2, sy2); ctx.stroke(); ctx.fillStyle = '#bae6fd'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(arc.label || '⚡ Hydro-Conductive Arc!', (sx1 + sx2) * 0.5, (sy1 + sy2) * 0.5 - 16); ctx.restore(); } } if (Array.isArray(this.verletChains)) { for (const vc of this.verletChains) { if (!vc.nodes || vc.nodes.length < 2) continue; const sx0 = wrapDX(game.cam.x, vc.nodes[0].x); if (Math.abs(sx0) > viewHalfW + 200) continue; ctx.save(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2.4; ctx.beginPath(); vc.nodes.forEach((n, idx) => { const nx = wrapDX(game.cam.x, n.x), ny = n.y - game.cam.y; if (idx === 0) ctx.moveTo(nx, ny); else ctx.lineTo(nx, ny); }); ctx.stroke(); const mid = vc.nodes[Math.floor(vc.nodes.length / 2)]; ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛓️ Verlet Tension Chain (F=-k·Δx)', wrapDX(game.cam.x, mid.x), mid.y - game.cam.y - 10); ctx.restore(); } } if (Array.isArray(this.fulcrumLevers)) { for (const fl of this.fulcrumLevers) { const fx = wrapDX(game.cam.x, fl.x), fy = fl.y - game.cam.y; if (Math.abs(fx) > viewHalfW + 140) continue; ctx.save(); ctx.translate(fx, fy); ctx.scale(1, invTilt); ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(0, -10); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill(); ctx.save(); ctx.translate(0, -10); ctx.rotate(fl.angle || 0); ctx.fillStyle = '#b45309'; ctx.fillRect(-34, -3, 68, 6); ctx.restore(); ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪵 Fulcrum Lever Catapult (τ=r×F • z=44px)', 0, -28); ctx.restore(); } } if (Array.isArray(this.avalancheSlides)) { for (const av of this.avalancheSlides) { const ax = wrapDX(game.cam.x, av.x), ay = av.y - game.cam.y; if (Math.abs(ax) > viewHalfW + 180) continue; ctx.save(); ctx.translate(ax, ay); ctx.scale(1, invTilt); for (const rk of av.rocks || []) { ctx.fillStyle = '#78716c'; ctx.beginPath(); ctx.arc(rk.dx, rk.dy, rk.r || 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#d6d3d1'; ctx.lineWidth = 1; ctx.stroke(); } ctx.fillStyle = '#fde68a'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛰️ Granular Rockslide Avalanche (Ff=μ·N • θ=36°)', 0, -24); ctx.restore(); } } if (Array.isArray(this.machCones)) { for (const mc of this.machCones) { const mx = wrapDX(game.cam.x, mc.x), my = mc.y - game.cam.y; if (Math.abs(mx) > viewHalfW + 160) continue; ctx.save(); ctx.translate(mx, my); ctx.scale(1, invTilt); const d = mc.dir || 1; ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-d * 52, -26); ctx.moveTo(0, 0); ctx.lineTo(-d * 52, 26); ctx.stroke(); ctx.fillStyle = 'rgba(186, 230, 253, 0.25)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-d * 48, -22); ctx.lineTo(-d * 48, 22); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔊 Mach 1.4 Sonic Boom Cone (sin μ=cs/v)', 0, -32); ctx.restore(); } } if (Array.isArray(this.elasticPoleVaults)) { for (const pv of this.elasticPoleVaults) { const px = wrapDX(game.cam.x, pv.unit ? pv.unit.x : pv.x), py = (pv.unit ? pv.unit.y : pv.y) - game.cam.y; if (Math.abs(px) > viewHalfW + 140) continue; ctx.save(); ctx.translate(px, py); ctx.scale(1, invTilt); ctx.strokeStyle = '#65a30d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 4); ctx.quadraticCurveTo(pv.bend || 0, -22, 6, -42); ctx.stroke(); ctx.fillStyle = '#ecfccb'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🎋 Elastic Spear Pole-Vault (U=½kx² • z=34px)', 0, -48); ctx.restore(); } } if (Array.isArray(this.magneticFields)) { for (const mf of this.magneticFields) { const gx = wrapDX(game.cam.x, mf.x), gy = mf.y - game.cam.y; if (Math.abs(gx) > viewHalfW + 160) continue; ctx.save(); ctx.translate(gx, gy); ctx.scale(1, invTilt); ctx.strokeStyle = mf.life > 1.1 ? 'rgba(192, 132, 252, 0.78)' : 'rgba(56, 189, 248, 0.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, 0, mf.radius, mf.radius * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = mf.life > 1.1 ? '#f3e8ff' : '#e0f2fe'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(mf.life > 1.1 ? '🧲 Ferromagnetic Dipole Pull (F∝1/r³)' : '⚡ Lorentz Rail-Launch (F=q(E+v×B))!', 0, -mf.radius * 0.48 - 6); ctx.restore(); } } if (Array.isArray(this.bernoulliVortices)) { for (const bv of this.bernoulliVortices) { const bx = wrapDX(game.cam.x, bv.x), by = bv.y - game.cam.y; if (Math.abs(bx) > viewHalfW + 140) continue; ctx.save(); ctx.translate(bx, by); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(125, 211, 252, 0.72)'; ctx.lineWidth = 2; for (let r = 22; r <= bv.radius; r += 22) { ctx.beginPath(); ctx.ellipse(0, -r * 0.25, r, r * 0.42, 0, (bv.phase || 0) + r, (bv.phase || 0) + r + Math.PI * 1.4); ctx.stroke(); } ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🌪️ Bernoulli Vortex (ΔP=-½ρv² • z=38)', 0, -bv.radius * 0.55); ctx.restore(); } } if (Array.isArray(this.tsunamiWaves)) { for (const tw of this.tsunamiWaves) { const tx = wrapDX(game.cam.x, tw.x), ty = tw.y - game.cam.y; if (Math.abs(tx) > viewHalfW + 140) continue; ctx.save(); ctx.translate(tx, ty); ctx.fillStyle = 'rgba(14, 165, 233, 0.65)'; ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, 0, tw.width * 0.5, tw.height * 0.5, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🌊 Tsunami Surge Wave (h=4.2m)', 0, -tw.height * 0.75); ctx.restore(); } } if (Array.isArray(this.pressureShockwaves)) { for (const sw of this.pressureShockwaves) { const sx = wrapDX(game.cam.x, sw.x); if (Math.abs(sx) > viewHalfW + (sw.maxRadius || 160)) continue; const sy = sw.y - game.cam.y; const alpha = Math.max(0.12, (sw.life || 0) / (sw.maxLife || 0.95)); ctx.save(); ctx.translate(sx, sy); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(249, 115, 22, ' + alpha + ')'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.ellipse(0, 0, sw.radius, sw.radius * 0.52, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = 'rgba(254, 240, 138, ' + (alpha * 0.75) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, sw.radius * 0.72, sw.radius * 0.37, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#fde047'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText((sw.label || '💥 1/r² Newtonian Shockwave!') + ' (r=' + Math.round(sw.radius) + 'px)', 0, -sw.radius * 0.45 - 8); ctx.restore(); } } if (Array.isArray(this.workshopStations)) { for (const ws of this.workshopStations) { const wx = wrapDX(game.cam.x, ws.x); if (Math.abs(wx) > viewHalfW + 120) continue; const wy = ws.y - game.cam.y; ctx.save(); ctx.translate(wx, wy); ctx.scale(1, invTilt); if (ws.type === 'forge') { ctx.fillStyle = '#334155'; ctx.fillRect(-12, -6, 24, 10); const swing = Math.sin(_nowSec * 8) * 0.6; ctx.save(); ctx.translate(10, -14); ctx.rotate(swing); ctx.fillStyle = '#94a3b8'; ctx.fillRect(-10, -3, 12, 5); ctx.restore(); for (let s = 0; s < 4; s++) { const spA = _nowSec * 6 + s * 1.5; ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(Math.cos(spA) * 10, -10 - Math.abs(Math.sin(spA)) * 14, 2, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#fdba74'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚒️ Blacksmith Anvil & Forge (Sparks!)', 0, -28); } else { ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, -4, 11, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.ellipse(0, -4, 9, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -14 - ((_nowSec * 12) % 10), 6, 0, Math.PI * 2); ctx.stroke(); ctx.save(); ctx.translate(22, -22); ctx.rotate(_nowSec * 2.2); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.stroke(); ctx.restore(); ctx.fillStyle = '#86efac'; ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🍲 Bubbling Cauldron & Windmill', 0, -38); } ctx.restore(); } } if (Array.isArray(this.fallingTrees)) { for (const ft of this.fallingTrees) { const fx = wrapDX(game.cam.x, ft.x); if (Math.abs(fx) > viewHalfW + 120) continue; const fy = ft.y - game.cam.y; ctx.save(); ctx.translate(fx, fy); ctx.scale(1, invTilt); if (ft.phase === 'crashed') { ctx.strokeStyle = 'rgba(214, 211, 209, 0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ft.fallDir * 28, 0, ft.dustRadius, ft.dustRadius * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); } ctx.rotate(ft.fallDir * ft.angle); ctx.fillStyle = '#78350f'; ctx.fillRect(-4, -38, 8, 38); ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.arc(0, -44, 18, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } if (Array.isArray(this.bladeClashes)) { for (const bc of this.bladeClashes) { const bx = wrapDX(game.cam.x, bc.x); if (Math.abs(bx) > viewHalfW + 80) continue; const by = bc.y - game.cam.y; ctx.save(); ctx.translate(bx, by); ctx.scale(1, invTilt); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.2; for (let s = 0; s < 6; s++) { const ang = (s / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 4, Math.sin(ang) * 4); ctx.lineTo(Math.cos(ang) * 18, Math.sin(ang) * 18); ctx.stroke(); } ctx.restore(); } } if (Array.isArray(this.disarmedWeapons)) { for (const dw of this.disarmedWeapons) { const wx = wrapDX(game.cam.x, dw.x); if (Math.abs(wx) > viewHalfW + 80) continue; const wy = dw.y - game.cam.y - (dw.z || 0); ctx.save(); ctx.translate(wx, wy); ctx.scale(1, invTilt); ctx.rotate(dw.angle || 0); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-2, -14, 4, 20); ctx.fillStyle = '#b45309'; ctx.fillRect(-5, 4, 10, 3); ctx.restore(); } } if (Array.isArray(this.rollingBoulders)) { for (const b of this.rollingBoulders) { const rx = wrapDX(game.cam.x, b.x); if (Math.abs(rx) > viewHalfW + 100) continue; const ry = b.y - game.cam.y; ctx.save(); ctx.translate(rx, ry); ctx.scale(1, invTilt); ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'; ctx.beginPath(); ctx.ellipse(0, 4, b.radius, b.radius * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.translate(0, -(b.z || 0)); ctx.rotate(b.rot || 0); ctx.fillStyle = '#78716c'; ctx.strokeStyle = '#44403c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, b.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#a8a29e'; ctx.beginPath(); ctx.arc(-4, -4, b.radius * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } } if (Array.isArray(this.windGustParticles)) { for (const wp of this.windGustParticles) { const gx = wrapDX(game.cam.x, wp.x); if (Math.abs(gx) > viewHalfW + 120) continue; const gy = wp.y - game.cam.y; ctx.save(); ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(this.windAngle || 0) * (wp.len || 30), gy + Math.sin(this.windAngle || 0) * (wp.len || 30) * invTilt); ctx.stroke(); ctx.restore(); } } for (let i = 0; i < game.buildings.length; i++) { const a = game.buildings[i]; if (!a) continue; const ax = wrapDX(game.cam.x, a.x); if (Math.abs(ax) > viewHalfW + 180) continue; const ay = a.y - game.cam.y; for (let j = i + 1; j < game.buildings.length; j++) { const b = game.buildings[j]; if (!b || b.owner !== a.owner) continue; const dx = wrapDX(a.x, b.x), dy = b.y - a.y, dist = Math.hypot(dx, dy); if (dist > 10 && dist <= 165 && (Math.abs(dx) < 25 || Math.abs(dy) < 25)) { ctx.strokeStyle = 'rgba(214, 195, 165, 0.42)'; ctx.lineWidth = 18 * invTilt; ctx.beginPath(); ctx.moveTo(ax, ay + 4); ctx.lineTo(ax + dx, ay + dy + 4); ctx.stroke(); ctx.strokeStyle = 'rgba(120, 113, 108, 0.52)'; ctx.lineWidth = 12 * invTilt; ctx.beginPath(); ctx.moveTo(ax, ay + 4); ctx.lineTo(ax + dx, ay + dy + 4); ctx.stroke(); } } const r = (a.radius || 32) * 1.38; ctx.fillStyle = a.owner === 'player' ? 'rgba(168, 162, 158, 0.34)' : 'rgba(120, 113, 108, 0.28)'; ctx.strokeStyle = a.owner === 'player' ? 'rgba(251, 191, 36, 0.48)' : 'rgba(168, 162, 158, 0.38)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(ax, ay + 4, r, r * 0.48 * invTilt, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (a.owner === 'player' && (a.type === 'shrine' || a.type === 'barracks')) { ctx.save(); ctx.translate(ax, ay + 46 * invTilt); ctx.scale(1, invTilt); ctx.fillStyle = a.type === 'shrine' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(245, 158, 11, 0.18)'; ctx.strokeStyle = a.type === 'shrine' ? '#38bdf8' : '#fbbf24'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (a.type === 'barracks') { ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(22, 2); ctx.lineTo(22, -18); ctx.moveTo(15, -11); ctx.lineTo(29, -11); ctx.stroke(); ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.arc(22, -20, 4.2, 0, Math.PI * 2); ctx.fill(); } ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = a.type === 'shrine' ? '#7dd3fc' : '#fde68a'; ctx.fillText(a.type === 'shrine' ? '⛩️ Elemental Dojo' : '🥋 Martial Dojo', 0, 22); ctx.restore(); } if (a.type === 'hut' && a._householdName) { ctx.save(); ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fbcfe8'; ctx.fillText(`🏡 ${a._householdName}`, ax, ay + 26 * invTilt); ctx.restore(); } } const timeSec = game.time || 0; for (const c of this.packMuleCaravans) { const cx = wrapDX(game.cam.x, c.x); if (Math.abs(cx) > viewHalfW + 120) continue; const cy = c.y - game.cam.y, f = c.vx < 0 ? -1 : 1, stride = Math.sin(timeSec * 8 + c.id) * 4, bob = Math.abs(Math.cos(timeSec * 8 + c.id)) * 1.5; ctx.save(); ctx.translate(cx, cy); ctx.scale(1, invTilt); ctx.fillStyle = 'rgba(10, 14, 18, 0.32)'; ctx.beginPath(); ctx.ellipse(0, 3, 18, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 3.2; for (const [lx, sOff] of [[-8 * f, stride], [8 * f, -stride], [-5 * f, -stride], [5 * f, stride]]) { ctx.beginPath(); ctx.moveTo(lx, -10 - bob); ctx.lineTo(lx + sOff * 0.6, 2); ctx.stroke(); } ctx.fillStyle = '#795548'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, -11 - bob, 14, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#b45309'; ctx.strokeStyle = '#fbbf24'; ctx.fillRect(-9, -21 - bob, 18, 9); ctx.strokeRect(-9, -21 - bob, 18, 9); ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.ellipse(13 * f, -16 - bob, 5.5, 4.0, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde047'; ctx.fillText(c.statusLabel || '🐪 Pack-Mule Caravan (+5🪙)', 0, -27 - bob); ctx.restore(); } for (const m of this.merchantShips) { const mx = wrapDX(game.cam.x, m.x); if (Math.abs(mx) > viewHalfW + 140) continue; const my = m.y - game.cam.y, f = m.vx < 0 ? -1 : 1, rock = Math.sin(timeSec * 3.2 + m.id) * 1.8; ctx.save(); ctx.translate(mx, my); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 4, 28, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#78350f'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-24 * f, -3 + rock); ctx.lineTo(26 * f, -5 + rock); ctx.lineTo(19 * f, 6 + rock); ctx.lineTo(-19 * f, 6 + rock); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#eab308'; ctx.fillRect(-10, -9 + rock, 18, 6); ctx.fillStyle = '#10b981'; ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-12 * f, -31 + rock); ctx.quadraticCurveTo(14 * f, -22 + rock, 12 * f, -10 + rock); ctx.lineTo(-10 * f, -11 + rock); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#6ee7b7'; ctx.fillText(m.statusLabel || '⛵ Merchant Dhow (Silk & Gold • +8🪙)', 0, -36 + rock); ctx.restore(); } for (const env of this.diplomaticEnvoys) { const ex = wrapDX(game.cam.x, env.x); if (Math.abs(ex) > viewHalfW + 140) continue; const ey = (env.yPos || 2290) - game.cam.y, f = env.vx < 0 ? -1 : 1, bob = Math.abs(Math.sin(timeSec * 7)) * 2; ctx.save(); ctx.translate(ex, ey); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)'; ctx.lineWidth = 2.0; ctx.beginPath(); ctx.ellipse(0, 2, 18, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#64748b'; ctx.beginPath(); ctx.ellipse(0, -12 - bob, 14, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#0284c7'; ctx.fillRect(-4, -26 - bob, 8, 12); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(4 * f, -16 - bob); ctx.lineTo(4 * f, -48 - bob); ctx.stroke(); ctx.fillStyle = env.bannerColor || '#10b981'; ctx.beginPath(); ctx.moveTo(4 * f, -48 - bob); ctx.lineTo(4 - 22 * f, -42 - bob); ctx.lineTo(4 * f, -36 - bob); ctx.closePath(); ctx.fill(); ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7dd3fc'; ctx.fillText(env.statusLabel, 0, -53 - bob); ctx.restore(); } for (const tc of this.treatyCeremonies) { const tx = wrapDX(game.cam.x, tc.x); if (Math.abs(tx) > viewHalfW + 160) continue; const ty = tc.y - game.cam.y, ratio = Math.max(0, tc.life / tc.maxLife); ctx.save(); ctx.translate(tx, ty); ctx.scale(1, invTilt); ctx.strokeStyle = `rgba(250, 204, 21, ${(ratio * 0.9).toFixed(3)})`; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(0, 0, 16 + (1 - ratio) * 54, (16 + (1 - ratio) * 54) * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde047'; ctx.fillText(tc.title, 0, -48); ctx.restore(); } for (const dp of this.depositPopups) { const px = wrapDX(game.cam.x, dp.x); if (Math.abs(px) > viewHalfW + 120) continue; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = dp.color || '#4ade80'; ctx.fillText(dp.text, px, dp.y - game.cam.y - 38); } for (const ep of this.elementalPatches) { const ex = wrapDX(game.cam.x, ep.x); if (Math.abs(ex) > viewHalfW + 120) continue; const ey = ep.y - game.cam.y; ctx.save(); ctx.translate(ex, ey); ctx.scale(1, invTilt); ctx.fillStyle = ep.type === 'ice' ? 'rgba(186, 230, 253, 0.42)' : ep.type === 'steam' ? 'rgba(241, 245, 249, 0.52)' : 'rgba(234, 88, 12, 0.38)'; ctx.strokeStyle = ep.type === 'ice' ? '#38bdf8' : ep.type === 'steam' ? '#f8fafc' : '#fde047'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, ep.radius, ep.radius * 0.48, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e0f2fe'; ctx.fillText(ep.type === 'ice' ? '❄️ Ice Slip Zone (Low Friction)' : ep.type === 'steam' ? '☁️ Steam Cloud (Fire + Water)' : '🌋 Magma Zone (Earth + Fire)', 0, -ep.radius * 0.55); ctx.restore(); } for (const cr of this.droppedCargoCrates) { const cx = wrapDX(game.cam.x, cr.x); if (Math.abs(cx) > viewHalfW + 80) continue; const cy = cr.y - game.cam.y - (cr.z || 0) * invTilt; ctx.save(); ctx.translate(cx, cy); ctx.scale(1, invTilt); ctx.fillStyle = '#92400e'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.3; ctx.fillRect(-7, -7, 14, 10); ctx.strokeRect(-7, -7, 14, 10); ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fef08a'; ctx.fillText(`📦 Dropped ${cr.amount} ${cr.type}`, 0, -11); ctx.restore(); } for (const sp of this.waterSplashes) { const sx = wrapDX(game.cam.x, sp.x); if (Math.abs(sx) > viewHalfW + 100) continue; const sy = sp.y - game.cam.y; ctx.save(); ctx.translate(sx, sy); ctx.scale(1, invTilt); ctx.strokeStyle = 'rgba(186, 230, 253, 0.88)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, 0, sp.radius, sp.radius * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7dd3fc'; ctx.fillText(sp.label, 0, -22); ctx.restore(); } for (const ra of this.ricochetArrows) { const rx = wrapDX(game.cam.x, ra.x); if (Math.abs(rx) > viewHalfW + 90) continue; const ry = ra.y - game.cam.y - (ra.z || 0) * invTilt; ctx.save(); ctx.translate(rx, ry); ctx.rotate(ra.angle || 0); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.0; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.restore(); } for (const ru of this.rubbleRuins) { const rx = wrapDX(game.cam.x, ru.x); if (Math.abs(rx) > viewHalfW + 120) continue; const ry = ru.y - game.cam.y, r = ru.radius || 32; ctx.save(); ctx.translate(rx, ry); ctx.scale(1, invTilt); ctx.fillStyle = 'rgba(28, 25, 23, 0.65)'; ctx.strokeStyle = '#57534e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 4, r * 1.15, r * 0.52, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); for (const [bx, by, bw, bh] of [[-14, -2, 10, 6], [4, -4, 12, 7], [-5, 3, 11, 5]]) { ctx.fillStyle = '#57534e'; ctx.fillRect(bx, by, bw, bh); } ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(-3, -1, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fca5a5'; ctx.fillText(`🏚️ Ruins of ${ru.name} (Destroyed by ${ru.destroyerName})`, 0, -20); ctx.restore(); } for (const cs of this.collapsingStructures) { const cx = wrapDX(game.cam.x, cs.x); if (Math.abs(cx) > viewHalfW + 140) continue; const cy = cs.y - game.cam.y, prog = 1 - cs.life / cs.maxLife, r = cs.radius || 32; ctx.save(); ctx.translate(cx + Math.sin(timeSec * 65) * 5, cy + prog * 28 * invTilt); ctx.scale(1, invTilt); ctx.fillStyle = `rgba(168, 162, 158, ${((1 - prog) * 0.65).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + prog * 0.9), r * (0.5 + prog * 0.45), 0, 0, Math.PI * 2); ctx.fill(); ctx.font = 'bold 10.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ef4444'; ctx.fillText(`💥 COLLAPSING: ${cs.name}! (0/${cs.maxHp} HP)`, 0, -34); ctx.restore(); } for (const cp of this.cropPlots) { const cx = wrapDX(game.cam.x, cp.x); if (Math.abs(cx) > viewHalfW + 120) continue; const cy = cp.y - game.cam.y, prog = Math.max(0, Math.min(1, cp.growth || 0)); ctx.save(); ctx.translate(cx, cy); ctx.scale(1, invTilt); ctx.fillStyle = '#451a03'; ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 1.6; ctx.fillRect(-26, -14, 52, 28); ctx.strokeRect(-26, -14, 52, 28); const stalkH = 3 + prog * 14, sway = Math.sin(timeSec * 3.5 + cp.id) * 2.5 * prog; ctx.strokeStyle = prog > 0.7 ? '#facc15' : '#4ade80'; ctx.lineWidth = 1.8; for (let r = -10; r <= 10; r += 7) { for (let c = -18; c <= 18; c += 9) { ctx.beginPath(); ctx.moveTo(c, r); ctx.lineTo(c + sway, r - stalkH); ctx.stroke(); } } ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = prog >= 0.95 ? '#fde047' : '#bbf7d0'; ctx.fillText(prog >= 0.95 ? `🌾 ${cp.name} (Ready to Harvest! +8🍖)` : `🌱 ${cp.name} (Growing ${Math.round(prog * 100)}%)`, 0, -20); ctx.restore(); } for (const wh of this.wildHerds) { const wx = wrapDX(game.cam.x, wh.x); if (Math.abs(wx) > viewHalfW + 100) continue; const wy = wh.y - game.cam.y, f = wh.vx < 0 ? -1 : 1, bob = Math.abs(Math.cos(timeSec * 7 + wh.id)) * 1.4; ctx.save(); ctx.translate(wx, wy); ctx.scale(1, invTilt); ctx.fillStyle = wh.species === 'boar' ? '#44403c' : '#92400e'; ctx.strokeStyle = '#271203'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(0, -9 - bob, 11, 5.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(10 * f, -15 - bob, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fed7aa'; ctx.fillText(wh.label || '🦌 Wild Stag (35🍖)', 0, -24 - bob); ctx.restore(); } for (const gr of this.memorialGraves) { const gx = wrapDX(game.cam.x, gr.x); if (Math.abs(gx) > viewHalfW + 90) continue; const gy = gr.y - game.cam.y; ctx.save(); ctx.translate(gx, gy); ctx.scale(1, invTilt); ctx.fillStyle = '#94a3b8'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-7, -12); ctx.arc(0, -12, 7, Math.PI, 0); ctx.lineTo(7, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cbd5e1'; ctx.fillText(`🪦 Grave of ${gr.name} (${gr.age}y • ${gr.house})`, 0, -23); ctx.restore(); } ctx.restore(); } drawConstructionScaffolding(ctx, building, dx, sy, invTilt, timeSec) { const prog = typeof building.constructionProgress === 'number' ? building.constructionProgress : 1.0; const ownerFirst = building.privateOwnerName ? String(building.privateOwnerName).split(' ')[0] : ''; if (!building.privateOwnerName && prog >= 0.995) return; ctx.save(); ctx.translate(dx, sy); ctx.scale(1, invTilt); if (building.privateOwnerName) { ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde047'; ctx.fillText(`🏛️ Owned by ${building.privateOwnerName}`, 0, 38); } if (prog < 0.995) { const r = building.radius || 32, h = 42 * (0.25 + 0.75 * prog); ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2.0; for (const px of [-r * 0.85, -r * 0.35, r * 0.35, r * 0.85]) { ctx.beginPath(); ctx.moveTo(px, 6); ctx.lineTo(px, -h - 8); ctx.stroke(); } ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.4; for (let tier = 1; tier <= 3; tier++) { const ty = -(h * tier) / 3; ctx.beginPath(); ctx.moveTo(-r * 0.9, ty); ctx.lineTo(r * 0.9, ty); ctx.stroke(); } const barW = 54, barY = -h - 24; ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.fillRect(-barW * 0.5, barY, barW, 6); ctx.fillStyle = '#fbbf24'; ctx.fillRect(-barW * 0.5 + 1, barY + 1, Math.round((barW - 2) * prog), 4); const pct = Math.round(prog * 100); ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a'; ctx.fillText(ownerFirst ? `🏗️ ${ownerFirst}: ${pct}%` : `🏗️ Building ${pct}%`, 0, barY - 3); } ctx.restore(); } drawSongsOfSyxCutawayInterior(ctx, building, dx, sy, invTilt, timeSec) { ctx.save(); ctx.translate(dx, sy); ctx.scale(1, invTilt); const rawType = String((building && (building.type || building.kind || building.id)) || 'hut').toLowerCase(); const bName = String((building && building.name) || '').toLowerCase(); const bType = (rawType.includes('market') || bName.includes('market')) ? 'market' : rawType; const isGrand = bType === 'town_center' || bType === 'shrine'; const isStone = bType === 'forge' || bType === 'barracks' || bType === 'market'; const w = (isGrand || isStone) ? 102 : 76; const h = (isGrand || isStone) ? 76 : 58; const hw = w / 2; const hh = h / 2; const wallCol = isGrand ? '#44403c' : (isStone ? '#57534e' : '#5c4033'); const floorCol = isGrand ? '#334155' : (isStone ? '#292524' : '#451a03'); ctx.beginPath(); if (ctx.roundRect) { ctx.roundRect(-hw, -hh, w, h, 8); } else { ctx.rect(-hw, -hh, w, h); } ctx.fillStyle = floorCol; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = wallCol; ctx.stroke(); if (isGrand) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#fbbf24'; ctx.stroke(); } ctx.save(); ctx.beginPath(); ctx.rect(-hw + 5, -hh + 5, w - 10, h - 10); ctx.clip(); ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)'; ctx.lineWidth = 1; for (let gx = -hw + 12; gx < hw - 4; gx += 12) { ctx.beginPath(); ctx.moveTo(gx, -hh + 5); ctx.lineTo(gx, hh - 5); ctx.stroke(); } for (let gy = -hh + 12; gy < hh - 4; gy += 12) { ctx.beginPath(); ctx.moveTo(-hw + 5, gy); ctx.lineTo(hw - 5, gy); ctx.stroke(); } const flicker = 0.88 + Math.sin((timeSec || 0) * 9 + dx * 0.1) * 0.12; const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, hw * 0.85 * flicker); glow.addColorStop(0, 'rgba(251, 146, 60, 0.42)'); glow.addColorStop(1, 'rgba(251, 146, 60, 0)'); ctx.fillStyle = glow; ctx.fillRect(-hw + 5, -hh + 5, w - 10, h - 10); if (bType === 'market') { const bins = [[-28, -20], [10, -20], [-28, 6], [10, 6]]; for (const [bx, by] of bins) { ctx.fillStyle = '#92400e'; ctx.fillRect(bx, by, 18, 14); ctx.fillStyle = '#d97706'; ctx.fillRect(bx + 2, by + 2, 14, 10); ctx.fillStyle = '#fbbf24'; ctx.fillRect(bx + 4, by + 4, 5, 4); } } else if (bType === 'hut') { ctx.fillStyle = '#57534e'; ctx.beginPath(); ctx.arc(0, -4, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(0, -4, 3.5 * flicker, 0, Math.PI * 2); ctx.fill(); for (const bx of [-26, 12]) { ctx.fillStyle = '#78350f'; ctx.fillRect(bx, -16, 14, 22); ctx.fillStyle = '#e7e5e4'; ctx.fillRect(bx + 2, -14, 10, 5); ctx.fillStyle = '#b91c1c'; ctx.fillRect(bx + 2, -8, 10, 12); } } else { for (const rowY of [-20, 10]) { ctx.fillStyle = '#78350f'; ctx.fillRect(-34, rowY, 24, 9); ctx.fillRect(10, rowY, 24, 9); ctx.fillStyle = '#a8a29e'; ctx.fillRect(-30, rowY + 2, 6, 4); ctx.fillRect(14, rowY + 2, 6, 4); } ctx.fillStyle = '#1c1917'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(0, 0, 5 * flicker, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(0, 0, 2.5 * flicker, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); ctx.fillStyle = '#d6c3a5'; ctx.fillRect(-10, hh - 6, 20, 7); ctx.restore(); } drawUnitOverlay(ctx, unit, dx, sy, invTilt, timeSec) { if (!unit || unit.isBoss) return; const f = (unit.vx || 0) < -0.05 ? -1 : unit.facing || 1, scale = unit.childScale || 1.0, age = unit.age ?? 20; ctx.save(); ctx.translate(dx, sy); ctx.scale(1, invTilt); if ((unit._headConcussionTimer || 0) > 0) { ctx.fillStyle = '#fb7185'; ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🎯 Concussed (2.0× Crit)', 0, -44 * scale); } if ((unit._armFractureTimer || 0) > 0) { ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(8 * scale - 4, -18 * scale - 4); ctx.lineTo(8 * scale + 4, -18 * scale + 4); ctx.moveTo(8 * scale + 4, -18 * scale - 4); ctx.lineTo(8 * scale - 4, -18 * scale + 4); ctx.stroke(); } if ((unit._legCrippleTimer || 0) > 0) { ctx.fillStyle = '#facc15'; ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🦵 Limping (-50% Spd)', 0, 14 * scale); } if ((unit._outnumberedCount || 0) >= 2) { ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, 2, 22 + Math.sin(timeSec * 8) * 3, 10, 0, 0, Math.PI * 2); ctx.stroke(); } if (unit._crownedGreat) { ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -34 * scale, 10 * scale, 4 * scale, 0, 0, Math.PI * 2); ctx.stroke(); } { const age = unit.age ?? 20; if (age < 18) { const growthRatio = Math.max(0, Math.min(1, age / 18)), pulse = (timeSec * 1.8 + (unit.id || 0) * 0.4) % 1; const ringY = -4 - pulse * 28 * scale, ringR = (9 + Math.sin(pulse * Math.PI) * 5) * scale; ctx.strokeStyle = (unit._growthSpurtTimer || 0) > 0 ? '#fde047' : `rgba(74, 222, 128, ${((1 - pulse) * 0.78).toFixed(3)})`; ctx.lineWidth = 2.0; ctx.beginPath(); ctx.ellipse(0, ringY, ringR, ringR * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); const gw = 32, gy = -38 * scale - 6; ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'; ctx.fillRect(-gw * 0.5, gy, gw, 4); ctx.fillStyle = age < 4 ? '#f472b6' : age < 11 ? '#4ade80' : '#38bdf8'; ctx.fillRect(-gw * 0.5 + 0.5, gy + 0.5, (gw - 1) * growthRatio, 3); } } if (age < 18) { const stageColor = age < 4 ? '#f472b6' : age < 11 ? '#4ade80' : '#38bdf8'; const prog = Math.max(0, Math.min(1, age / 18)); const rise = ((timeSec * 1.6 + (unit.id || 0) * 0.37) % 1); const ringY = 4 - rise * (28 * scale + 6); ctx.strokeStyle = (unit._growthSpurtTimer || 0) > 0 ? '#fde047' : '#4ade80'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85 * (1 - rise * 0.45); ctx.beginPath(); ctx.ellipse(0, ringY, 10 * scale, 3.8 * scale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1.0; const barW = 28, barH = 3.5, barY = -28 * scale - 10; ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; ctx.fillRect(-barW * 0.5, barY, barW, barH); ctx.fillStyle = stageColor; ctx.fillRect(-barW * 0.5 + 0.5, barY + 0.5, (barW - 1) * prog, barH - 1); if ((unit._growthSpurtTimer || 0) > 0) { for (let i = 0; i < 5; i++) { const sx = Math.sin(timeSec * 6 + i * 1.4) * 10 * scale; const sy2 = -4 - ((timeSec * 22 + i * 7) % (26 * scale)); ctx.fillStyle = i % 2 === 0 ? '#fde047' : '#4ade80'; ctx.beginPath(); ctx.arc(sx, sy2, 1.8, 0, Math.PI * 2); ctx.fill(); } } } if ((unit._levelUpTimer || 0) > 0) { const lvR = unit._levelUpTimer / 3.5; ctx.strokeStyle = `rgba(250, 204, 21, ${lvR.toFixed(3)})`; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(0, -36 * (1 - lvR) * scale, 18 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = `rgba(250, 204, 21, ${(lvR * 0.32).toFixed(3)})`; ctx.fillRect(-11 * scale, -44 * scale, 22 * scale, 46 * scale); } if ((unit.age ?? 20) >= 18) { const xpR = Math.max(0, Math.min(1, ((unit.xp || 0) % 100) / 100)), xw = 26, xy = -42 * scale; ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; ctx.fillRect(-xw * 0.5, xy, xw, 3); ctx.fillStyle = unit.bender ? '#38bdf8' : unit.talent === 'martial_prodigy' ? '#f59e0b' : '#a855f7'; ctx.fillRect(-xw * 0.5 + 0.5, xy + 0.5, (xw - 1) * xpR, 2); } if (unit.isPregnant && unit.gender === 'female') { ctx.fillStyle = 'rgba(244, 114, 182, 0.3)'; ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(3.5 * f * scale, -14 * scale, 4.8 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } if (unit.profession === 'fisherman' && Math.abs(unit.y - RIVER_Y) < 95) { const bobY = RIVER_Y - unit.y + Math.sin(timeSec * 5 + (unit.id || 0)) * 2.5; ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(6 * f, -16); ctx.lineTo(22 * f, -28); ctx.stroke(); ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(22 * f, -28); ctx.lineTo(28 * f, bobY); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(28 * f, bobY, 2.5, 0, Math.PI * 2); ctx.fill(); } if (unit.weaponType && scale >= 0.85) { ctx.strokeStyle = unit.weaponType === 'spear' ? '#e2e8f0' : '#fbbf24'; ctx.lineWidth = 2.0; ctx.beginPath(); ctx.moveTo(4 * f, -12); ctx.lineTo(18 * f, -22); ctx.stroke(); } if ((unit.age ?? 20) >= 55) { ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(0, -25 * scale, 5.2 * scale, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2.0; ctx.beginPath(); ctx.moveTo(8 * f, -18); ctx.lineTo(10 * f, 2); ctx.stroke(); } if (unit._isSleeping) { ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#93c5fd'; ctx.fillText('💤 Zzz', 0, -40 * scale); } if (unit.profession === 'soldier' && (unit.age ?? 20) >= 18) { const tg = ctx.createRadialGradient(12 * f, -16, 1, 12 * f, -16, 26); tg.addColorStop(0, 'rgba(251, 191, 36, 0.55)'); tg.addColorStop(1, 'rgba(251, 191, 36, 0)'); ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(12 * f, -16, 26, 0, Math.PI * 2); ctx.fill(); } if (unit && (unit.profession === 'soldier' || unit.greatTitle || unit.bender || (this.windSpeed || 0) > 15)) { const wDir = (this.windVx || 12) >= 0 ? 1 : -1; const flutter = Math.sin((timeSec || 0) * 10 + (unit.id || 0)) * 3.5; const wLen = Math.min(20, 7 + (this.windSpeed || 12) * 0.35); ctx.fillStyle = unit.greatTitle ? 'rgba(217, 119, 6, 0.8)' : 'rgba(185, 28, 28, 0.72)'; ctx.beginPath(); ctx.moveTo(-3 * f, -20 * scale); ctx.quadraticCurveTo(wDir * wLen * 0.6, -15 * scale + flutter, wDir * wLen, -5 * scale + flutter); ctx.lineTo(-2 * f, -6 * scale); ctx.closePath(); ctx.fill(); } if ((unit._knockdownTimer || 0) > 0) { ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fca5a5'; ctx.fillText('\u{1F9B5} Knocked Flat!', 0, -44 * scale); } else if ((unit._rollRecoveryTimer || 0) > 0) { ctx.font = 'bold 9.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde047'; ctx.fillText('\u{1F938} Kip-Up Roll!', 0, -44 * scale); } ctx.restore(); } 
  spawnElementalSourceDraw(game, u, element = 'fire') { if (!u) return; if (!this.elementalSourceDraws) this.elementalSourceDraws = []; let sx = u.x, sy = u.y - 40, color = '#ff6b2b', label = '🔥 Source'; if (element === 'fire') { const sources = [{ x: 685, y: 2405, label: '🔥 Blacksmith Forge' }, { x: 780, y: 2320, label: '🔥 Town Hearth' }, { x: 995, y: 2405, label: '🔥 Tavern Fire' }]; let best = sources[0], bestD = Infinity; for (const s of sources) { const d = Math.hypot(u.x - s.x, u.y - s.y); if (d < bestD) { bestD = d; best = s; } } sx = best.x; sy = best.y; color = '#ff6b2b'; label = best.label; } else if (element === 'water') { sx = u.x; sy = typeof RIVER_Y === 'number' ? RIVER_Y : 2060; color = '#38bdf8'; label = '💧 River'; } else if (element === 'earth') { sx = u.x; sy = u.y + 28; color = '#a16207'; label = '🪨 Bedrock'; } else if (element === 'air') { sx = u.x + (Math.random() - 0.5) * 90; sy = u.y - 95; color = '#e2e8f0'; label = '💨 Air'; } this.elementalSourceDraws.push({ sx, sy, tx: u.x, ty: u.y - 16, unit: u, element, color, label, life: 1.35, maxLife: 1.35 }); } enforceSolidBuildingCollisions(game, dt) {
    if (!game || !Array.isArray(game.buildings) || game.buildings.length === 0) return;

    // 1. Decay building shake & scorch timers smoothly to 0 so structures stand rock-solid!
    for (const b of game.buildings) {
      if (!b) continue;
      b._isBuilding = true;
      if ((b._hitShake || 0) > 0) b._hitShake = Math.max(0, b._hitShake - dt);
      if ((b._scorchTimer || 0) > 0) b._scorchTimer = Math.max(0, b._scorchTimer - dt);
    }

    // 2. Push every grounded human (villagers & rivals) cleanly outside every solid building footprint
    const allUnits = [...(game.villagers || []), ...(game.enemies || [])];
    for (const u of allUnits) {
      if (!u || u._isSleeping || u._isCapturedPrisoner || u.skySoar || (u.z || 0) > 22) continue;
      const uRad = u.radius || (u.isBoss ? 24 : 11);
      for (const b of game.buildings) {
        if (!b || b._collapsed) continue;
        const bRad = (b.radius || 32) + uRad + 12;
        let dx = wrapDX(b.x, u.x);
        let dy = u.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bRad) {
          if (dist < 0.01) {
            dx = 0;
            dy = 1;
          }
          const invD = 1 / Math.max(0.01, dist);
          const nx = dx * invD;
          const ny = dy * invD;
          u.x = wrapX(b.x + nx * (bRad + 1), WORLD_W);
          u.y = b.y + ny * (bRad + 1);
          const vn = (u.vx || 0) * nx + (u.vy || 0) * ny;
          if (vn < 0) {
            u.vx = (u.vx || 0) - vn * nx;
            u.vy = (u.vy || 0) - vn * ny;
          }
        }
      }
    }

    // 3. Keep Janitors, Tourists & Pack-Mule Caravans outside building footprints too
    const roamingProps = [
      ...(this.syxJanitors || []),
      ...(this.syxTourists || []),
      ...(this.packMuleCaravans || []),
      ...(this.diplomaticEnvoys || []),
      ...(this.wildHerds || []),
    ];
    for (const rp of roamingProps) {
      if (!rp) continue;
      for (const b of game.buildings) {
        if (!b || b._collapsed) continue;
        const minSep = (b.radius || 32) + 22;
        const dx = wrapDX(b.x, rp.x);
        const dy = rp.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minSep) {
          const ny = dy >= 0 ? 1 : -1;
          rp.y = b.y + ny * (minSep + 2);
        }
      }
    }
  }

  stepWorldOrderAndLifecycle(game, dt) { if (!game) return; if (!Array.isArray(this.cultureRooms) || this.cultureRooms.length === 0) { this.cultureRooms = [ { id: 'CR1', type: 'library', name: '📚 Grand Scroll Library (+📘K +🦉W)', x: 560, y: 2405, w: 58, h: 34 }, { id: 'CR2', type: 'stockade', name: '⛓️ Cutaway Stockade Cell (Prisoners)', x: 560, y: 2455, w: 54, h: 30 }, { id: 'CR3', type: 'tavern', name: '🍺 Hearth Tavern & Inn (+😊 +🪙)', x: 995, y: 2405, w: 60, h: 34 }, { id: 'CR4', type: 'apothecary', name: '⚕️ Cutaway Apothecary (Heals 🎯H/💪A/🦵L)', x: 780, y: 2455, w: 62, h: 34 } ]; } if (!Array.isArray(this.mineCarts) || this.mineCarts.length === 0) { this.mineCarts = [{ id: 'MC1', x: 575, y: 2205, startY: 2185, endY: 2345, vy: 28, dir: 1, ore: 8 }]; } for (const mc of this.mineCarts) { if (mc.dir >= 0) { mc.vy = Math.min(110, (mc.vy || 25) + 62 * dt); mc.y += mc.vy * dt; if (mc.y >= (mc.endY || 2345)) { mc.y = mc.endY || 2345; mc.dir = -1; mc.vy = 42; if (Array.isArray(this.widelandsFlags) && this.widelandsFlags[0] && Array.isArray(this.widelandsFlags[0].wares)) { if (this.widelandsFlags[0].wares.length < (this.widelandsFlags[0].maxWares || 8)) this.widelandsFlags[0].wares.push('🪨 Ore'); } if (game.resources) game.resources.stone = (game.resources.stone || 0) + 2; if (Array.isArray(this.depositPopups)) this.depositPopups.push({ x: mc.x, y: mc.y - 16, text: '🛒 +2🪨 Ore', color: '#fde68a', life: 1.5, maxLife: 1.5 }); } } else { mc.y -= 42 * dt; if (mc.y <= (mc.startY || 2185)) { mc.y = mc.startY || 2185; mc.dir = 1; mc.vy = 25; mc.ore = 8; } } } if (this.weatherMode === 'rain' || this.weatherMode === 'frost') { if (!Array.isArray(this.weatherParticles)) this.weatherParticles = []; for (let k = 0; k < 4 && this.weatherParticles.length < 48; k++) { this.weatherParticles.push({ x: (game.cam?.x || 780) + (Math.random() - 0.5) * 900, y: (game.cam?.y || 2360) + (Math.random() - 0.5) * 600, vy: this.weatherMode === 'rain' ? 280 + Math.random() * 120 : 45 + Math.random() * 35, vx: this.weatherMode === 'rain' ? -45 : (Math.random() - 0.5) * 30 }); } for (const p of this.weatherParticles) { p.x += (p.vx || 0) * dt; p.y += (p.vy || 80) * dt; if (p.y > (game.cam?.y || 2360) + 320) { p.y = (game.cam?.y || 2360) - 320; p.x = (game.cam?.x || 780) + (Math.random() - 0.5) * 900; } } } else if (Array.isArray(this.weatherParticles) && this.weatherParticles.length) { this.weatherParticles = []; } if (Array.isArray(game.warGalleys)) { for (const g of game.warGalleys) { if (g) g.name = '🐉 WAR GALLEY (⚓2 Crew • 📦3 Cargo)'; } } if (!game._initialPhysicsPatchesSeeded) { game._initialPhysicsPatchesSeeded = true; this.spawnImpactCrater(780, 2360, 26, '🕳️ Impact Crater (-20% Spd)'); if (!this.cavalryCharges) this.cavalryCharges = []; this.spawnMountedCavalryCharge(700, 2375, 1, 'Aethelgard Lancer'); if (!this.buoyantRiverObjects) this.buoyantRiverObjects = []; this.buoyantRiverObjects.push({ id: Date.now() + 1, x: 740, y: RIVER_Y - 6, vx: 34, type: 'log', label: '🌊 Buoyant Timber Log', life: 45.0 }); this.buoyantRiverObjects.push({ id: Date.now() + 2, x: 830, y: RIVER_Y + 8, vx: 30, type: 'crate', label: '🌊 Floating Cargo Crate', life: 45.0 }); if (!this.workshopStations) this.workshopStations = []; this.workshopStations.push({ id: 1, type: 'forge', x: 685, y: 2405, label: '⚒️ Blacksmith Anvil & Forge' }, { id: 2, type: 'cauldron', x: 875, y: 2405, label: '🍲 Bubbling Stew Cauldron & Windmill' }); this.widelandsFlags = [{ id: 0, name: 'West Quarry Flag', x: 575, y: 2382, maxWares: 8, wares: ['🪨 Ore', '🪵 Log', '🌾 Grain'] }, { id: 1, name: 'Town Center Flag', x: 780, y: 2382, maxWares: 8, wares: ['🪵 Log', '⚔️ Sword'] }, { id: 2, name: 'Forge & Training Flag', x: 965, y: 2382, maxWares: 8, wares: ['🪨 Ore'] }]; this.widelandsRoads = [{ from: 0, to: 1 }, { from: 1, to: 2 }]; this.widelandsCarriers = [{ id: 'bram', name: 'Bram', roadIdx: 0, dir: 1, t: 0.25, x: 626, y: 2351, carry: '🪨 Ore', speed: 0.22 }, { id: 'mara', name: 'Mara', roadIdx: 1, dir: -1, t: 0.7, x: 910, y: 2351, carry: '⚔️ Sword', speed: 0.22 }]; this.widelandsProductionSites = [{ id: 'armorsmith', name: '⚒️ Widelands Armorsmith', x: 685, y: 2435, flagIdx: 0, inputA: { ware: '🪨 Ore', count: 2, max: 6 }, inputB: { ware: '🪵 Log', count: 2, max: 6 }, output: '🛡️ Shield', altOutput: '🪖 Helmet', progress: 0, duration: 5.5, toggle: false }, { id: 'bakery', name: '🍞 Widelands Bakery', x: 875, y: 2435, flagIdx: 1, inputA: { ware: '🌾 Grain', count: 2, max: 6 }, inputB: { ware: '🪵 Log', count: 2, max: 6 }, output: '🍞 Bread', progress: 0, duration: 4.5 }]; this.widelandsTrainingSites = [{ id: 'dojo', name: '🥋 Widelands Arena & Dojo', x: 985, y: 2310, flagIdx: 2, timer: 0, interval: 4.0 }]; this.syxGuardPosts = [{ id: 'G1', name: '⚖️ Syx Guard Post (Law Aura)', x: 780, y: 2265, radius: 135, lawStrength: 88 }]; this.syxJanitors = [{ id: 'J1', name: '🧹 Janitor Orin', x: 720, y: 2380, vx: 30, targetIdx: 0, repairedCount: 0 }]; this.syxTourists = [{ id: 'V1', name: '🎓 Scholar Alaric (Tourist)', x: 640, y: 2386, vx: 26, goldSpent: 0, targetX: 965 }]; } if (Array.isArray(this.syxJanitors)) { const dmgBlds = Array.isArray(game.buildings) ? game.buildings.filter(b => b && !b.isEnemy && ((b.hp ?? b.maxHp ?? 100) < (b.maxHp ?? 100) || Math.abs(b._leanAngle || 0) > 0.01)) : []; for (const j of this.syxJanitors) { const tgt = dmgBlds.length > 0 ? dmgBlds[j.targetIdx % dmgBlds.length] : null; if (tgt) { const dx = tgt.x - j.x, dy = tgt.y - j.y, dist = Math.hypot(dx, dy); if (dist > 28) { j.x += (dx / dist) * Math.abs(j.vx || 30) * dt; j.y += (dy / dist) * Math.abs(j.vx || 30) * dt; } else { if ((tgt.hp ?? 100) < (tgt.maxHp ?? 100)) { tgt.hp = Math.min(tgt.maxHp ?? 100, (tgt.hp ?? 100) + 18 * dt); j.repairedCount = (j.repairedCount || 0) + dt; } if (tgt._leanAngle) tgt._leanAngle *= Math.max(0, 1 - 3 * dt); } } else { j.x += (j.vx || 30) * dt; if (j.x > 940) { j.x = 940; j.vx = -Math.abs(j.vx || 30); } else if (j.x < 640) { j.x = 640; j.vx = Math.abs(j.vx || 30); } } } } if (this.syxMarketPrices) { const stock = game.stockpile || game.resources || game; const woodQty = stock.wood ?? 50; const breadQty = stock.bread ?? stock.food ?? 50; this.syxMarketPrices.wood = Math.max(1, Math.min(12, Math.round(6 - woodQty * 0.04 + Math.sin((game.time || 0) * 0.5)))); this.syxMarketPrices.bread = Math.max(1, Math.min(14, Math.round(7 - breadQty * 0.04 + Math.cos((game.time || 0) * 0.4)))); } if (Array.isArray(this.syxTourists)) { for (const t of this.syxTourists) { const dx = (t.targetX ?? 965) - t.x; if (Math.abs(dx) > 6) { t.x += Math.sign(dx) * Math.abs(t.vx || 26) * dt; } else { t.goldSpent = (t.goldSpent || 0) + 4; if (typeof game.gold === 'number') game.gold += 4; t.targetX = t.targetX > 800 ? 640 : 965; this.depositPopups.push({ x: t.x, y: t.y - 22, text: '🎓 +4🪙 Plaza Market', color: '#fde047', life: 1.5, maxLife: 1.5 }); } } } if (Array.isArray(game.siegeEngines)) { for (const s of game.siegeEngines) { if (typeof s.maxAmmo !== 'number') { s.maxAmmo = 6; s.ammo = 6; } if ((s._ammoCd || 0) > 0) s._ammoCd = Math.max(0, s._ammoCd - dt); if ((s.attackCooldown || 0) > 0.7 && (s._ammoCd || 0) <= 0 && s.ammo > 0) { s._ammoCd = 0.9; s.ammo = Math.max(0, s.ammo - 1); } if (s.ammo <= 0 && this.spendPhysicalResource(game, 0, 3, 0, 0)) { s.ammo = s.maxAmmo; if (Array.isArray(this.depositPopups)) { this.depositPopups.push({ x: s.x, y: (s.y || 0) - 36, text: '🪨 Reloaded +6 Siege Boulders (-3🪨 Stone)!', color: '#cbd5e1', life: 1.8, maxLife: 1.8 }); } } } } if (Array.isArray(this.widelandsCarriers) && Array.isArray(this.widelandsFlags) && Array.isArray(this.widelandsRoads)) { for (const c of this.widelandsCarriers) { const r = this.widelandsRoads[c.roadIdx]; const fA = r && this.widelandsFlags[r.from]; const fB = r && this.widelandsFlags[r.to]; if (!fA || !fB) continue; c.t += c.dir * (c.speed || 0.22) * dt; if (c.t >= 1) { c.t = 1; c.dir = -1; if (c.carry && fB.wares.length < (fB.maxWares || 8)) { fB.wares.push(c.carry); c.carry = null; } if (!c.carry && fB.wares.length > 0) c.carry = fB.wares.shift(); } else if (c.t <= 0) { c.t = 0; c.dir = 1; if (c.carry && fA.wares.length < (fA.maxWares || 8)) { fA.wares.push(c.carry); c.carry = null; } if (!c.carry && fA.wares.length > 0) c.carry = fA.wares.shift(); } c.x = fA.x + (fB.x - fA.x) * c.t; c.y = fA.y + (fB.y - fA.y) * c.t; } } if (Array.isArray(this.widelandsProductionSites)) { for (const s of this.widelandsProductionSites) { const flag = this.widelandsFlags && this.widelandsFlags[s.flagIdx]; if (flag && flag.wares.length > 0) { for (let i = flag.wares.length - 1; i >= 0; i--) { const w = flag.wares[i]; if (w === s.inputA.ware && s.inputA.count < (s.inputA.max || 6)) { s.inputA.count++; flag.wares.splice(i, 1); } else if (w === s.inputB.ware && s.inputB.count < (s.inputB.max || 6)) { s.inputB.count++; flag.wares.splice(i, 1); } } } if (s.inputA.count >= 1 && s.inputB.count >= 1) { s.progress = (s.progress || 0) + dt; if (s.progress >= (s.duration || 5.0)) { s.progress = 0; s.inputA.count--; s.inputB.count--; const produced = s.altOutput ? (s.toggle ? s.altOutput : s.output) : s.output; if (s.altOutput) s.toggle = !s.toggle; if (flag && flag.wares.length < (flag.maxWares || 8)) flag.wares.push(produced); if (s.id === 'armorsmith' && Array.isArray(game.villagers) && game.villagers.length > 0) { const v = game.villagers.find(u => (u.shieldHp ?? 100) < 100 || (u.headHp ?? 100) < 100) || game.villagers[0]; if (v) { v.shieldHp = 100; v.headHp = 100; v._roleBadge = '🛡️ Equipped Newly Forged Shield & Helmet!'; this.depositPopups.push({ x: v.x, y: v.y - 24, text: '🛡️ Equipped Newly Forged Shield & Helmet!', color: '#93c5fd', life: 1.6, maxLife: 1.6 }); } } } } } } if (Array.isArray(this.widelandsTrainingSites)) { for (const site of this.widelandsTrainingSites) { site.timer = (site.timer || 0) + dt; if (site.timer >= (site.interval || 4.0)) { site.timer = 0; const trainees = Array.isArray(game.villagers) ? game.villagers : []; const t = trainees.find(u => (u.wlHealth || 0) < 4 || (u.wlAttack || 0) < 4 || (u.wlDefense || 0) < 4 || (u.wlEvade || 0) < 4); if (t) { t.wlHealth = t.wlHealth || 0; t.wlAttack = t.wlAttack || 0; t.wlDefense = t.wlDefense || 0; t.wlEvade = t.wlEvade || 0; if (t.wlHealth < 4) t.wlHealth++; else if (t.wlAttack < 4) t.wlAttack++; else if (t.wlDefense < 4) t.wlDefense++; else if (t.wlEvade < 4) t.wlEvade++; t._roleBadge = `🥋 Trained! H:${t.wlHealth} A:${t.wlAttack} D:${t.wlDefense} E:${t.wlEvade}`; this.depositPopups.push({ x: site.x, y: site.y - 20, text: `🥋 Trained! H:${t.wlHealth} A:${t.wlAttack} D:${t.wlDefense} E:${t.wlEvade}`, color: '#fde047', life: 1.8, maxLife: 1.8 }); } } } } const _allU = [...(game.villagers || []), ...(game.enemies || [])]; for (const u of _allU) { if (!u) continue; if (typeof u.weaponDurability !== 'number') u.weaponDurability = 100; if (!u.heirloomName) { const _hn = ['Ring-Breaker', 'Phoenix-Talon', 'Sun-Cleaver', 'Wind-Whisper', 'Sky-Piercer', 'Oathkeeper', 'Frost-Fang', 'Titan-Maul']; u.heirloomName = _hn[Math.abs((u.id || 0) + (u.name ? u.name.length : 0)) % _hn.length]; } if ((u.attackSwing || 0) > 0.7 && (u._durCd || 0) <= 0) { u._durCd = 0.8; u.weaponDurability = Math.max(10, u.weaponDurability - 4); } if ((u._durCd || 0) > 0) u._durCd = Math.max(0, u._durCd - dt); if (Math.hypot((u.x || 0) - 685, (u.y || 0) - 2405) < 55 && u.weaponDurability < 100) { u.weaponDurability = 100; if (Array.isArray(this.depositPopups)) this.depositPopups.push({ x: u.x, y: (u.y || 0) - 26, text: '⚒️ Resharpened Edge 100%', color: '#93c5fd', life: 1.4, maxLife: 1.4 }); } if (Math.hypot((u.x || 0) - 780, (u.y || 0) - 2455) < 55 && ((u.headHp ?? 100) < 100 || (u.armHp ?? 100) < 100 || (u.legHp ?? 100) < 100 || (u._bleedTimer || 0) > 0)) { u.headHp = 100; u.armHp = 100; u.legHp = 100; u._bleedTimer = 0; if (Array.isArray(this.depositPopups)) this.depositPopups.push({ x: u.x, y: (u.y || 0) - 26, text: '⚕️ Apothecary Physician Restored Limbs (🎯H:100% 💪A:100% 🦵L:100%)!', color: '#4ade80', life: 1.8, maxLife: 1.8 }); } if (u.isEnemy && !u._isCapturedPrisoner && !u.deceased && (u.hp || 0) > 0 && (u.hp || 0) < (u.maxHp || 100) * 0.25) { u._isCapturedPrisoner = true; u.x = 560; u.y = 2455; u._motiveBadge = '⛓️ Prisoner in Stockade (Ransom +25🪙 or Recruit)'; this.logChronicleEvent(`⛓️ Captured ${u.name || 'Rival'} into the Stockade!`); } if (u._isCapturedPrisoner) { u.x = 560; u.y = 2455; u.vx = 0; u.vy = 0; continue; } if (u.syxHappiness === undefined) u.syxHappiness = 78; if (u.syxLoyalty === undefined) u.syxLoyalty = 80; if (u.divisionMorale === undefined) u.divisionMorale = 92; if (!u.lineageText) { const _lin = ['Lineage: House of Vael', 'Lineage: Ironforge Clan', 'Lineage: Oakhaven Guild', 'Lineage: Dawnwatch Keep']; u.lineageText = _lin[Math.abs(Math.floor((u.id || u.x || 0))) % _lin.length]; } const _lawHappy = this.syxLawMode === 'utopia' ? 12 : (this.syxLawMode === 'tyranny' ? -10 : 0); const _lawLoyal = this.syxLawMode === 'tyranny' ? 14 : (this.syxLawMode === 'utopia' ? -4 : 0); let _inAura = false; if (Array.isArray(this.syxGuardPosts)) { for (const gp of this.syxGuardPosts) { if (Math.hypot((u.x || 0) - gp.x, (u.y || 0) - gp.y) <= (gp.radius || 135)) { _inAura = true; break; } } } u.syxHappiness = Math.max(10, Math.min(100, 78 + _lawHappy)); u.syxLoyalty = Math.max(10, Math.min(100, 80 + _lawLoyal + (_inAura ? 15 : 0))); const _hpRatio = (u.hp ?? u.maxHp ?? 100) / Math.max(1, u.maxHp ?? 100); if (_hpRatio < 0.28 && (u._outnumberedCount || 0) >= 3) { u.divisionMorale = Math.max(0, u.divisionMorale - 35 * dt); if (!u._syxRouted) { u._syxRouted = true; u._roleBadge = '🏳️ Division Morale Broken — Routing!'; this.depositPopups.push({ x: u.x || 0, y: (u.y || 0) - 26, text: '🏳️ Division Morale Broken — Routing!', color: '#fca5a5', life: 1.8, maxLife: 1.8 }); } } else { u.divisionMorale = Math.min(100, u.divisionMorale + 5 * dt); if (_hpRatio > 0.5) u._syxRouted = false; } if ((u._headConcussionTimer || 0) > 0) u._headConcussionTimer = Math.max(0, u._headConcussionTimer - dt); if ((u._stunTimer || 0) > 0) u._stunTimer = Math.max(0, u._stunTimer - dt); if ((u._armFractureTimer || 0) > 0) { u._armFractureTimer = Math.max(0, u._armFractureTimer - dt); if ((u.attackTimer || 0) > 0) u.attackTimer += dt * 0.35; if ((u.attackCooldown || 0) > 0) u.attackCooldown += dt * 0.35; } if ((u._legCrippleTimer || 0) > 0) { u._legCrippleTimer = Math.max(0, u._legCrippleTimer - dt); u.x -= (u.vx || 0) * 0.5 * dt; u.y -= (u.vy || 0) * 0.5 * dt; } } if (Array.isArray(this.shieldShards)) { for (let i = this.shieldShards.length - 1; i >= 0; i--) { const sh = this.shieldShards[i]; sh.life -= dt; sh.x += (sh.vx || 0) * dt; sh.y += (sh.vy || 0) * dt; sh.vz = (sh.vz || 0) - 390 * dt; sh.z = (sh.z || 0) + sh.vz * dt; sh.angle = (sh.angle || 0) + (sh.spin || 0) * dt; if (sh.z <= 0) { sh.z = 0; sh.vz = Math.abs(sh.vz) * 0.42; sh.vx *= 0.65; sh.vy *= 0.65; } if (sh.life <= 0) this.shieldShards.splice(i, 1); } } if (Array.isArray(this.bloodSplatters)) { for (let i = this.bloodSplatters.length - 1; i >= 0; i--) { const bs = this.bloodSplatters[i]; bs.life -= dt; bs.x += (bs.vx || 0) * dt; bs.y += (bs.vy || 0) * dt; bs.vz = (bs.vz || 0) - 390 * dt; bs.z = (bs.z || 0) + bs.vz * dt; if (bs.z <= 0) { bs.z = 0; bs.vz = 0; bs.vx *= 0.25; bs.vy *= 0.25; } if (bs.life <= 0) this.bloodSplatters.splice(i, 1); } } if (Array.isArray(this.sonicRings)) { for (let i = this.sonicRings.length - 1; i >= 0; i--) { const sr = this.sonicRings[i]; sr.life -= dt; if (sr.life <= 0) this.sonicRings.splice(i, 1); } } if (Array.isArray(this.flyingHelmets)) { for (let i = this.flyingHelmets.length - 1; i >= 0; i--) { const fh = this.flyingHelmets[i]; fh.life -= dt; fh.x += fh.vx * dt; fh.y += fh.vy * dt; fh.vz -= 390 * dt; fh.z += fh.vz * dt; fh.angle += fh.vRot * dt; if (fh.z <= 0) { fh.z = 0; fh.vz = Math.abs(fh.vz) * 0.42; fh.vx *= 0.65; fh.vy *= 0.65; fh.vRot *= 0.55; if (fh.vz < 28) { fh.vz = 0; fh.vx = 0; fh.vy = 0; fh.vRot = 0; } } if (fh.life <= 0) this.flyingHelmets.splice(i, 1); } } if (Array.isArray(this.anatomicalPopups)) { for (let i = this.anatomicalPopups.length - 1; i >= 0; i--) { const ap = this.anatomicalPopups[i]; ap.life -= dt; ap.z += 22 * dt; if (ap.life <= 0) this.anatomicalPopups.splice(i, 1); } } if (Array.isArray(this.thrownBodies)) { for (let i = this.thrownBodies.length - 1; i >= 0; i--) { const tb = this.thrownBodies[i]; tb.life -= dt; tb.rot += 11 * dt; if (tb.unit) { tb.x = tb.unit.x; tb.y = tb.unit.y; if (!tb._landed && (tb.unit.z || 0) <= 1 && tb.life < (tb.maxLife || 2.8) - 0.25) { tb._landed = true; tb.unit._isThrownProjectile = false; tb.unit._knockdownTimer = 1.8; tb.unit._rollRecoveryTimer = 0.75; tb.unit._consequenceTag = '🤼 Hurled Through Air (Human Projectile)!'; tb.unit._consequenceTimer = 3.5; this.spawnImpactCrater(tb.unit.x, tb.unit.y, 22, '🕳️ Throw Impact Crater'); const allFoes = [...(game.enemies || []), ...(game.villagers || [])]; for (const other of allFoes) { if (other && other !== tb.unit && !other.isT101s && Math.hypot(wrapDX(tb.unit.x, other.x), tb.unit.y - other.y) < 48) { other.hp = Math.max(10, (other.hp || 100) - 28); other.vz = 110; other._knockdownTimer = 1.2; other._consequenceTag = '💥 Bowling Hit by Thrown Body (-28 HP)!'; other._consequenceTimer = 3.0; } } } } if (tb.life <= 0) { this.thrownBodies.splice(i, 1); } } } if (Array.isArray(this.buoyantRiverObjects)) { if (!this.waterWakeRipples) this.waterWakeRipples = []; for (let i = this.buoyantRiverObjects.length - 1; i >= 0; i--) { const bo = this.buoyantRiverObjects[i]; bo.life -= dt; bo.x += (bo.vx || 34) * dt; bo.y = RIVER_Y + Math.sin((bo.x || 0) * 0.025 + (bo.id || 0)) * 10; if (Math.random() < dt * 4) { this.waterWakeRipples.push({ x: bo.x - 10, y: bo.y, r: 4, life: 1.1, maxLife: 1.1 }); } if (bo.life <= 0) this.buoyantRiverObjects.splice(i, 1); } for (let i = this.waterWakeRipples.length - 1; i >= 0; i--) { const wk = this.waterWakeRipples[i]; wk.life -= dt; wk.r += dt * 18; if (wk.life <= 0) this.waterWakeRipples.splice(i, 1); } } if (Array.isArray(this.cavalryCharges)) { if (!this.biomeFootprints) this.biomeFootprints = []; for (let i = this.cavalryCharges.length - 1; i >= 0; i--) { const cc = this.cavalryCharges[i]; cc.life -= dt; cc.x += (cc.vx || 135) * dt; cc.y += (cc.vy || 0) * dt; if (Math.random() < dt * 8) { this.biomeFootprints.push({ x: cc.x, y: cc.y + 8, kind: 'hoof', life: 8.0 }); } for (const f of _allU) { if (f && Math.hypot(f.x - cc.x, f.y - cc.y) < 42 && (f._trampleCooldown || 0) <= 0) { f.hp = Math.max(0, (f.hp || 100) - 36); f.vz = 135; f._trampleCooldown = 1.5; f._consequenceTag = '🦣 Trampled by Cavalry Charge (-36 HP)!'; f._consequenceTimer = 3.5; } } if (cc.life <= 0) this.cavalryCharges.splice(i, 1); } } if (Array.isArray(this.impactCraters)) { for (let i = this.impactCraters.length - 1; i >= 0; i--) { const ic = this.impactCraters[i]; ic.life -= dt; for (const u of _allU) { if (u && Math.hypot(u.x - ic.x, u.y - ic.y) < (ic.radius || 26)) { u._craterSlowFactor = 0.8; if (u.vx) u.vx *= 0.96; if (u.vy) u.vy *= 0.96; } } if (ic.life <= 0) this.impactCraters.splice(i, 1); } } if (!this.biomeFootprints) this.biomeFootprints = []; for (const u of _allU) { if (u && (u._trampleCooldown || 0) > 0) u._trampleCooldown = Math.max(0, u._trampleCooldown - dt); if (u && (Math.abs(u.vx || 0) > 12 || Math.abs(u.vy || 0) > 12) && Math.random() < dt * 2.5) { const kind = u.bender === 'fire' ? 'scorched' : 'mud'; if (this.biomeFootprints.length > 80) this.biomeFootprints.shift(); this.biomeFootprints.push({ x: u.x, y: u.y + 4, kind, life: 6.0 }); } } for (let i = this.biomeFootprints.length - 1; i >= 0; i--) { this.biomeFootprints[i].life -= dt; if (this.biomeFootprints[i].life <= 0) this.biomeFootprints.splice(i, 1); } for (const u of _allU) { if (!u) continue; if ((u._knockdownTimer || 0) > 0) { u._knockdownTimer = Math.max(0, u._knockdownTimer - dt); } else if ((u._rollRecoveryTimer || 0) > 0) { u._rollRecoveryTimer = Math.max(0, u._rollRecoveryTimer - dt); } if ((u._disarmedTimer || 0) > 0) u._disarmedTimer = Math.max(0, u._disarmedTimer - dt); } if (Array.isArray(this.fallingTrees)) { for (let i = this.fallingTrees.length - 1; i >= 0; i--) { const ft = this.fallingTrees[i]; ft.life -= dt; if (ft.phase === 'falling') { ft.angularVel = (ft.angularVel || 1.15) + 3.4 * dt; ft.angle += ft.angularVel * dt; if (ft.angle >= Math.PI / 2) { ft.angle = Math.PI / 2; ft.phase = 'crashed'; ft.dustRadius = 10; const cx = ft.x + ft.fallDir * 36; for (const u of _allU) { if (u && Math.hypot(u.x - cx, u.y - ft.y) < 34 && (u._knockdownTimer || 0) <= 0) { u._knockdownTimer = 1.4; u._rollRecoveryTimer = 0.65; u._consequenceTag = '\u{1F332} Timber Knockdown!'; u._consequenceTimer = 3.0; } } } } else if (ft.phase === 'crashed') { ft.dustRadius = Math.min(44, (ft.dustRadius || 10) + 42 * dt); } if (ft.life <= 0) this.fallingTrees.splice(i, 1); } } if (Array.isArray(this.bladeClashes)) { for (let i = this.bladeClashes.length - 1; i >= 0; i--) { this.bladeClashes[i].life -= dt; if (this.bladeClashes[i].life <= 0) this.bladeClashes.splice(i, 1); } } if (Array.isArray(this.disarmedWeapons)) { for (let i = this.disarmedWeapons.length - 1; i >= 0; i--) { const dw = this.disarmedWeapons[i]; dw.life -= dt; if (dw.life <= 0) { this.disarmedWeapons.splice(i, 1); continue; } if (dw.z > 0 || dw.vz > 0) { dw.x += dw.vx * dt; dw.y += dw.vy * dt; dw.vz -= 380 * dt; dw.z += dw.vz * dt; dw.angle += dw.vRot * dt; if (dw.z <= 0) { dw.z = 0; dw.vx *= 0.25; dw.vy *= 0.25; dw.vz = 0; dw.vRot = 0; } } else { for (const u of _allU) { if (u && Math.hypot(u.x - dw.x, u.y - dw.y) < 22 && ((u._disarmedTimer || 0) <= 0 || dw.life < 9.5)) { u._disarmedTimer = 0; u.weaponType = dw.weaponType || u.weaponType; u._consequenceTag = '\u{1F5E1}\uFE0F Recovered Weapon!'; u._consequenceTimer = 2.5; this.disarmedWeapons.splice(i, 1); break; } } } } } if (typeof this.windAngle !== 'number') this.windAngle = 0.25; if (typeof this.windSpeed !== 'number') this.windSpeed = 12; this.windAngle += Math.sin((game.time || 0) * 0.25) * 0.08 * dt; this.windSpeed = Math.max(6, this.windSpeed + (14 - this.windSpeed) * 0.08 * dt); this.windVx = Math.cos(this.windAngle) * this.windSpeed; this.windVy = Math.sin(this.windAngle) * this.windSpeed * 0.45; if (Array.isArray(this.windGustParticles)) { for (let i = this.windGustParticles.length - 1; i >= 0; i--) { const wp = this.windGustParticles[i]; wp.x += wp.vx * dt; wp.y += wp.vy * dt; wp.life -= dt; if (wp.life <= 0) this.windGustParticles.splice(i, 1); } } if (Array.isArray(game.arrows)) { for (const a of game.arrows) { if (a && !a.stuck) { a.x += (this.windVx || 0) * 0.35 * dt; a.y += (this.windVy || 0) * 0.35 * dt; } } } if (Array.isArray(this.fireParticles)) { for (const fp of this.fireParticles) { if (fp) { fp.x += (this.windVx || 0) * 0.25 * dt; fp.y += (this.windVy || 0) * 0.25 * dt; } } } if (Array.isArray(this.rollingBoulders)) { for (let i = this.rollingBoulders.length - 1; i >= 0; i--) { const b = this.rollingBoulders[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += (Math.hypot(b.vx, b.vy) / Math.max(1, b.radius)) * dt; b.vz = (b.vz || 0) - 340 * dt; b.z = (b.z || 0) + b.vz * dt; if (b.z <= 0) { b.z = 0; b.vz = Math.abs(b.vz) > 45 ? Math.abs(b.vz) * 0.48 : 0; } for (const u of _allU) { if (u && Math.hypot(u.x - b.x, u.y - b.y) < b.radius + 14 && (u._knockdownTimer || 0) <= 0) { u.hp = Math.max(1, (u.hp || 100) - 32); u._knockdownTimer = 1.6; u._rollRecoveryTimer = 0.7; u.vz = 95; u._consequenceTag = '\u{1FAA8} Bowled (-32 HP)!'; u._consequenceTimer = 3.2; } } if (Array.isArray(this.bridges)) { for (const br of this.bridges) { if (br && Math.abs(b.x - br.x) < 42 && Math.abs(b.y - br.y) < 32) { br.cracked = true; br.damage = (br.damage || 0) + 25 * dt; } } } if (Array.isArray(game.buildings)) { for (const bld of game.buildings) { if (!bld || bld.hp <= 0) continue; const dx = b.x - bld.x; const dy = b.y - bld.y; const hitR = (b.radius || 18) + (bld.radius || 30); const dist = Math.hypot(dx, dy); if (dist > 0.001 && dist < hitR) { const nx = dx / dist; const ny = dy / dist; const vn = (b.vx || 0) * nx + (b.vy || 0) * ny; if (vn < 0) { bld._leanAngle = Math.max(-0.31, Math.min(0.31, (bld._leanAngle || 0) + (nx >= 0 ? -0.14 : 0.14))); const e = 0.85; b.vx = (b.vx || 0) - (1 + e) * vn * nx; b.vy = (b.vy || 0) - (1 + e) * vn * ny; b.x = bld.x + nx * (hitR + 2); b.y = bld.y + ny * (hitR + 2); bld.hp = Math.max(1, (bld.hp || 100) - 45); b.ricochetTag = '🪨 Elastic Boulder Ricochet off ' + (bld.name || bld.type || 'Wall') + ' (-45 HP)!'; if (this.spawnImpactCrater) this.spawnImpactCrater(b.x, b.y, 16); } } } } if (b.life <= 0) this.rollingBoulders.splice(i, 1); } } if (Array.isArray(this.elementalSourceDraws)) { for (let i = this.elementalSourceDraws.length - 1; i >= 0; i--) { this.elementalSourceDraws[i].life -= dt; if (this.elementalSourceDraws[i].life <= 0) this.elementalSourceDraws.splice(i, 1); } } if (Array.isArray(this.hydroLightningArcs)) { for (let i = this.hydroLightningArcs.length - 1; i >= 0; i--) { this.hydroLightningArcs[i].life -= dt; if (this.hydroLightningArcs[i].life <= 0) this.hydroLightningArcs.splice(i, 1); } } if (Array.isArray(this.verletChains)) { for (let i = this.verletChains.length - 1; i >= 0; i--) { const vc = this.verletChains[i]; vc.life -= dt; if (vc.life <= 0 || !vc.owner || !vc.target || vc.target.hp <= 0) { this.verletChains.splice(i, 1); continue; } const nodes = vc.nodes; for (let k = 1; k < nodes.length - 1; k++) { const n = nodes[k], vx = (n.x - n.oldX) * 0.92, vy = (n.y - n.oldY) * 0.92; n.oldX = n.x; n.oldY = n.y; n.x += vx; n.y += vy + 45 * dt; } for (let iter = 0; iter < 4; iter++) { nodes[0].x = vc.owner.x; nodes[0].y = vc.owner.y; nodes[nodes.length - 1].x = vc.target.x; nodes[nodes.length - 1].y = vc.target.y; for (let k = 0; k < nodes.length - 1; k++) { const a = nodes[k], b = nodes[k + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, diff = (vc.restLen - d) / d * 0.5; if (k > 0) { a.x -= dx * diff; a.y -= dy * diff; } if (k + 1 < nodes.length - 1) { b.x += dx * diff; b.y += dy * diff; } } } const dx = vc.owner.x - vc.target.x, dy = vc.owner.y - vc.target.y, d = Math.hypot(dx, dy); if (d > vc.restLen * 3) { vc.target.vx = (vc.target.vx || 0) + (dx / d) * 160 * dt; vc.target.vy = (vc.target.vy || 0) + (dy / d) * 160 * dt; } } } if (Array.isArray(this.bernoulliVortices)) { for (let i = this.bernoulliVortices.length - 1; i >= 0; i--) { const bv = this.bernoulliVortices[i]; bv.life -= dt; bv.phase = (bv.phase || 0) + dt * 6; if (bv.life <= 0) { this.bernoulliVortices.splice(i, 1); continue; } for (const u of _allU) { if (!u || (u.hp ?? 100) <= 0) continue; const dx = bv.x - u.x, dy = bv.y - u.y, d = Math.hypot(dx, dy); if (d < bv.radius) { const pull = (1 - d / bv.radius) * 145 * dt; u.vx = (u.vx || 0) + (dx / (d || 1)) * pull - (dy / (d || 1)) * pull * 0.7; u.vy = (u.vy || 0) + (dy / (d || 1)) * pull + (dx / (d || 1)) * pull * 0.7; u.z = Math.min(38, Math.max(u.z || 0, (u.z || 0) + 95 * dt)); if (u.z >= 36) u.z = 38; u._consequenceTag = `🌪️ Bernoulli Vortex Orbit (z=${Math.round(u.z)}px)!`; u._consequenceTimer = 2.0; } } } } if (Array.isArray(this.fulcrumLevers)) { for (let i = this.fulcrumLevers.length - 1; i >= 0; i--) { const fl = this.fulcrumLevers[i]; fl.life -= dt; fl.angle += (fl.targetAngle - fl.angle) * Math.min(1, dt * 8); if (fl.life <= 0) this.fulcrumLevers.splice(i, 1); } } if (Array.isArray(this.avalancheSlides)) { for (let i = this.avalancheSlides.length - 1; i >= 0; i--) { const av = this.avalancheSlides[i]; av.life -= dt; if (av.life <= 0) { this.avalancheSlides.splice(i, 1); continue; } for (const rk of av.rocks || []) { rk.dx += (rk.vx || 0) * dt; rk.dy += (rk.vy || 0) * dt; rk.vy *= (1 - av.mu * 0.45 * dt); for (const u of _allU) { if (!u || (u.hp ?? 100) <= 0) continue; if (Math.hypot(av.x + rk.dx - u.x, av.y + rk.dy - u.y) < 18) { u._knockdownTimer = Math.max(u._knockdownTimer || 0, 1.4); u.hp = Math.max(1, (u.hp ?? 100) - 28 * dt); u._consequenceTag = '⛰️ Buried by Granular Avalanche (Ff=μN • -28 HP)!'; u._consequenceTimer = 2.4; } } } } } if (Array.isArray(this.machCones)) { for (let i = this.machCones.length - 1; i >= 0; i--) { const mc = this.machCones[i]; mc.life -= dt; mc.x = wrapX(mc.x + mc.vx * dt, WORLD_W); if (mc.life <= 0) this.machCones.splice(i, 1); } } if (Array.isArray(this.elasticPoleVaults)) { for (let i = this.elasticPoleVaults.length - 1; i >= 0; i--) { const pv = this.elasticPoleVaults[i]; pv.life -= dt; pv.bend *= Math.max(0, 1 - dt * 4); if (pv.life <= 0) this.elasticPoleVaults.splice(i, 1); } } if (Array.isArray(this.magneticFields)) { for (let i = this.magneticFields.length - 1; i >= 0; i--) { const mf = this.magneticFields[i]; mf.life -= dt; mf.phase = mf.life > 1.1 ? 'attract' : 'launch'; if (mf.life <= 0) { this.magneticFields.splice(i, 1); continue; } const metalLists = [this.disarmedWeapons, this.flyingHelmets, this.shieldShards]; for (const list of metalLists) { if (!Array.isArray(list)) continue; for (const obj of list) { if (!obj) continue; const dist = Math.hypot(mf.x - obj.x, mf.y - obj.y); if (dist < mf.radius) { if (mf.life > 1.1) { const ang = Math.atan2(obj.y - mf.y, obj.x - mf.x) + dt * 4.5; const r = Math.max(24, dist * (1 - dt * 2.5)); obj.x = mf.x + Math.cos(ang) * r; obj.y = mf.y + Math.sin(ang) * r; } else { const dir = obj.x >= mf.x ? 1 : -1; obj.vx = dir * 280; obj.x += obj.vx * dt; } } } } } } if (Array.isArray(this.tsunamiWaves)) { for (let i = this.tsunamiWaves.length - 1; i >= 0; i--) { const tw = this.tsunamiWaves[i]; tw.life -= dt; tw.x = wrapX(tw.x + tw.vx * dt, WORLD_W); if (tw.life <= 0) { this.tsunamiWaves.splice(i, 1); continue; } if (Array.isArray(game.warGalleys)) { for (const g of game.warGalleys) { if (g && Math.abs(wrapDX(tw.x, g.x)) < tw.width) { g._pitch = Math.sin(tw.life * 8) * 0.24; g.vx = (g.vx || 0) + Math.sign(tw.vx) * 28 * dt; } } } for (const u of _allU) { if (!u || (u.hp ?? 100) <= 0) continue; if (Math.abs(wrapDX(tw.x, u.x)) < tw.width * 0.85 && Math.abs(u.y - tw.y) < 42) { u.vx = (u.vx || 0) + Math.sign(tw.vx) * 165 * dt; u._consequenceTag = '🌊 Swept by River Tsunami Surge (Fd Drag)!'; u._consequenceTimer = 2.2; } } } } if (Array.isArray(this.pressureShockwaves)) { for (let i = this.pressureShockwaves.length - 1; i >= 0; i--) { const sw = this.pressureShockwaves[i]; sw.life -= dt; const prevR = sw.radius; sw.radius = Math.min(sw.maxRadius || 155, sw.radius + ((sw.maxRadius || 155) / (sw.maxLife || 0.95)) * dt); if (Array.isArray(game.resourcesNodes)) { for (const rn of game.resourcesNodes) { if (!rn || rn.type !== 'tree') continue; const d = Math.hypot(rn.x - sw.x, rn.y - sw.y); if (d <= sw.radius && d >= Math.max(0, prevR - 18)) { rn._windBend = (rn.x >= sw.x ? 1 : -1) * Math.min(0.85, 0.35 + ((sw.peakForce || 240) / Math.max(25, d)) * 0.08); } } } for (const u of _allU) { if (!u) continue; const dx = u.x - sw.x; const dy = u.y - sw.y; const d = Math.hypot(dx, dy); if (d > 1 && d <= sw.radius && d >= Math.max(0, prevR - 22)) { const invR = (sw.peakForce || 240) / Math.max(24, d); u.kx = (u.kx || 0) + (dx / d) * invR * 28; u.ky = (u.ky || 0) + (dy / d) * invR * 28; u.vz = Math.max(u.vz || 0, 130); u._knockdownTimer = Math.max(u._knockdownTimer || 0, 1.65); u._rollRecoveryTimer = 0.75; u._consequenceTag = '💥 1/r² Newtonian Shockwave!'; } } if (sw.life <= 0) this.pressureShockwaves.splice(i, 1); } } if (!game._realLifeEcosystemSeeded) { game._realLifeEcosystemSeeded = true; this.cropPlots.push({ id: 1, name: 'South Wheat Field', x: 645, y: 2435, growth: 0.65 }, { id: 2, name: 'West Barley Terrace', x: 515, y: 2415, growth: 0.96 }); this.wildHerds.push({ id: 201, species: 'stag', label: '🦌 Wild Stag (35🍖)', x: 540, y: 2175, minX: 470, maxX: 620, vx: 22, meat: 35 }, { id: 202, species: 'boar', label: '🐗 Wild Boar (30🍖)', x: 1020, y: 2225, minX: 960, maxX: 1140, vx: -18, meat: 30 }); this.memorialGraves.push({ x: 725, y: 2215, name: 'Elder Aethel', age: 74, house: 'House Kael', life: 300 }); } for (const cp of this.cropPlots) cp.growth = Math.min(1.0, (cp.growth || 0) + dt * 0.025); for (const wh of this.wildHerds) { wh.x += wh.vx * dt; if (wh.x >= wh.maxX) wh.vx = -Math.abs(wh.vx); else if (wh.x <= wh.minX) wh.vx = Math.abs(wh.vx); } for (let i = this.memorialGraves.length - 1; i >= 0; i--) { this.memorialGraves[i].life -= dt; if (this.memorialGraves[i].life <= 0) this.memorialGraves.splice(i, 1); } for (let i = this.rubbleRuins.length - 1; i >= 0; i--) { const ru = this.rubbleRuins[i]; ru.rebuildTimer = (ru.rebuildTimer || 0) + dt; if (ru.rebuildTimer >= 10.0 && Array.isArray(game.buildings)) { game.buildings.push({ id: game.nextId++, type: 'market', name: ru.name || 'Rebuilt Structure', icon: '🏛️', x: ru.x, y: ru.y, hp: 680, maxHp: 680, radius: ru.radius || 32, owner: 'player', privateOwnerName: 'Rebuilt Guild', constructionProgress: 0.12, _authorized: true, _gridAligned: true, shootTimer: 0 }); this.depositPopups.push({ x: ru.x, y: ru.y - 10, text: `🏗️ Salvaged & Rebuilding ${ru.name}!`, color: '#fbbf24', life: 2.8, maxLife: 2.8 }); this.rubbleRuins.splice(i, 1); } } if (!game._initialPhysicsPatchesSeeded) { game._initialPhysicsPatchesSeeded = true; this.elementalPatches.push({ x: 845, y: 2265, radius: 42, type: 'ice', life: 60 }, { x: 780, y: RIVER_Y + 26, radius: 38, type: 'steam', life: 60 }); } for (let i = this.elementalPatches.length - 1; i >= 0; i--) { this.elementalPatches[i].life -= dt; if (this.elementalPatches[i].life <= 0) this.elementalPatches.splice(i, 1); } for (let i = this.collapsingStructures.length - 1; i >= 0; i--) { this.collapsingStructures[i].life -= dt; if (this.collapsingStructures[i].life <= 0) this.collapsingStructures.splice(i, 1); } for (let i = this.rubbleRuins.length - 1; i >= 0; i--) { this.rubbleRuins[i].life -= dt; if (this.rubbleRuins[i].life <= 0) this.rubbleRuins.splice(i, 1); } for (let i = this.droppedCargoCrates.length - 1; i >= 0; i--) { const cr = this.droppedCargoCrates[i]; cr.life -= dt; if (cr.z > 0) { cr.vz -= 420 * dt; cr.z = Math.max(0, cr.z + cr.vz * dt); } if (cr.life <= 0) this.droppedCargoCrates.splice(i, 1); } for (let i = this.waterSplashes.length - 1; i >= 0; i--) { const sp = this.waterSplashes[i]; sp.life -= dt; if (sp.life <= 0) this.waterSplashes.splice(i, 1); else sp.radius = 6 + (sp.maxRadius - 6) * (1 - sp.life / sp.maxLife); } for (let i = this.ricochetArrows.length - 1; i >= 0; i--) { const ra = this.ricochetArrows[i]; ra.life -= dt; if (ra.life <= 0) this.ricochetArrows.splice(i, 1); else if (ra.z > 0) { ra.x = wrapX(ra.x + ra.vx * dt, WORLD_W); ra.y += ra.vy * dt; ra.vz -= 380 * dt; ra.z = Math.max(0, ra.z + ra.vz * dt); ra.angle += ra.vRot * dt; } } if (Array.isArray(game.arrows)) { const allC = [...(game.villagers || []), ...(game.enemies || [])]; for (let i = game.arrows.length - 1; i >= 0; i--) { const arr = game.arrows[i]; if (!arr) continue; const ax = arr.x ?? arr.startX ?? 0, ay = arr.y ?? arr.startY ?? 0; const def = allC.find((u) => u && Math.hypot(wrapDX(ax, u.x), ay - u.y) < 55 && ((u.bender === 'air' && (u.swingAnim || 0) > 0.04) || (u.blockAnim || 0) > 0.02 || u.fightingStyle === 'phalanx')); if (def) { this.ricochetArrows.push({ x: def.x, y: def.y, z: 18, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 110, vz: 130, angle: 0.5, vRot: 14, life: 1.4 }); def._consequenceTag = def.bender === 'air' ? '🌪️ Wind-Deflected Arrow!' : '🛡️ Shield Ricochet!'; def._consequenceTimer = 2.4; game.arrows.splice(i, 1); } } } const allU = [...(game.villagers || []), ...(game.enemies || [])]; for (const u of allU) { if (!u) continue; if ((u._levelUpTimer || 0) > 0) u._levelUpTimer = Math.max(0, u._levelUpTimer - dt); if (typeof u.level !== 'number') u.level = 1; if (typeof u.xp !== 'number') u.xp = 20 + ((u.id || 0) % 5) * 15; if (!u.rankTitle) u.rankTitle = 'Novice'; if (!Array.isArray(u.unlockedSkills)) u.unlockedSkills = ['Basic Training']; if (((u.swingAnim || 0) > 0.1 || u.state === 'build') && Math.random() < dt * 0.9) this.awardUnitXP(u, 14, 'Combat & Craft'); if ((u._stunTimer || 0) > 0) { u._stunTimer = Math.max(0, u._stunTimer - dt); u.vx = 0; u.vy = 0; } if ((u._hitStopTimer || 0) > 0) { u._hitStopTimer = Math.max(0, u._hitStopTimer - dt); u.vx = 0; u.vy = 0; } if ((u._bleedTimer || 0) > 0) { u._bleedTimer = Math.max(0, u._bleedTimer - dt); u.hp = Math.max(1, (u.hp || 100) - 5 * dt); } if ((u.carryAmount || 0) < 5 && (u.age ?? 20) >= 18 && !u.isBoss) { const cIdx = this.droppedCargoCrates.findIndex((cr) => cr && cr.z <= 2 && Math.hypot(wrapDX(u.x, cr.x), u.y - cr.y) < 28); if (cIdx !== -1) { const cr = this.droppedCargoCrates[cIdx]; u.carryAmount = Math.min(5, (u.carryAmount || 0) + cr.amount); u.gatherType = cr.type; this.droppedCargoCrates.splice(cIdx, 1); u._consequenceTag = `📦 Recovered Dropped ${cr.type.toUpperCase()}!`; u._consequenceTimer = 2.8; } } const kSpd = Math.hypot(u.kx || 0, u.ky || 0); if (kSpd > 65 && (u._stunTimer || 0) <= 0) { const hitB = Array.isArray(game.buildings) && game.buildings.find((b) => b && Math.hypot(wrapDX(u.x, b.x), u.y - b.y) < (b.radius || 32) + 16); const hitT = !hitB && Array.isArray(game.resourcesNodes) && game.resourcesNodes.find((n) => n && Math.hypot(wrapDX(u.x, n.x), u.y - n.y) < 26); if (hitB || hitT) { if (kSpd > 75) { u._knockdownTimer = 1.45; u.hp = Math.max(5, (u.hp || 100) - 45); u.kx = -(u.kx || 0) * 0.45; u.ky = -(u.ky || 0) * 0.45; if (hitB) { hitB._hitShake = 0.45; if (typeof hitB.hp === 'number') hitB.hp = Math.max(0, hitB.hp - 30); u._consequenceTag = `🧱 Crushed Against ${hitB.name}! (+45 Crush DMG • -30 Wall HP)`; } else { hitT._hitTilt = 0.35; u._stunTimer = 1.45; u._consequenceTag = '🌲 Pinned Against Tree! (+45 Crush DMG • Stunned!)'; } } else { u._stunTimer = 1.4; u.hp = Math.max(5, (u.hp || 100) - 12); u.kx = -(u.kx || 0) * 0.45; u.ky = -(u.ky || 0) * 0.45; if (hitB) { hitB._hitShake = 0.35; u._consequenceTag = `💥 Wall-Slam into ${hitB.name} (-12 HP • Stunned!)`; } else { hitT._hitTilt = 0.28; u._consequenceTag = '🌲 Tree-Slam Impact (-12 HP • Stunned!)'; } } u._consequenceTimer = 3.0; } } const inRiv = Math.abs(u.y - RIVER_Y) < 38 && !u.skySoar && (u.z || 0) <= 2; if (inRiv && !u._wasInRiverSplash) { u._wasInRiverSplash = true; this.spawnWaterSplash(u.x, u.y, kSpd > 40 ? '🌊 Knocked into River!' : '💦 River Splash!'); } else if (!inRiv) u._wasInRiverSplash = false; for (const ep of this.elementalPatches) { if (Math.hypot(wrapDX(u.x, ep.x), u.y - ep.y) < ep.radius && ep.type === 'ice') { u.x = wrapX(u.x + (u.vx || 0) * 0.38 * dt, WORLD_W); u.y += (u.vy || 0) * 0.38 * dt; } } } this.syncOneRingBrandingAndUI(game); game.globalTaxTimer = 99999; game.raidTimer = 99999; game.waveTimer = 99999; game.spawnTimer = 99999; game.enemySpawnTimer = 99999; this.updateWorldCensusHUD(game); if (Array.isArray(game.villagers)) { for (const v of game.villagers) if (v) v.econTimer = 99999; } if (this.diplomaticEnvoys.length === 0) this.spawnDiplomaticEnvoy(game, null, 'DIPLOMATIC TRADE EMBASSY'); for (let i = this.diplomaticEnvoys.length - 1; i >= 0; i--) { const env = this.diplomaticEnvoys[i], destX = env.returning ? env.startX : env.targetX, dx = wrapDX(env.x, destX); if (Math.abs(dx) > 35) { env.vx = Math.sign(dx) * 65; env.x = wrapX(env.x + env.vx * dt, WORLD_W); } else if (!env.returning) { env.returning = true; env.statusLabel = `🕊️ Envoy Returning from ${env.aiName} (📜 Treaty Signed!)`; } else this.diplomaticEnvoys.splice(i, 1); } for (let i = this.treatyCeremonies.length - 1; i >= 0; i--) { this.treatyCeremonies[i].life -= dt; if (this.treatyCeremonies[i].life <= 0) this.treatyCeremonies.splice(i, 1); } for (let i = this.depositPopups.length - 1; i >= 0; i--) { this.depositPopups[i].life -= dt; if (this.depositPopups[i].life <= 0) this.depositPopups.splice(i, 1); } /* 1. Initialize Rare Bending (~8%), Professions, Weapons, Genders & Scarce Money */ if (Array.isArray(game.villagers)) { let benderCount = 0; const maxBenders = 2; for (let i = 0; i < game.villagers.length; i++) { const v = game.villagers[i]; if (!v) continue; if (!v._societyInitialized) { v._societyInitialized = true; v.gender = v.isT101s ? 'male' : (i % 2 === 0 ? 'male' : 'female'); if (v.isT101s) v.gender = 'male'; const FEMALE_NAMES = ['Lyra', 'Elena', 'Seraphina', 'Mira', 'Freya', 'Nyssa', 'Isolde', 'Aethel']; const MALE_NAMES = ['t101s', 'Torak', 'Kael', 'Bram', 'Garrick', 'Doran', 'Theron', 'Alaric']; if (!v.isT101s) { const pool = v.gender === 'female' ? FEMALE_NAMES : MALE_NAMES; v.name = `${pool[i % pool.length]}-${i}`; v.baseName = v.name; } v.personalGold = v.personalGold ?? (i === 1 ? 72 : 4 + (i * 3) % 9); v.walletGold = v.personalGold; if (v.isT101s) { v.profession = 'sovereign'; v.professionLabel = '👑 Sovereign'; v.weaponType = 'sword'; } else if (benderCount < maxBenders && (i === 1 || i === 4)) { benderCount++; v.bender = i === 1 ? 'fire' : 'air'; v.subElement = i === 1 ? 'lightning' : 'flight'; v.talent = 'bending_savant'; v.profession = 'bender'; v.professionLabel = `✨ Rare ${v.bender.toUpperCase()} Bender`; } else if (i === 2) { v.age = i === 2 ? 2.4 : 7.5; v.childScale = 0.36 + 0.62 * (v.age / 18); v.bender = 'fire'; v.subElement = 'lightning'; v.talent = 'bending_savant'; v.profession = 'apprentice_bender'; v.professionLabel = '🥋 Bending Apprentice'; } else if (i === 5) { v.age = i === 2 ? 2.4 : 7.5; v.childScale = 0.36 + 0.62 * (v.age / 18); v.bender = null; v.talent = 'martial_prodigy'; v.profession = 'apprentice_martial'; v.weaponType = 'spear'; v.weaponLabel = '🗡️ Spear'; v.professionLabel = '🥋 Martial Apprentice (🗡️ Spear)'; } else { v.bender = null; v.subElement = null; v.skySoar = false; const p = PROFESSIONS[i % PROFESSIONS.length]; v.profession = p.id; v.professionLabel = p.label; if (p.id === 'soldier' || p.id === 'hunter' || i % 3 === 0) { v.talent = 'martial_prodigy'; const w = WEAPON_ARSENAL[i % WEAPON_ARSENAL.length]; v.weaponType = p.id === 'hunter' ? 'bow' : w.id; v.weaponLabel = p.id === 'hunter' ? '🏹 Bow' : w.label; } } if (i === 4) { v.weaponType = 'bow'; v.weaponLabel = '🏹 Recurve Bow'; v.isArcher = true; v.maxAmmo = 12; v.ammo = 4; } } else if (v.bender && !v.isT101s) { benderCount++; if (benderCount > maxBenders) { v.bender = null; v.subElement = null; } } if ((v.walletGold || 0) > 120 && !v.isT101s) { v.personalGold = 12; v.walletGold = 12; } } if (!game._initialFamilySeeded && game.villagers.length >= 6) { game._initialFamilySeeded = true; const w = game.villagers.find((u) => u && !u.isT101s && u.gender === 'female' && (u.age || 20) >= 18); const m = game.villagers.find((u) => u && !u.isT101s && u.gender === 'male' && (u.age || 20) >= 18); for (const u of game.villagers) { if (u && u.gender !== 'female') { u.isPregnant = false; u.pregnancyProgress = 0; } } if (w && m && w.gender === 'female') { w.isPregnant = true; w.pregnancyProgress = 0.58; m.isPregnant = false; m.pregnancyProgress = 0; w.familyHouse = 'House Kael'; m.familyHouse = 'House Kael'; m._consequenceTag = `💕 Expecting Child with ${w.name.split('-')[0]}`; m._consequenceTimer = 7.0; } if (Array.isArray(game.buildings)) { const huts = game.buildings.filter((b) => b && b.owner === 'player' && b.type === 'hut'); if (huts[0]) huts[0]._householdName = 'House Kael'; if (huts[1]) huts[1]._householdName = 'House Dax'; } } } /* 2. Step Professions, Pregnancy, Love-Making (Success vs Failure), Scarce Trade & Construction */ if (Array.isArray(game.villagers) && Array.isArray(game.buildings)) { const unfinishedB = game.buildings.find((b) => b && b.owner === 'player' && (b.constructionProgress ?? 1) < 1.0); const marketB = game.buildings.find((b) => b && b.owner === 'player' && b.type === 'market'); for (const u of game.villagers) { if (!u) continue; if (!Number.isFinite(u.x)) u.x = 780; if (!Number.isFinite(u.y)) u.y = 2320; if (!Number.isFinite(u.vx)) u.vx = 0; if (!Number.isFinite(u.vy)) u.vy = 0; if (!Number.isFinite(u.z)) u.z = 0; if (!Number.isFinite(u.vz)) u.vz = 0; if (u.gender !== 'female' || u.isT101s) { u.isPregnant = false; u.pregnancyProgress = 0; u.pregnant = false; u.reproTimer = 99999; if (u._consequenceTag && (u._consequenceTag.includes('Pregnant') || u._consequenceTag.includes('Gave Birth') || u._consequenceTag.includes('Conceived'))) { u._consequenceTag = null; u._consequenceTimer = 0; } } if ((u._consequenceTimer || 0) > 0) u._consequenceTimer = Math.max(0, u._consequenceTimer - dt); if ((u._loveCooldown || 0) > 0) u._loveCooldown = Math.max(0, u._loveCooldown - dt); if ((u._tradeCooldown || 0) > 0) u._tradeCooldown = Math.max(0, u._tradeCooldown - dt); if ((u._growthSpurtTimer || 0) > 0) u._growthSpurtTimer = Math.max(0, u._growthSpurtTimer - dt); this.stepKnowledgeWisdomAndGreatness(game, u, dt, false); if (this.stepProjectileAmmoAndResupply(game, u, dt, false)) continue; if (u._attackBuildingTarget && this.stepHumanAttackStructure(game, u, dt)) continue; if (u.isT101s) { u._stunTimer = 0; if ((u._directMoveTimer || 0) > 0 && typeof u._cmdTargetX === 'number') { u._directMoveTimer = Math.max(0, u._directMoveTimer - dt); const dx = wrapDX(u.x, u._cmdTargetX), dy = u._cmdTargetY - u.y, dist = Math.hypot(dx, dy); if (dist > 10) { const spd = u.lightningSpeed ? 260 : 98; u.vx = (dx / dist) * spd; u.vy = (dy / dist) * spd; u.x = wrapX(u.x + u.vx * dt, WORLD_W); u.y = Math.max(1350, Math.min(WORLD_H - 160, u.y + u.vy * dt)); u.state = 'move'; u.facing = dx >= 0 ? 1 : -1; } else { u._directMoveTimer = 0; u.vx = 0; u.vy = 0; u.state = 'idle'; } } else if (u._forcedGatherType) { this.stepPhysicalHarvestAndStoreCycle(game, u, dt, false); } u._roleBadge = '👑 Sovereign t101s'; continue; } if ((u.age ?? 20) < 18) { const prevFloor = Math.floor(u.age || 0); u.age = (u.age ?? 2) + dt * 0.22; u.childScale = Math.max(0.36, Math.min(0.98, 0.36 + 0.62 * (u.age / 18))); const newFloor = Math.floor(u.age); if (newFloor > prevFloor && u.age < 18) { u._growthSpurtTimer = 2.2; u._consequenceTag = `🌱 Growing Up! Now ${newFloor}y`; u._consequenceTimer = 3.0; } const pct = Math.min(99, Math.round((u.age / 18) * 100)); if (u.age >= 18) { u.age = 18; u.childScale = 1.0; u.lifeStage = 'adult'; u._growthSpurtTimer = 2.2; u._roleBadge = '🎉 Came of Age (18y Adult)!'; u._consequenceTag = '🎉 Came of Age (18y Adult)!'; u._consequenceTimer = 4.0; } else { u._roleBadge = u.age < 4 ? `👶 Crawling Infant (${u.age.toFixed(1)}y • ${Math.round((u.age/18)*100)}%)` : u.age < 11 ? `👧 Growing Child (${Math.floor(u.age)}y • ${Math.round((u.age/18)*100)}%)` : `🧒 Apprentice Youth (${Math.floor(u.age)}y • ${Math.round((u.age/18)*100)}%)`; } continue; } if (u.isPregnant && u.gender === 'female' && !u.isT101s) { u.pregnancyProgress = (u.pregnancyProgress || 0) + dt * 0.032; u._roleBadge = `🤰 Pregnant (${Math.min(99, Math.floor(u.pregnancyProgress * 100))}%) • ${u.professionLabel || 'Citizen'}`; if (u.pregnancyProgress >= 1.0) { u.isPregnant = false; u.pregnancyProgress = 0; u._loveCooldown = 35; const motherFirst = (u.name || 'Lyra').split('-')[0]; const babyGender = Math.random() < 0.5 ? 'female' : 'male'; const babyName = babyGender === 'female' ? `${motherFirst}Jr` : `${(u._fatherName || 'Kael')}Jr`; if (game.villagers.length < 120 && typeof game.createVillager === 'function') { const babyGender = Math.random() < 0.5 ? 'male' : 'female'; const motherFirst = (u.name || 'Lyra').split('-')[0]; const fatherFirst = u._fatherName || 'Kael'; const baby = game.createVillager(u.x + 12, u.y + 8, `${babyGender === 'female' ? motherFirst : fatherFirst}Jr-${game.nextId}`); if (baby) { baby.age = 0.2; baby.childScale = 0.36 + 0.62 * (0.2 / 18); baby.lifeStage = 'child'; baby.personalGold = 0; baby.walletGold = 0; baby.gender = babyGender; baby.isPregnant = false; baby.pregnancyProgress = 0; baby.bender = Math.random() < 0.08 ? 'water' : null; baby._societyInitialized = true; game.villagers.push(baby); } } u._consequenceTag = '👶 Gave Birth to Newborn Child!'; try { this.logChronicleEvent(`👶 ${motherFirst} gave birth to a newborn in Aethelgard!`); } catch (e) {} u._consequenceTimer = 6.0; } continue; } if (u.gender === 'male' && (u._loveCooldown || 0) <= 0 && !u.isT101s) { const partner = game.villagers.find((w) => w && w !== u && w.gender === 'female' && (w.age ?? 20) >= 18 && !w.isPregnant && (w._loveCooldown || 0) <= 0 && Math.hypot(wrapDX(u.x, w.x), u.y - w.y) < 34); if (partner) { u._loveCooldown = 28; partner._loveCooldown = 28; if (Math.random() < 0.42 && partner.gender === 'female') { partner.isPregnant = true; partner.pregnancyProgress = 0.05; partner._fatherName = u.name ? u.name.split('-')[0] : 'Kael'; u.isPregnant = false; u.pregnancyProgress = 0; u._consequenceTag = '❤️ Expecting Father'; partner._consequenceTag = '🤰 Pregnant'; } else { u._consequenceTag = '💔 Made Love (No Pregnancy)'; partner._consequenceTag = '💭 Made Love (Not Pregnant)'; } u._consequenceTimer = 4.5; partner._consequenceTimer = 4.5; } } if (u.profession === 'builder' && unfinishedB) { const dxB = wrapDX(u.x, unfinishedB.x), dyB = unfinishedB.y - u.y; if (Math.hypot(dxB, dyB) > (unfinishedB.radius || 32) + 18) { u.x = wrapX(u.x + Math.sign(dxB) * 38 * dt, WORLD_W); u.y += Math.sign(dyB) * 26 * dt; u.state = 'move'; } else { u.state = 'build'; unfinishedB.constructionProgress = Math.min(1.0, (unfinishedB.constructionProgress || 0) + dt * 0.045); } u._roleBadge = `🔨 Builder (${Math.round((unfinishedB.constructionProgress || 0) * 100)}%)`; } else if (u.profession === 'fisherman') { if (Math.abs(u.y - (RIVER_Y + 34)) > 18) u.y += Math.sign(RIVER_Y + 34 - u.y) * 28 * dt; u._roleBadge = `🎣 Fisherman • ${u.walletGold || 0}🪙`; } else { u._gatherTimer = (u._gatherTimer || 0) + dt; if ((u._carriedGoods || 0) < 3) { if (u._gatherTimer >= 1.6) { u._gatherTimer = 0; u._carriedGoods = (u._carriedGoods || 0) + 1; } u._roleBadge = `🪵 ${u._carriedGoods || 0}/3 • ${u.personalGold ?? u.walletGold ?? 0}🪙`; } else if (marketB) { const dxM = wrapDX(u.x, marketB.x), dyM = marketB.y - u.y; if (Math.hypot(dxM, dyM) >= 95) { u.x = wrapX(u.x + Math.sign(dxM) * 38 * dt, WORLD_W); u.y += Math.sign(dyM) * 26 * dt; u.state = 'move'; u._roleBadge = `🪵 3/3 → Market`; } else if ((u._tradeCooldown || 0) <= 0) { u._tradeCooldown = 4.0; u._carriedGoods = 0; const curG = (u.personalGold ?? u.walletGold ?? 0) + 7; u.personalGold = curG; u.walletGold = curG; u._consequenceTag = `🤝 Traded Goods (+7🪙 • Saved ${curG}/85🪙)`; u._consequenceTimer = 3.2; u._roleBadge = `⚖️ Saved ${curG}/85🪙`; } } const curGold = u.personalGold ?? u.walletGold ?? 0; if ((u.walletGold ?? curGold) >= 85 && !unfinishedB) { const reqGold = 85; u.personalGold = curGold - reqGold; u.walletGold = u.personalGold; const BUILD_SEQ = [{ type: 'sawmill', name: 'Sawmill', icon: '🪚' }, { type: 'kitchen', name: 'Kitchen', icon: '🍲' }, { type: 'quarry', name: 'Quarry', icon: '⛏️' }, { type: 'forge', name: 'Forge', icon: '⚒️' }, { type: 'barracks', name: 'Barracks', icon: '⚔️' }, { type: 'shrine', name: 'Shrine', icon: '⛩️' }, { type: 'hut', name: 'Hut', icon: '🏠' }]; const pCount = game.buildings.filter((b) => b && b.owner === 'player').length; const spec = BUILD_SEQ[Math.max(0, pCount - 3) % BUILD_SEQ.length]; const tc = game.buildings.find((b) => b && b.owner === 'player' && b.type === 'town_center') || { x: 780, y: 2320 }; const cols = [-270, -135, 0, 135, 270, 405], rows = [-115, 0, 115, 230]; let spot = null; for (const dy of rows) { for (const dx of cols) { if (dx === 0 && dy === 0) continue; const cx = wrapX(tc.x + dx, WORLD_W), cy = Math.max(2165, Math.min(2680, tc.y + dy)); if (!game.buildings.some((o) => o && Math.hypot(wrapDX(cx, o.x), cy - o.y) < 105)) { spot = { x: cx, y: cy }; break; } } if (spot) break; } if (spot) { const ownerFirst = String(u.name || 'Citizen').split(/[\s-]/)[0]; game.buildings.push({ id: game.nextId++, owner: 'player', type: spec.type, name: `${ownerFirst}'s ${spec.name}`, icon: spec.icon, x: spot.x, y: spot.y, hp: 450, maxHp: 450, radius: 32, constructionProgress: 0.05, _authorized: true, _gridAligned: true, privateOwnerId: u.id, privateOwnerName: u.name.split('-')[0] }); u._consequenceTag = `🏗️ ${ownerFirst} started ${spec.name} (-85🪙)`; u._consequenceTimer = 4.0; } } } if (typeof u.hunger !== 'number') { u.hunger = u.id % 3 === 0 ? 68 : 24; u.energy = u.id % 4 === 0 ? 24 : 82; u.morale = 88; if (u.id % 5 === 0 && (u.age ?? 20) >= 20) u.age = 58; } u.hunger = Math.min(100, u.hunger + dt * 1.4); u.energy = Math.max(0, u.energy - dt * 1.1); u._isSleeping = false; if ((u.age ?? 20) >= 55) { u.professionLabel = `🧓 Elder ${(u.name || 'Sage').split('-')[0]}`; if ((u.age ?? 58) >= (u.maxAge || 78)) this.passDownFamilyInheritance(game, u); } const homeHut = game.buildings.find((b) => b && b.owner === 'player' && b.type === 'hut') || game.buildings[0]; if (u.energy <= 20 && homeHut) { const dxH = wrapDX(u.x, homeHut.x), dyH = homeHut.y - u.y; if (Math.hypot(dxH, dyH) > 28) { u.x = wrapX(u.x + Math.sign(dxH) * 34 * dt, WORLD_W); u.y += Math.sign(dyH) * 24 * dt; u.state = 'move'; u._roleBadge = `🥱 Tired (${Math.round(u.energy)}% Energy) → Walking Home to Sleep`; } else { u.vx = 0; u.vy = 0; u.state = 'idle'; u._isSleeping = true; u.energy = Math.min(100, u.energy + dt * 18); u._roleBadge = `💤 Sleeping in ${homeHut._householdName || 'Family Hut'} (Energy ${Math.round(u.energy)}%)`; } continue; } const foodStore = game.buildings.find((b) => b && b.owner === 'player' && (b.type === 'kitchen' || b.type === 'market' || b.type === 'town_center')) || game.buildings[0]; if (u.hunger >= 72 && foodStore) { const dxF = wrapDX(u.x, foodStore.x), dyF = foodStore.y - u.y; if (Math.hypot(dxF, dyF) > 34) { u.x = wrapX(u.x + Math.sign(dxF) * 40 * dt, WORLD_W); u.y += Math.sign(dyF) * 28 * dt; u.state = 'move'; u._roleBadge = `🍖 Hungry (${Math.round(u.hunger)}%) → Seeking Meal at ${foodStore.name}`; } else if ((u.walletGold || 0) >= 1) { u.walletGold -= 1; u.hunger = 0; u.energy = Math.min(100, u.energy + 25); u._consequenceTag = `🍲 Ate Cooked Meal at ${foodStore.name} (-1🪙 • +HP & Morale!)`; u._consequenceTimer = 3.2; } else { u.hunger = 15; u._consequenceTag = '⚖️ Guard Deterred Pilfering & Issued Emergency Ration!'; u._consequenceTimer = 3.8; } continue; } if (!u.isT101s) this.stepPhysicalHarvestAndStoreCycle(game, u, dt, false); } for (const b of game.buildings) { if (b && (b.constructionProgress ?? 1) < 1.0) b.constructionProgress = Math.min(1.0, b.constructionProgress + dt * 0.018); } } /* 3. Rival Homelands, Rare Enemy Bending (~8%), Weapons & Childhood Lifecycle */ if (Array.isArray(game.aiPlayers) && Array.isArray(game.buildings) && Array.isArray(game.enemies)) { if (!game._rivalHomelandsSeeded) { game._rivalHomelandsSeeded = true; for (const ai of game.aiPlayers) { if (!ai) continue; ai.y = 2320; if (!game.buildings.some((b) => b && b.owner === ai.id && b.type === 'hut')) { game.buildings.push( { id: game.nextId++, type: 'hut', name: `${ai.tribe} Nursery`, icon: '🛖', x: wrapX(ai.x - 135, WORLD_W), y: 2320, hp: 650, maxHp: 650, radius: 28, owner: ai.id, customColor: ai.color, constructionProgress: 1.0, _authorized: true, _gridAligned: true }, { id: game.nextId++, type: 'barracks', name: `${ai.tribe} Barracks`, icon: '⚔️', x: wrapX(ai.x + 135, WORLD_W), y: 2320, hp: 980, maxHp: 980, radius: 36, owner: ai.id, customColor: ai.color, constructionProgress: 0.45, _authorized: true, _gridAligned: true } ); } } } if (!game._vanguardRelocatedToHomeland && game.aiPlayers.length > 0) { game._vanguardRelocatedToHomeland = true; for (let i = 0; i < game.enemies.length; i++) { const e = game.enemies[i]; if (!e || e.isBoss) continue; const ai = game.aiPlayers.find((a) => a.id === e.aiOwnerId) || game.aiPlayers[i % game.aiPlayers.length]; if (ai && Math.abs(wrapDX(780, e.x)) < 700) { e.x = wrapX(ai.x + ((i % 4) - 1.5) * 42, WORLD_W); e.y = 2320 + ((i % 3) - 1) * 34; e.age = i % 2 === 0 ? 6 : 14; e.childScale = 0.5 + 0.5 * (e.age / 18); } } } for (let i = 0; i < game.enemies.length; i++) { const e = game.enemies[i]; if (!e || e.isBoss) continue; if (e._attackBuildingTarget && this.stepHumanAttackStructure(game, e, dt)) continue; if (!e._lifecycleInitialized) { e._lifecycleInitialized = true; e.gender = i % 2 === 0 ? 'male' : 'female'; if ((e.id || i) % 11 !== 0) e.bender = null; const w = WEAPON_ARSENAL[(e.id || i) % WEAPON_ARSENAL.length]; e.weaponType = w.id; e.weaponLabel = w.label; if (!e.ringCrusader && e.age >= 18 && i > 12) e.age = 4 + (i % 7); } e.age = (e.age ?? 8) + dt * 0.12; if (e.age < 18) { e.childScale = Math.max(0.48, Math.min(0.95, 0.48 + 0.52 * (e.age / 18))); e.lifeStage = e.age < 12 ? 'child' : 'youth'; const homeAI = game.aiPlayers.find((a) => a.id === e.aiOwnerId); if (homeAI && Math.hypot(wrapDX(e.x, homeAI.x), 2320 - e.y) > 150) { e.x = wrapX(e.x + Math.sign(wrapDX(e.x, homeAI.x)) * 32 * dt, WORLD_W); e.y += Math.sign(2320 - e.y) * 20 * dt; } e._motiveBadge = e.age < 12 ? `👶 Clan Child (${Math.floor(e.age)}y)` : `🧒 Training Youth (${Math.floor(e.age)}y • ${e.weaponLabel})`; } else { e.childScale = 1.0; if (this.stepProjectileAmmoAndResupply(game, e, dt, true)) { e._motiveBadge = e._roleBadge || '🏹 Resupplying Arrows'; continue; } e.lifeStage = 'adult'; if (!e.warMotive) { const spec = WAR_MOTIVES[(e.id || 0) % WAR_MOTIVES.length]; e.warMotive = spec.reason; e.motiveTargetTypes = spec.targetTypes; } e._motiveBadge = `${e.warMotive} (${e.bender ? '✨ ' + e.bender.toUpperCase() : e.weaponLabel})`; } if (e._isTrialChallenger && e._trialTarget && (e._trialTarget.hp ?? 100) > 0) { const tgt = e._trialTarget; const dxT = wrapDX(e.x, tgt.x); const dyT = tgt.y - e.y; const dT = Math.max(1, Math.hypot(dxT, dyT)); e.facing = dxT >= 0 ? 1 : -1; if (dT > 34) { e.vx = (dxT / dT) * 52; e.vy = (dyT / dT) * 38; e.x = wrapX(e.x + e.vx * dt, WORLD_W); e.y += e.vy * dt; e.state = 'move'; } else { e.vx = 0; e.vy = 0; e.state = 'attack'; e.swingAnim = Math.max(e.swingAnim || 0, 0.35); } e._motiveBadge = `⚔️ 1-vs-10 Challenger (${Math.ceil(e.hp || 0)} HP)`; continue; } this.stepPhysicalHarvestAndStoreCycle(game, e, dt, true); } } if (this.packMuleCaravans.length === 0) { this.packMuleCaravans.push({ id: 1, x: 780, y: 2375, minX: 640, maxX: 1180, vx: 36, statusLabel: '🐪 Pack-Mule Caravan (Silk & Iron • +5🪙)' }, { id: 2, x: 960, y: 2320, minX: 640, maxX: 1320, vx: -34, statusLabel: '🐪 Pack-Mule Caravan (Grain & Gold • +5🪙)' }); } for (const c of this.packMuleCaravans) { c.x += c.vx * dt; if (c.x <= c.minX) { c.x = c.minX; c.vx = Math.abs(c.vx); } else if (c.x >= c.maxX) { c.x = c.maxX; c.vx = -Math.abs(c.vx); } } if (this.merchantShips.length === 0) { this.merchantShips.push({ id: 101, x: 760, y: RIVER_Y, minX: 480, maxX: 1360, vx: 42, statusLabel: '⛵ Merchant Dhow (Spice & Gold • +8🪙)' }, { id: 102, x: 1040, y: RIVER_Y, minX: 480, maxX: 1420, vx: -38, statusLabel: '⛵ Merchant Dhow (Timber & Ore • +8🪙)' }); } for (const m of this.merchantShips) { m.x += m.vx * dt; if (m.x <= m.minX) { m.x = m.minX; m.vx = Math.abs(m.vx); } else if (m.x >= m.maxX) { m.x = m.maxX; m.vx = -Math.abs(m.vx); } } if (Array.isArray(game.villagers)) { const bMaster = game.villagers.find((v) => v && !v.isT101s && v.bender && v.profession !== 'apprentice_bender' && (v.age ?? 20) >= 18); const bApp = game.villagers.find((v) => v && v.profession === 'apprentice_bender'); if (bMaster && bApp) { const kata = Math.sin((game.time || 0) * 3.5) * 6; bMaster.x = 780 - 16; bMaster.y = 2250 + kata * 0.3; bApp.x = 780 + 16; bApp.y = 2250 - kata * 0.3; bApp._roleBadge = `🥋 Dojo Apprentice (${(bApp.bender || 'fire').toUpperCase()} • Master ${bMaster.name.split('-')[0]})`; } const mMaster = game.villagers.find((v) => v && !v.bender && v.talent === 'martial_prodigy' && v.profession !== 'apprentice_martial' && (v.age ?? 20) >= 18); const mApp = game.villagers.find((v) => v && v.profession === 'apprentice_martial'); if (mMaster && mApp) { const kata = Math.cos((game.time || 0) * 4.0) * 6; mMaster.x = 920 - 16; mMaster.y = 2365 + kata * 0.3; mApp.x = 920 + 16; mApp.y = 2365 - kata * 0.3; mApp._roleBadge = `🥋 Martial Apprentice (${mApp.weaponLabel || '🗡️ Spear'} • Master ${mMaster.name.split('-')[0]})`; } for (const u of game.villagers) { if (u && u.familyHouse && u._roleBadge && !u._roleBadge.includes('💍')) { u._roleBadge += ` • 💍 ${u.familyHouse}`; } } } } }

export function installIsometricGraphicsUpgrade(targetClassOrInstance) {
  const proto =
    typeof targetClassOrInstance === 'function'
      ? targetClassOrInstance.prototype
      : Object.getPrototypeOf(targetClassOrInstance);

  const villagerBank = new VillagerSpriteBank();
  const envBank = new EnvironmentSpriteBank();
  const biomeRenderer = new EarthBiomeRenderer();
  const footpaths = new PlanetaryFootpathOverlay({ cellSize: 28 });
  const combatVFX = new CombatAndPowersVFXRenderer();
  const physicsEngine = new SovereignPhysicsEngine();
  const worldOrder = new SovereignWorldOrderEngine(); const origHandleUnitDeath = proto.handleUnitDeath; if (typeof origHandleUnitDeath === 'function') { proto.handleUnitDeath = function (unit, ...rest) { if (unit && (!unit.owner || unit.owner === 'player')) worldOrder.passDownFamilyInheritance(this, unit); return origHandleUnitDeath.call(this, unit, ...rest); }; } proto.getSelectedUnit = function () { const ids = this.selectedIds || []; if (Array.isArray(this.villagers)) { const v = this.villagers.find((u) => u && ids.includes(u.id)); if (v) return v; } if (Array.isArray(this.enemies)) { const e = this.enemies.find((u) => u && ids.includes(u.id)); if (e) return e; } return (this.villagers && this.villagers[0]) || null; }; const origHandleTap = proto.handleWorldTap; if (typeof origHandleTap === 'function') { proto.handleWorldTap = function (sx, sy, forceCommand = false) { const wp = typeof this.screenToWorld === 'function' ? this.screenToWorld(sx, sy) : null; if (wp && !forceCommand) { const all = [...(this.villagers || []), ...(this.enemies || [])]; let bestU = null, bestD = 36; for (const u of all) { if (!u) continue; const d = Math.hypot(wrapDX(wp.x, u.x), wp.y - u.y); if (d < (u.isBoss ? 54 : bestD)) { bestD = d; bestU = u; } } if (bestU) { this.selectedIds = [bestU.id]; this.selectedBuildingId = null; if (typeof this.updateInspector === 'function') this.updateInspector(); return; } } if (wp) { const sel = [...(this.villagers || []), ...(this.enemies || [])].filter((u) => u && Array.isArray(this.selectedIds) && this.selectedIds.includes(u.id)); const node = Array.isArray(this.resourcesNodes) ? this.resourcesNodes.find((n) => n && Math.hypot(wrapDX(wp.x, n.x), wp.y - n.y) < 38) : null; const bldg = Array.isArray(this.buildings) ? this.buildings.find((b) => b && Math.hypot(wrapDX(wp.x, b.x), wp.y - b.y) < (b.radius || 32) + 14) : null; for (const u of sel) { if (bldg && forceCommand) { u._attackBuildingTarget = bldg; u._directMoveTimer = 0; u._forcedGatherType = null; u._consequenceTag = `💥 Commanded: Attack & Destroy ${bldg.name}!`; u._consequenceTimer = 3.5; } else if (u.isT101s && this.heroTeleportOnTap && forceCommand) { u.x = wrapX(wp.x, WORLD_W); u.y = Math.max(1350, Math.min(WORLD_H - 160, wp.y)); u.targetX = null; u.targetY = null; u._directMoveTimer = 0; u._forcedGatherType = null; u._consequenceTag = '⚡ Sovereign Blink Teleport!'; u._consequenceTimer = 2.2; } else if (node && forceCommand) { u._targetNodeRef = node; u._forcedGatherType = node.type; u._directMoveTimer = 0; u._consequenceTag = `🪓 Commanded: Cut ${node.type.toUpperCase()} → Store!`; u._consequenceTimer = 3.5; } else if (forceCommand || u.isT101s) { u._forcedGatherType = null; u._cmdTargetX = wp.x; u._cmdTargetY = wp.y; u._directMoveTimer = 14.0; u.targetX = wp.x; u.targetY = wp.y; u._consequenceTag = '👑 Commanded Move'; u._consequenceTimer = 2.5; } } } return origHandleTap.call(this, sx, sy, forceCommand); }; } const origUpdateInsp = proto.updateInspector; if (typeof origUpdateInsp === 'function') { proto.updateInspector = function () { const res = origUpdateInsp.call(this), u = this.getSelectedUnit(); if (u && typeof document !== 'undefined') { const nameEl = document.getElementById('selName'), roleEl = document.getElementById('selRole'), walletEl = document.getElementById('selWalletText'); const ageVal = Math.floor(u.age ?? 20), stage = ageVal < 4 ? 'Infant' : ageVal < 11 ? 'Child' : ageVal < 18 ? 'Youth' : 'Adult'; const tribe = u.tribeName || (this.enemies && this.enemies.includes(u) ? 'Rival Clan' : 'Aethelgard'); const displayTitle = u.greatTitle || u.name || 'Citizen'; if (nameEl) nameEl.textContent = `${displayTitle} (${ageVal}y ${stage} • ${u.gender === 'female' ? '♀' : '♂'} • ${tribe})`; if (walletEl) { walletEl.textContent = `👛 ${Math.round(u.walletGold || 0)}🪙 • 📘K:${Math.round(u.knowledge || 30)} 🧠U:${Math.round(u.understanding || 30)} 🦉W:${Math.round(u.wisdom || 30)} • 🏆Renown:${Math.round(u.renown || 10)} • 🎯H:${Math.round(u.headHp ?? 100)}% 💪A:${Math.round(u.armHp ?? 100)}% 🦵L:${Math.round(u.legHp ?? 100)}% 🛡️:${Math.round(u.shieldHp ?? 100)}%`; if (u.bender) walletEl.textContent += ` • ✨Chi:${Math.round(u.chi ?? 8)}/${u.maxChi || 8} 🫁O₂:${Math.round(u.o2Breath ?? 100)}% ⚡ATP:${Math.round(u.energy ?? 80)}%`; if (u.weaponType === 'bow' || u.isArcher || (u.weaponLabel && u.weaponLabel.toLowerCase().includes('bow'))) walletEl.textContent += ` • 🏹:${Math.round(u.ammo ?? 12)}/${u.maxAmmo || 12}`; walletEl.textContent += ` • 🗡️"${u.heirloomName || 'Oathkeeper'}" (${Math.round(u.weaponDurability ?? 100)}%)`; } if (roleEl) { const lv = u.level || 1; const rk = u.rankTitle || 'Novice'; const xp = Math.floor(u.xp || 0); const pathStr = u.chosenLifePath || 'Path of Mastery'; const masteryStr = ((u.understanding || 0) >= 35 || u.isT101s || lv >= 2) ? '🐉 1-vs-10 Mastery' : '⚔️ Training'; const pregStr = (u.gender === 'female' && u.isPregnant) ? ` • 🤰 Pregnant Woman (${Math.round((u.pregnancyProgress || 0) * 100)}%)` : ''; roleEl.textContent = `⭐ Lv.${lv} ${rk} (${xp}/${lv * 100} XP) • ${pathStr} • ${masteryStr}${pregStr} • 🥋H:${u.wlHealth || 0} A:${u.wlAttack || 0} D:${u.wlDefense || 0} E:${u.wlEvade || 0} | ${u._roleBadge || u._motiveBadge || 'Ready'}`; roleEl.textContent += ` • 😊${Math.round(u.syxHappiness ?? 78)}% ⚖️${Math.round(u.syxLoyalty ?? 80)}% 🚩Morale:${Math.round(u.divisionMorale ?? 92)}% • ${u.lineageText || 'Lineage: House of Vael'}`; } } return res; }; }

  const origUpdate = proto.update;
  if (typeof origUpdate === 'function') {
    for (const fnName of ['constructBuilding', 'buildFromBlueprint']) { const origFn = proto[fnName]; if (typeof origFn === 'function') { proto[fnName] = function (...args) { this._playerManualBuildWindow = 0.5; return origFn.apply(this, args); }; } } proto.update = function (dt) { if ((this._playerManualBuildWindow || 0) > 0) this._playerManualBuildWindow = Math.max(0, this._playerManualBuildWindow - dt);
      const safeDt = Number.isFinite(dt) ? Math.min(0.05, Math.max(0.001, dt)) : 0.016; try { worldOrder.organizeCityLayouts(this); } catch (e) { console.warn('[OneRing] layout error:', e); }
      try { origUpdate.call(this, safeDt); } catch (e) { console.warn('[OneRing] core update error:', e); }
      try { worldOrder.stepWorldOrderAndLifecycle(this, safeDt); } catch (e) { console.warn('[OneRing] lifecycle error:', e); }
      try { footpaths.updateTraffic(this.villagers, safeDt); } catch (e) { console.warn('[OneRing] footpaths error:', e); }
      try { physicsEngine.stepWorldPhysics(this, safeDt, footpaths); } catch (e) { console.warn('[OneRing] physics error:', e); }
                                                                                                                                          try { worldOrder.enforceSolidBuildingCollisions(this, safeDt); } catch (e) { console.warn('[OneRing] bldg collision error:', e); }                                                                                                                                                
    };
  }
const origSpectateAICapital = proto.spectateAICapital;
if (typeof origSpectateAICapital === 'function') {
  proto.spectateAICapital = function (aiId) {
    this.duelCamActive = false;
    if (this.cam) {
      this.cam.followSelected = false;
    }
    const result = origSpectateAICapital.call(this, aiId); if (typeof document !== 'undefined') { const dipPanel = document.getElementById('diplomacyPanel'); if (dipPanel) dipPanel.classList.add('hidden'); document.querySelectorAll('.fixed.inset-0').forEach((overlay) => { if (overlay && overlay.tagName !== 'CANVAS' && !overlay.classList.contains('hidden')) overlay.classList.add('hidden'); }); }
    const ai = Array.isArray(this.aiPlayers) ? this.aiPlayers.find((a) => a && a.id === aiId) : null;
    if (ai && this.cam) {
      this.cam.targetX = ai.x;
      this.cam.targetY = ai.y || 2320;
      if ((this.cam.targetZoom || 1) < 0.85) {
        this.cam.targetZoom = 1.15;
      }
    }
    if (typeof this.updateZoomHUD === 'function') {
      this.updateZoomHUD();
    }
    return result;
  };
}
  
const origFocusWorldBoss = proto.focusWorldBoss;
  if (typeof origFocusWorldBoss === 'function') {
    proto.focusWorldBoss = function () {
if (Array.isArray(this.worldBosses)) {
for (const b of this.worldBosses) {
if (b && b.y > 3100) {
b.y = 2280 + ((b.id || 0) % 3) * 140;
}
}
}
this.duelCamActive = false;
if (this.cam) {
this.cam.followSelected = false;
if (this.cam.targetZoom < 0.75) {
this.cam.targetZoom = 1.15;
}
}
const result = origFocusWorldBoss.call(this);
if (typeof this.updateZoomHUD === 'function') {
  this.updateZoomHUD();
} else if (typeof document !== 'undefined') {
  const followEl = document.getElementById('followCamBtnText');
  if (followEl) followEl.textContent = `Follow: ${this.cam && this.cam.followSelected ? 'ON' : 'OFF'}`;
  const zoomEl = document.getElementById('zoomPresetBtnText');
  if (zoomEl && this.cam) {
    const pct = Math.round(this.cam.targetZoom * 100);
    const tag = pct <= 50 ? 'Map' : pct >= 210 ? 'Micro' : pct >= 145 ? 'Duel' : 'RTS';
    zoomEl.textContent = `${pct}% ${tag}`;
  }
  const slider = document.getElementById('zoomRangeSlider');
  if (slider && this.cam && !this.globeMode) {
    slider.value = Math.round(this.cam.targetZoom * 100);
  }
}
return result;
};
  }

  const origResolvePhysics = proto.resolveUnitPhysics;
  if (typeof origResolvePhysics === 'function') {
    proto.resolveUnitPhysics = function (u, dt, isEnemy) {
      origResolvePhysics.call(this, u, dt, isEnemy);
      physicsEngine.resolveMassCollisions(this, u, dt);
    };
  }

  const origApplyKnockback = proto.applyKnockback;
  if (typeof origApplyKnockback === 'function') {
    proto.applyKnockback = function (target, fromX, fromY, force = 160) { worldOrder.dropCarriedCargoOnImpact(target, force);
      const reflex = physicsEngine.triggerCombatReflexOnImpact(this, target, fromX, fromY, force);
      if (reflex === 'dodged') return;

      const mass = physicsEngine.getUnitMass(target);
      const blockMult = reflex === 'blocked' ? 0.28 : 1.0;
      const scaledForce = (force * blockMult) / Math.pow(mass, 0.65);
      origApplyKnockback.call(this, target, fromX, fromY, scaledForce);

      if (target && !target.invincible && reflex !== 'blocked') {
        const lift = Math.min(280, Math.max(65, scaledForce * 0.72));
        target.vz = Math.max(target.vz || 0, lift);
        if (force >= 120) { worldOrder.resolveAnatomicalHitZone(this, null, target, Math.round(force * 0.14)); } if (force >= 220) {
          physicsEngine.addCameraShake(Math.min(10, force / 45));
        }
      }
    };
  }

  const origRenderTerrain = proto.renderContinentsAndRiver;
  if (typeof origRenderTerrain === 'function') {
    proto.renderContinentsAndRiver = function (ctx, invTilt) {
      if (physicsEngine.camShakeIntensity > 0.1) {
        ctx.translate(physicsEngine.camShakeX, physicsEngine.camShakeY);
      }

      const savedGalleys = this.warGalleys;
      const savedBridges = this.stoneBridges;
      const origFillRect = ctx.fillRect;

      this.warGalleys = [];
      this.stoneBridges = [];
      ctx.fillRect = function (x, y, w, h) {
        if ((w === 241 && h === 241) || (w === 521 && h === 521) || (w === 1201 && h === 1201)) {
          return;
        }
        return origFillRect.call(this, x, y, w, h);
      };

      try {
        origRenderTerrain.call(this, ctx, invTilt);
      } finally {
        ctx.fillRect = origFillRect;
        this.warGalleys = savedGalleys;
        this.stoneBridges = savedBridges;
      }

      const timeSec = this.time || 0;

      biomeRenderer.drawEarthBiomesInViewport(
        ctx,
        this.cam,
        this.canvas.width,
        this.canvas.height,
        invTilt,
        timeSec
      );

      try { footpaths.drawVisiblePaths(ctx, this.cam, this.canvas.width, this.canvas.height); } catch (e) {}
      worldOrder.drawCityBoulevardsAndPlazas(ctx, this, invTilt);

      const viewHalfW = (this.canvas.width * 0.65) / this.cam.zoom;
      const rY = RIVER_Y - this.cam.y;

      if (Array.isArray(this.warGalleys)) {
        for (const g of this.warGalleys) {
          const gx = wrapDX(this.cam.x, g.x);
          if (Math.abs(gx) <= viewHalfW + 120) {
            const gy = g.y - this.cam.y;
            const nearBridge =
              Array.isArray(this.stoneBridges) &&
              this.stoneBridges.some((br) => Math.abs(wrapDX(g.x, br.x)) < 58);

            envBank.drawIsometricWarGalley(
              ctx,
              g,
              gx,
              gy,
              invTilt,
              timeSec,
              this.showFloatingBadges !== false && !nearBridge
            );
          }
        }
      }

      if (Array.isArray(this.stoneBridges)) {
        for (const br of this.stoneBridges) {
          const bx = wrapDX(this.cam.x, br.x);
          if (Math.abs(bx) <= viewHalfW + 120) {
            envBank.drawIsometricBridge(ctx, bx, rY, invTilt, timeSec);
          }
        }
      }
    };
  }

  const origRenderGlobe = proto.render3DPlanetaryGlobe;
  if (typeof origRenderGlobe === 'function') {
    proto.render3DPlanetaryGlobe = function (ctx) {
      origRenderGlobe.call(this, ctx);
      biomeRenderer.drawGlobeEarthBreakdownHUD(ctx, this.canvas.width, this.canvas.height);
    };
  }

  const origDrawHuman = proto.drawArticulatedHuman;
  proto.drawArticulatedHuman = function (ctx, unit, dx, sy, invTilt, isEnemy) {
    if (this.cam && this.cam.zoom < 0.45 && !unit.isBoss && !unit.isT101s) {
      if (typeof origDrawHuman === 'function') {
        origDrawHuman.call(this, ctx, unit, dx, sy, invTilt, isEnemy);
      }
      return;
    }

    if (this.selectedIds && this.selectedIds.includes(unit.id)) {
      ctx.save();
      ctx.translate(dx, sy);
      ctx.scale(1, invTilt);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 3, 15, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    villagerBank.drawGameUnit(
      ctx,
      unit,
      dx,
      sy,
      invTilt,
      isEnemy,
      this.time || 0,
      this.showFloatingBadges !== false
    );
    worldOrder.drawUnitOverlay(ctx, unit, dx, sy, invTilt, this.time || 0); if (this.showFloatingBadges !== false && (((unit._consequenceTimer || 0) > 0 && unit._consequenceTag) || (isEnemy ? unit._motiveBadge : unit._roleBadge))) {
ctx.save();
ctx.translate(dx, sy);
ctx.scale(1, invTilt);
ctx.font = 'bold 9.5px Inter, sans-serif';
ctx.textAlign = 'center';
const label = ((unit._consequenceTimer || 0) > 0 && unit._consequenceTag) ? unit._consequenceTag : (isEnemy ? unit._motiveBadge : unit._roleBadge);
ctx.fillStyle = (unit._consequenceTimer || 0) > 0 ? (label.includes('Remorse') ? '#fda4af' : '#93c5fd') : '#fde047';
const isPriority = !!(unit.isBoss || unit.isT101s || (this.selectedIds && this.selectedIds.includes(unit.id)) || (unit._consequenceTimer || 0) > 0); const smartY = worldOrder.resolveSmartLabelY(dx, sy - 52, Math.max(70, (label || '').length * 5.5), isPriority); if (smartY !== null) ctx.fillText(label, 0, smartY - sy);
ctx.restore();
    }

    if (unit.customTool || unit.customMagic) {
      ctx.save();
      ctx.translate(dx, sy);
      ctx.scale(1, invTilt);
      if (unit.customTool) {
        ctx.fillStyle = unit.customTool.color || '#fbbf24';
        ctx.beginPath();
        ctx.arc((unit.facing || 1) * 10, -14, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (unit.customMagic) {
        ctx.strokeStyle = unit.customMagic.color || '#c084fc';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, -16, 17 + Math.sin((this.time || 0) * 4 + (unit.id || 0)) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  };

  const origRenderCombatVFX = proto.renderCombatAndArrowVFX;
  if (typeof origRenderCombatVFX === 'function') {
    proto.renderCombatAndArrowVFX = function (ctx, invTilt) {
      physicsEngine.drawPhysicsVFX(ctx, this, invTilt);
      origRenderCombatVFX.call(this, ctx, invTilt);
      combatVFX.drawEnhancedCombatVFX(ctx, this, invTilt);
    };
  }

  proto.drawBuilding = function (ctx, building, dx, sy, invTilt) {
    if (!building._footprintStamped) {
      building._footprintStamped = true;
      footpaths.stampBuilding(building.x, building.y, building.radius || 44);
    }
    if (building.auraColor) {
      ctx.save();
      ctx.translate(dx, sy);
      ctx.scale(1, invTilt);
      ctx.globalAlpha = 0.28 + 0.1 * Math.sin((this.time || 0) * 3 + (building.id || 0));
      ctx.strokeStyle = building.auraColor;
      ctx.lineWidth = 2.5;
      const r = building.radius || 28;
      ctx.beginPath();
      ctx.ellipse(0, 4, r * 1.35, r * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const shakeAmp = Math.min(1, (building._hitShake || 0) * 2.2);
    const shakeX = shakeAmp > 0.01 ? Math.sin((this.time || 0) * 60) * 4.0 * shakeAmp : 0;
    const shakeY = shakeAmp > 0.01 ? Math.cos((this.time || 0) * 50) * 1.8 * shakeAmp : 0;
    const leanAngle = building._leanAngle || 0; if (leanAngle) { ctx.save(); ctx.translate(dx + shakeX, sy); ctx.rotate(leanAngle); ctx.translate(-(dx + shakeX), -sy); }  const timeSec = this.time || 0; const prog = typeof building.constructionProgress === 'number' ? building.constructionProgress : 1.0; if (worldOrder.syxCutawayRooms && prog >= 0.995) { worldOrder.drawSongsOfSyxCutawayInterior(ctx, building, dx + shakeX, sy + shakeY, invTilt, timeSec); } else envBank.drawGameBuilding(
      ctx,
      building,
      dx + shakeX,
      sy,
      invTilt,
      this.time || 0,
      Boolean(this.showFloatingBadges)
    );
  if (leanAngle) ctx.restore(); worldOrder.drawConstructionScaffolding(ctx, building, dx + shakeX, sy, invTilt, this.time || 0); if ((building.hp ?? 500) <= 0 && !building._collapsed) { worldOrder.triggerStructureCollapse(this, building, 'Siege'); return; } const maxHp = building.maxHp || 600, hp = Math.max(0, Math.min(maxHp, building.hp ?? maxHp)), hpRatio = hp / maxHp; ctx.save(); ctx.translate(dx + shakeX, sy); ctx.scale(1, invTilt); if (hpRatio < 0.85) { ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(-3, -18); ctx.lineTo(-9, -11); ctx.lineTo(-2, -4); ctx.stroke(); } if (hpRatio < 0.75 || (building._scorchTimer || 0) > 0) { for (let f = 0; f < (hpRatio < 0.4 ? 3 : 2); f++) { const fx = (f - 0.5) * 14, fy = -18 - (f % 2) * 8, smokeH = ((this.time || 0) * 22 + f * 11) % 24; ctx.fillStyle = 'rgba(68, 64, 60, 0.48)'; ctx.beginPath(); ctx.arc(fx, fy - 10 - smokeH, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(239, 68, 68, 0.88)'; ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(fx, fy + 1, 3, 0, Math.PI * 2); ctx.fill(); } } const barW = 62, barY = (building.constructionProgress ?? 1) < 0.995 ? -68 : -54; ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'; ctx.strokeStyle = hpRatio < 0.35 ? '#ef4444' : '#64748b'; ctx.lineWidth = 1.2; ctx.fillRect(-barW * 0.5, barY, barW, 6.5); ctx.strokeRect(-barW * 0.5, barY, barW, 6.5); ctx.fillStyle = hpRatio > 0.65 ? '#22c55e' : hpRatio > 0.35 ? '#f59e0b' : '#ef4444'; ctx.fillRect(-barW * 0.5 + 1, barY + 1, Math.round((barW - 2) * hpRatio), 4.5); ctx.font = 'bold 8.5px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = hpRatio < 0.5 ? '#fca5a5' : '#f8fafc'; ctx.fillText(`${building.name || 'Structure'} • ❤️ ${Math.ceil(hp)}/${maxHp} HP${building._leanAngle ? ` • 🧱 ∠${Math.round(Math.abs(building._leanAngle) * (180 / Math.PI))}° Lean` : ''}`, 0, barY - 3); ctx.restore(); };

  proto.drawResourceNode = function (ctx, node, dx, sy, invTilt) {
    const isTree = node && (node.type === 'wood' || node.type === 'tree' || node.kind === 'tree'); if (isTree && ctx) { const sway = Math.sin((this.time || 0) * 2.4 + (node.x || 0) * 0.04) * Math.min(0.14, 0.03 + ((worldOrder && worldOrder.windSpeed) || 12) * 0.0025); ctx.save(); ctx.translate(dx, sy); ctx.rotate(sway); ctx.translate(-dx, -sy); envBank.drawGameResourceNode(ctx, node, dx, sy, invTilt, this.time || 0); ctx.restore(); } else { envBank.drawGameResourceNode(ctx, node, dx, sy, invTilt, this.time || 0); }
  };

  proto.drawSiegeEngine = function (ctx, s, sx, sy, invTilt) {
    envBank.drawGameSiegeEngine(
      ctx,
      s,
      sx,
      sy,
      invTilt,
      this.time || 0,
      this.showFloatingBadges !== false
    );
  };
}
