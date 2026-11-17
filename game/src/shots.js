// The screenshot scenes behind ?shot=start|play|boss|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (chase the nearest enemy, keep a little distance, sidestep incoming
// bullets), so the frame is what a short game really looks like and the same seed
// always gives the same frame. The end scene's pilot never dodges, so it is caught
// out as a hurried player is.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 36;
const PLAY_BUSY_SECONDS = 12;
const PLAY_BUSY_MIN = 7;
const BOSS_SECONDS = 12;
const END_LIMIT_SECONDS = 240;

/** The nearest live enemy to the player, or null. */
function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active || e.warp > 0.3) continue;
    const dx = e.x - state.player.x;
    const dy = e.y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Build one step of autopilot input. `reckless` chases blindly and never dodges. */
function autopilot(state, reckless) {
  const p = state.player;
  const target = nearestEnemy(state);
  let mx = 0;
  let my = 0;
  let aimX = p.x;
  let aimY = p.y - 200;
  if (target) {
    // Aim ahead of the target by its travel over the bullet's flight time.
    const dist = Math.hypot(target.x - p.x, target.y - p.y) || 1;
    const flight = dist / 760;
    aimX = target.x + target.vx * flight;
    aimY = target.y + target.vy * flight;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (reckless) {
      mx = dx / dist;
      my = dy / dist;
    } else {
      // Hold about 210px off: close in when far, back off when too close.
      const want = dist > 260 ? 1 : dist < 160 ? -1 : 0;
      mx = (dx / dist) * want;
      my = (dy / dist) * want;
      // Sidestep any enemy bullet that is close and closing in.
      for (const b of state.ebullets) {
        if (!b.active) continue;
        const bx = b.x - p.x;
        const by = b.y - p.y;
        const bd = Math.hypot(bx, by);
        if (bd > 130) continue;
        const closing = (b.vx * bx + b.vy * by) / (bd || 1);
        if (closing < 40) continue;
        // Push perpendicular to the bullet's travel.
        const bl = Math.hypot(b.vx, b.vy) || 1;
        const px = -b.vy / bl;
        const py = b.vx / bl;
        const side = px * dx + py * dy >= 0 ? 1 : -1;
        mx += px * side * 1.4;
        my += py * side * 1.4;
      }
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      // A weak pull toward the centre keeps the fight in the middle of the
      // frame instead of pinned to an edge.
      mx += ((FIELD.width / 2 - p.x) / FIELD.width) * 0.5;
      my += ((FIELD.height / 2 - p.y) / FIELD.height) * 0.5;
      const len2 = Math.hypot(mx, my);
      if (len2 > 1) {
        mx /= len2;
        my /= len2;
      }
    }
  } else {
    // Nothing to shoot: drift back toward the centre.
    const dx = FIELD.width / 2 - p.x;
    const dy = FIELD.height / 2 - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 60) {
      mx = dx / d;
      my = dy / d;
    }
  }
  return { mx, my, aimX, aimY, firing: target !== null, nova: false };
}

/**
 * Set `world` to the named scene (start, play, boss or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play' || name === 'end') {
    world.reset();
    const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
    const reckless = name === 'end';
    for (let i = 0; i < limit / STEP; i += 1) {
      const input = autopilot(world.state, reckless);
      if (world.step(STEP, input, false) & EVENT_OVER) break;
    }
    // Play scene only: keep going (up to a few more seconds) until the frame is
    // busy — at least PLAY_BUSY_MIN live raiders — so the screenshot shows a real fight.
    if (name === 'play' && !world.state.over) {
      for (let i = 0; i < PLAY_BUSY_SECONDS / STEP; i += 1) {
        let live = 0;
        for (const e of world.state.enemies) if (e.active) live += 1;
        if (live >= PLAY_BUSY_MIN) break;
        const input = autopilot(world.state, false);
        if (world.step(STEP, input, false) & EVENT_OVER) break;
      }
      // A final burst warping in around the player, so the frame catches the
      // wave at its busiest: raiders mid-warp, bullets already in flight.
      const p = world.state.player;
      const burstKinds = ['mite', 'mite', 'weaver'];
      for (let i = 0; i < burstKinds.length; i += 1) {
        const a = (i / burstKinds.length) * Math.PI * 2 + 0.6;
        world.spawn(burstKinds[i], {
          x: Math.min(FIELD.width - 40, Math.max(40, p.x + Math.cos(a) * 380)),
          y: Math.min(FIELD.height - 40, Math.max(40, p.y + Math.sin(a) * 380)),
        });
      }
      for (let i = 0; i < 0.25 / STEP; i += 1) {
        const input = autopilot(world.state, false);
        if (world.step(STEP, input, false) & EVENT_OVER) break;
      }
    }
    const over = world.state.over;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'boss') {
    world.stageBoss();
    for (let i = 0; i < BOSS_SECONDS / STEP; i += 1) {
      const input = autopilot(world.state, false);
      if (world.step(STEP, input, false) & EVENT_OVER) break;
    }
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  world.reset();
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    world.step(STEP, { mx: 0, my: 0, aimX: FIELD.width / 2, aimY: 200, firing: false, nova: false }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
