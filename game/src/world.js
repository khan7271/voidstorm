// VOIDSTORM's rules and state, with no drawing and no browser in it: the player's
// ship, the bullet pools, the enemies and their behaviours, waves and the boss,
// pickups, the combo, particles and floating score text. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sounds,
// announcements) without the world knowing about screens or audio. Nothing here
// allocates after createWorld returns.
import {
  BULLET, COMBO, EBULLET, ENEMY, FIELD, PICKUP, PICKUP_MAGNET, PICKUP_RADIUS,
  PLAYER, POOL, POWER_DURATION, WAVE,
} from './config.js';
import { pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_PICKUP = 4;
export const EVENT_OVER = 8;
export const EVENT_WAVE = 16;
export const EVENT_BOSS = 32;
export const EVENT_NOVA = 64;
export const EVENT_SHOT = 128;
export const EVENT_ENEMY_SHOT = 256;
export const EVENT_SHIELD = 512;

const KIND_MITE = 'mite';
const KIND_WEAVER = 'weaver';
const KIND_SPLITTER = 'splitter';
const KIND_BULWARK = 'bulwark';
const KIND_BOSS = 'boss';

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2 + 60, vx: 0, vy: 0, angle: -Math.PI / 2,
    hull: PLAYER.hull, shield: PLAYER.shieldMax, shieldTimer: 0, invuln: 0,
    spreadTimer: 0, rapidTimer: 0, novas: 1, fireTimer: 0, alive: true, thrust: 0,
  };
  const bullets = [];
  const ebullets = [];
  const enemies = [];
  const particles = [];
  const pickups = [];
  const floats = [];
  for (let i = 0; i < POOL.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  for (let i = 0; i < POOL.ebullets; i += 1) ebullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: KIND_MITE, x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, radius: 13, score: 10, t: 0, fireTimer: 0, angle: 0, attack: 0, warp: 0 });
  }
  for (let i = 0; i < POOL.particles; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 1 });
  }
  for (let i = 0; i < POOL.pickups; i += 1) {
    pickups.push({ active: false, kind: 'shield', x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  }
  for (let i = 0; i < POOL.floats; i += 1) {
    floats.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff' });
  }

  const state = {
    player, bullets, ebullets, enemies, particles, pickups, floats,
    score: 0, combo: 0, comboTimer: 0, kills: 0, wave: 1, waveState: 'intro',
    waveTimer: 1.4, spawnQueue: [], spawnIndex: 0, spawnTimer: 0,
    boss: null, time: 0, shake: 0, flash: 0, banner: '', bannerTimer: 0,
    ambientTimer: 0, over: false,
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, n, speed, size) {
    for (let i = 0; i < n; i += 1) {
      const p = free(particles);
      if (!p) return;
      const a = random() * Math.PI * 2;
      const s = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = 0.4 + random() * 0.5;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      p.drag = 2.2;
    }
  }

  function addFloat(x, y, text, color) {
    const f = free(floats);
    if (!f) return;
    f.active = true;
    // Keep popups inside the frame and clear of the top HUD strip.
    f.x = Math.min(FIELD.width - 80, Math.max(80, x));
    f.y = Math.min(FIELD.height - 40, Math.max(120, y));
    f.life = 1.1;
    f.text = text;
    f.color = color;
  }

  function edgePoint() {
    // A point just outside a random edge, at least 260px from the player.
    for (let tries = 0; tries < 12; tries += 1) {
      const side = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (side === 0) { x = random() * FIELD.width; y = -30; }
      else if (side === 1) { x = FIELD.width + 30; y = random() * FIELD.height; }
      else if (side === 2) { x = random() * FIELD.width; y = FIELD.height + 30; }
      else { x = -30; y = random() * FIELD.height; }
      if (dist2(x, y, player.x, player.y) > 260 * 260) return { x, y };
    }
    return { x: FIELD.width / 2, y: -30 };
  }

  function spawnEnemy(kind, at) {
    const e = free(enemies);
    if (!e) return null;
    const cfg = ENEMY[kind];
    const pos = at || edgePoint();
    e.active = true;
    e.kind = kind;
    e.x = pos.x;
    e.y = pos.y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = cfg.hp + Math.floor((state.wave - 1) / 4);
    e.hp = e.maxHp;
    e.radius = cfg.radius;
    e.score = cfg.score;
    e.t = 0;
    e.fireTimer = range(random, 1.2, 2.4);
    e.angle = Math.PI / 2;
    e.attack = 0;
    e.warp = 0.5;
    if (kind === KIND_BOSS) {
      e.x = FIELD.width / 2;
      e.y = -90;
      state.boss = e;
    }
    return e;
  }

  function buildWave() {
    const queue = [];
    const budget = WAVE.baseBudget + state.wave * WAVE.budgetPerWave;
    let left = budget;
    const allowed = [KIND_MITE];
    if (state.wave >= 2) allowed.push(KIND_WEAVER);
    if (state.wave >= 3) allowed.push(KIND_SPLITTER);
    if (state.wave >= 4) allowed.push(KIND_BULWARK);
    while (left > 0) {
      const kind = pick(random, allowed);
      const cost = ENEMY[kind].cost;
      if (cost > left && kind !== KIND_MITE) {
        queue.push(KIND_MITE);
        left -= 1;
        continue;
      }
      queue.push(kind);
      left -= cost;
    }
    if (state.wave % WAVE.bossEvery === 0) queue.unshift(KIND_BOSS);
    state.spawnQueue = queue;
    state.spawnIndex = 0;
    state.spawnTimer = 0.4;
  }

  function dropPickup(x, y) {
    if (random() > 0.13) return;
    const p = free(pickups);
    if (!p) return;
    const roll = random();
    let kind = 'shield';
    if (roll < 0.3) kind = 'shield';
    else if (roll < 0.55) kind = 'spread';
    else if (roll < 0.8) kind = 'rapid';
    else if (roll < 0.88) kind = player.hull < PLAYER.hull ? 'repair' : 'shield';
    else kind = player.novas < PLAYER.novaMax ? 'nova' : 'shield';
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = range(random, -30, 30);
    p.vy = 40;
    p.life = 12;
  }

  function killEnemy(e, award) {
    e.active = false;
    if (e.kind === KIND_BOSS) state.boss = null;
    const cfg = ENEMY[e.kind];
    burst(e.x, e.y, cfg.color, e.kind === KIND_BOSS ? 60 : 16, e.kind === KIND_BOSS ? 420 : 260, e.kind === KIND_BOSS ? 4 : 3);
    burst(e.x, e.y, '#ffffff', 6, 180, 2);
    if (e.kind === KIND_SPLITTER) {
      for (let i = 0; i < 3; i += 1) {
        const m = spawnEnemy(KIND_MITE, { x: e.x, y: e.y });
        if (m) {
          const a = (i / 3) * Math.PI * 2 + random();
          m.vx = Math.cos(a) * 160;
          m.vy = Math.sin(a) * 160;
          m.warp = 0;
        }
      }
    }
    if (award) {
      state.kills += 1;
      state.combo = state.comboTimer > 0 ? Math.min(COMBO.max, state.combo + 1) : 1;
      state.comboTimer = COMBO.window;
      const points = e.score * state.combo;
      state.score += points;
      // One popup per kill: points, with the combo folded in when it is hot.
      const text = state.combo >= 3 ? `+${points}  x${state.combo}` : `+${points}`;
      addFloat(e.x, e.y - e.radius, text, state.combo >= 3 ? PICKUP.spread.color : '#eef4ff');
      dropPickup(e.x, e.y);
    }
    state.shake = Math.min(14, state.shake + (e.kind === KIND_BOSS ? 14 : 3));
  }

  function damagePlayer(fromX, fromY) {
    if (player.invuln > 0 || !player.alive) return 0;
    let events = 0;
    if (player.shield > 0) {
      player.shield -= 1;
      player.shieldTimer = PLAYER.shieldRegenDelay;
      burst(player.x, player.y, PALETTE_SHIELD, 10, 200, 3);
      state.shake = Math.min(14, state.shake + 4);
      events |= EVENT_SHIELD;
    } else {
      player.hull -= 1;
      player.invuln = PLAYER.invulnerable;
      state.shake = 14;
      state.flash = 0.55;
      burst(player.x, player.y, '#ff5340', 22, 320, 3);
      events |= EVENT_HIT;
      if (player.hull <= 0) {
        player.alive = false;
        state.over = true;
        burst(player.x, player.y, '#35f0ff', 50, 420, 4);
        burst(player.x, player.y, '#ffffff', 20, 260, 3);
        events |= EVENT_OVER;
      }
    }
    return events;
  }

  const PALETTE_SHIELD = '#35f0ff';

  function fireEnemyBullet(x, y, angle, speed) {
    const b = free(ebullets);
    if (!b) return;
    b.active = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.life = EBULLET.life;
  }

  function updateEnemy(e, dt, harmless) {
    e.t += dt;
    if (e.warp > 0) {
      e.warp -= dt;
      return;
    }
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const cfg = ENEMY[e.kind];
    if (harmless) {
      e.y += 60 * dt;
      e.x += Math.sin(e.t * 1.4) * 24 * dt;
      e.angle = Math.PI / 2;
      return;
    }
    if (e.kind === KIND_MITE) {
      const wobble = Math.sin(e.t * 5) * 60;
      e.vx += ((dx / d) * cfg.speed + (-dy / d) * wobble - e.vx) * Math.min(1, 3 * dt);
      e.vy += ((dy / d) * cfg.speed + (dx / d) * wobble - e.vy) * Math.min(1, 3 * dt);
      e.angle = Math.atan2(e.vy, e.vx);
    } else if (e.kind === KIND_WEAVER) {
      const strafe = Math.sin(e.t * 2.2);
      e.vx += ((dx / d) * cfg.speed * 0.7 + (-dy / d) * strafe * 170 - e.vx) * Math.min(1, 2.5 * dt);
      e.vy += ((dy / d) * cfg.speed * 0.7 + (dx / d) * strafe * 170 - e.vy) * Math.min(1, 2.5 * dt);
      e.angle = Math.atan2(dy, dx);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < 560) {
        e.fireTimer = 2.4;
        fireEnemyBullet(e.x, e.y, Math.atan2(dy, dx), EBULLET.speed);
        return EVENT_ENEMY_SHOT;
      }
    } else if (e.kind === KIND_SPLITTER) {
      e.vx += ((dx / d) * cfg.speed - e.vx) * Math.min(1, 2 * dt);
      e.vy += ((dy / d) * cfg.speed - e.vy) * Math.min(1, 2 * dt);
      e.angle += dt * 1.5;
    } else if (e.kind === KIND_BULWARK) {
      e.vx += ((dx / d) * cfg.speed - e.vx) * Math.min(1, 1.5 * dt);
      e.vy += ((dy / d) * cfg.speed - e.vy) * Math.min(1, 1.5 * dt);
      e.angle = Math.atan2(dy, dx);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < 640) {
        e.fireTimer = 3.2;
        const base = Math.atan2(dy, dx);
        fireEnemyBullet(e.x, e.y, base - 0.22, EBULLET.speed * 0.9);
        fireEnemyBullet(e.x, e.y, base, EBULLET.speed * 0.9);
        fireEnemyBullet(e.x, e.y, base + 0.22, EBULLET.speed * 0.9);
        return EVENT_ENEMY_SHOT;
      }
    } else if (e.kind === KIND_BOSS) {
      // Drift to a hover point near the top, strafe, and cycle three attacks.
      const hoverY = 150 + Math.sin(e.t * 0.7) * 40;
      const hoverX = FIELD.width / 2 + Math.sin(e.t * 0.45) * 320;
      e.vx += ((hoverX - e.x) * 0.8 - e.vx) * Math.min(1, 1.2 * dt);
      e.vy += ((hoverY - e.y) * 0.8 - e.vy) * Math.min(1, 1.2 * dt);
      e.angle = Math.PI / 2 + Math.sin(e.t * 0.45) * 0.2;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = 2.6;
        e.attack = (e.attack + 1) % 3;
        if (e.attack === 0) {
          for (let i = 0; i < 14; i += 1) {
            const a = (i / 14) * Math.PI * 2 + e.t;
            fireEnemyBullet(e.x, e.y, a, EBULLET.speed * 0.75);
          }
        } else if (e.attack === 1) {
          const base = Math.atan2(dy, dx);
          for (let k = -2; k <= 2; k += 1) fireEnemyBullet(e.x, e.y, base + k * 0.16, EBULLET.speed);
        } else {
          for (let i = 0; i < 3; i += 1) spawnEnemy(KIND_MITE, { x: e.x + (i - 1) * 70, y: e.y + 50 });
        }
        return EVENT_ENEMY_SHOT;
      }
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    return 0;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2 + 60;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.hull = PLAYER.hull;
    player.shield = PLAYER.shieldMax;
    player.shieldTimer = 0;
    player.invuln = 0;
    player.spreadTimer = 0;
    player.rapidTimer = 0;
    player.novas = 1;
    player.fireTimer = 0;
    player.alive = true;
    player.thrust = 0;
    for (const b of bullets) b.active = false;
    for (const b of ebullets) b.active = false;
    for (const e of enemies) e.active = false;
    for (const p of particles) p.active = false;
    for (const p of pickups) p.active = false;
    for (const f of floats) f.active = false;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.kills = 0;
    state.wave = 1;
    state.waveState = 'intro';
    state.waveTimer = 1.4;
    state.spawnQueue = [];
    state.spawnIndex = 0;
    state.spawnTimer = 0;
    state.boss = null;
    state.time = 0;
    state.shake = 0;
    state.flash = 0;
    state.banner = 'WAVE 1';
    state.bannerTimer = 1.4;
    state.ambientTimer = 0;
    state.over = false;
  }

  /** Jump straight into a boss fight (wave 5): used by the boss screenshot. */
  function stageBoss() {
    reset();
    state.wave = 5;
    state.waveState = 'fight';
    state.waveTimer = 0;
    state.banner = 'DREADNOUGHT APPROACHES';
    state.bannerTimer = 2.2;
    state.spawnQueue = [KIND_BOSS, KIND_MITE, KIND_MITE, KIND_WEAVER];
    state.spawnIndex = 0;
    state.spawnTimer = 0.1;
    state.score = 1240;
    state.kills = 23;
    player.x = FIELD.width / 2;
    player.y = FIELD.height - 140;
  }

  /**
   * One fixed step. `input` is {mx, my, aimX, aimY, firing, nova}. With `harmless`
   * set (the title screen's backdrop) enemies drift by, nothing shoots, nothing
   * touches the player and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.8);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // --- player ---
    if (player.alive) {
      player.vx += input.mx * PLAYER.accel * dt;
      player.vy += input.my * PLAYER.accel * dt;
      const drag = Math.exp(-PLAYER.drag * dt);
      player.vx *= drag;
      player.vy *= drag;
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > PLAYER.maxSpeed) {
        player.vx = (player.vx / speed) * PLAYER.maxSpeed;
        player.vy = (player.vy / speed) * PLAYER.maxSpeed;
      }
      player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
      player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      player.thrust = Math.min(1, Math.hypot(input.mx, input.my) + 0.25);
      if (player.invuln > 0) player.invuln -= dt;
      if (player.spreadTimer > 0) player.spreadTimer -= dt;
      if (player.rapidTimer > 0) player.rapidTimer -= dt;
      if (player.shieldTimer > 0) {
        player.shieldTimer -= dt;
        if (player.shieldTimer <= 0 && player.shield < PLAYER.shieldMax) {
          player.shield += 1;
          player.shieldTimer = PLAYER.shieldRegenDelay;
        }
      }
      if (player.thrust > 0.3 && random() < 0.6) {
        const p = free(particles);
        if (p) {
          const back = player.angle + Math.PI;
          p.active = true;
          p.x = player.x + Math.cos(back) * 18 + range(random, -3, 3);
          p.y = player.y + Math.sin(back) * 18 + range(random, -3, 3);
          p.vx = Math.cos(back) * 120 + range(random, -20, 20);
          p.vy = Math.sin(back) * 120 + range(random, -20, 20);
          p.maxLife = 0.28;
          p.life = 0.28;
          p.size = 2.5;
          p.color = '#35f0ff';
          p.drag = 1;
        }
      }
      // --- firing ---
      player.fireTimer -= dt;
      if (input.firing && player.fireTimer <= 0 && !harmless) {
        player.fireTimer = player.rapidTimer > 0 ? PLAYER.fireInterval * 0.5 : PLAYER.fireInterval;
        const angles = player.spreadTimer > 0 ? [-0.14, 0, 0.14] : [0];
        for (const off of angles) {
          const b = free(bullets);
          if (!b) break;
          const a = player.angle + off;
          b.active = true;
          b.x = player.x + Math.cos(a) * 22;
          b.y = player.y + Math.sin(a) * 22;
          b.vx = Math.cos(a) * BULLET.speed + player.vx * 0.4;
          b.vy = Math.sin(a) * BULLET.speed + player.vy * 0.4;
          b.life = BULLET.life;
        }
        const m = free(particles);
        if (m) {
          m.active = true;
          m.x = player.x + Math.cos(player.angle) * 26;
          m.y = player.y + Math.sin(player.angle) * 26;
          m.vx = Math.cos(player.angle) * 60;
          m.vy = Math.sin(player.angle) * 60;
          m.maxLife = 0.12;
          m.life = 0.12;
          m.size = 4;
          m.color = '#8ff7ff';
          m.drag = 1;
        }
        events |= EVENT_SHOT;
      }
      // --- nova bomb ---
      if (input.nova && player.novas > 0 && !harmless) {
        player.novas -= 1;
        state.flash = 0.8;
        state.shake = 16;
        for (const b of ebullets) {
          if (b.active) {
            burst(b.x, b.y, '#8ff7ff', 2, 120, 2);
            b.active = false;
          }
        }
        for (const e of enemies) {
          if (!e.active) continue;
          e.hp -= 6;
          if (e.hp <= 0) killEnemy(e, true);
        }
        burst(player.x, player.y, '#ffffff', 40, 500, 3);
        events |= EVENT_NOVA;
      }
    }

    // --- waves ---
    if (!harmless) {
      if (state.waveState === 'intro') {
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) {
          buildWave();
          state.waveState = 'fight';
        }
      } else if (state.waveState === 'fight') {
        if (state.spawnIndex < state.spawnQueue.length) {
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0) {
            const kind = state.spawnQueue[state.spawnIndex];
            state.spawnIndex += 1;
            const spawned = spawnEnemy(kind);
            if (kind === KIND_BOSS && spawned) {
              state.banner = 'DREADNOUGHT APPROACHES';
              state.bannerTimer = 2.2;
              events |= EVENT_BOSS;
            }
            const interval = Math.max(WAVE.minSpawnInterval, WAVE.spawnInterval * WAVE.spawnSpeedup ** (state.wave - 1));
            state.spawnTimer = interval;
          }
        } else {
          let any = false;
          for (const e of enemies) if (e.active) { any = true; break; }
          if (!any) {
            const bonus = 50 * state.wave;
            state.score += bonus;
            state.waveState = 'clear';
            state.waveTimer = WAVE.clearPause;
            state.banner = `WAVE ${state.wave} CLEAR  +${bonus}`;
            state.bannerTimer = WAVE.clearPause;
            events |= EVENT_WAVE;
          }
        }
      } else if (state.waveState === 'clear') {
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) {
          state.wave += 1;
          state.waveState = 'intro';
          state.waveTimer = 1.4;
          state.banner = state.wave % WAVE.bossEvery === 0 ? `WAVE ${state.wave} — BOSS` : `WAVE ${state.wave}`;
          state.bannerTimer = 1.4;
          events |= EVENT_WAVE;
        }
      }
    } else {
      // Title backdrop: a slow trickle of harmless drifters.
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0) {
        state.ambientTimer = 1.3;
        const kinds = [KIND_MITE, KIND_WEAVER, KIND_SPLITTER];
        spawnEnemy(pick(random, kinds), { x: random() * FIELD.width, y: -30 });
      }
      player.x = FIELD.width / 2 + Math.sin(state.time * 0.5) * 40;
      player.y = FIELD.height / 2 + 60 + Math.sin(state.time * 0.8) * 12;
      player.angle = -Math.PI / 2 + Math.sin(state.time * 0.5) * 0.15;
      player.thrust = 0.5;
    }

    // --- enemies ---
    for (const e of enemies) {
      if (!e.active) continue;
      events |= updateEnemy(e, dt, harmless);
      if (!e.active) continue;
      if (e.y > FIELD.height + 80 || e.x < -120 || e.x > FIELD.width + 120) {
        if (harmless || e.kind === KIND_MITE) e.active = false;
        else {
          e.x = Math.min(FIELD.width - 40, Math.max(40, e.x));
          e.y = Math.min(FIELD.height - 40, Math.max(40, e.y));
        }
      }
    }

    // --- player bullets ---
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active || e.warp > 0.2) continue;
        const r = e.radius + BULLET.radius;
        if (dist2(b.x, b.y, e.x, e.y) < r * r) {
          b.active = false;
          e.hp -= BULLET.damage;
          burst(b.x, b.y, '#8ff7ff', 3, 140, 2);
          if (e.hp <= 0) {
            killEnemy(e, true);
            events |= EVENT_KILL;
          }
          break;
        }
      }
    }

    // --- enemy bullets ---
    for (const b of ebullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      if (!harmless && player.alive) {
        const r = PLAYER.radius + EBULLET.radius - 3;
        if (dist2(b.x, b.y, player.x, player.y) < r * r) {
          b.active = false;
          events |= damagePlayer(b.x, b.y);
        }
      }
    }

    // --- enemies touching the player ---
    if (!harmless && player.alive) {
      for (const e of enemies) {
        if (!e.active || e.warp > 0) continue;
        const r = e.radius + PLAYER.radius - 4;
        if (dist2(e.x, e.y, player.x, player.y) < r * r) {
          if (e.kind === KIND_BOSS) {
            events |= damagePlayer(e.x, e.y);
          } else {
            killEnemy(e, false);
            events |= EVENT_KILL;
            events |= damagePlayer(e.x, e.y);
          }
          if (!player.alive) break;
        }
      }
    }

    // --- pickups ---
    for (const p of pickups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.5 * dt);
      if (player.alive) {
        const d2 = dist2(p.x, p.y, player.x, player.y);
        if (d2 < PICKUP_MAGNET * PICKUP_MAGNET) {
          const d = Math.sqrt(d2) || 1;
          const pull = 520 * (1 - d / PICKUP_MAGNET);
          p.vx += ((player.x - p.x) / d) * pull * dt * 4;
          p.vy += ((player.y - p.y) / d) * pull * dt * 4;
        }
        if (d2 < (PLAYER.radius + PICKUP_RADIUS + 6) ** 2) {
          p.active = false;
          if (p.kind === 'shield') player.shield = Math.min(PLAYER.shieldMax, player.shield + 1);
          else if (p.kind === 'spread') player.spreadTimer = POWER_DURATION;
          else if (p.kind === 'rapid') player.rapidTimer = POWER_DURATION;
          else if (p.kind === 'repair') player.hull = Math.min(PLAYER.hull, player.hull + 1);
          else if (p.kind === 'nova') player.novas = Math.min(PLAYER.novaMax, player.novas + 1);
          addFloat(player.x, player.y - 30, PICKUP[p.kind].label, PICKUP[p.kind].color);
          burst(p.x, p.y, PICKUP[p.kind].color, 10, 180, 2.5);
          events |= EVENT_PICKUP;
        }
      }
    }

    // --- particles ---
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // --- floating texts ---
    for (const f of floats) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) f.active = false;
      f.y -= 34 * dt;
    }

    return events;
  }

  reset();
  return { state, reset, step, stageBoss, spawn: spawnEnemy };
}
