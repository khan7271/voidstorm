// All drawing: the starfield and nebula backdrop, every ship, bullet, particle and
// pickup, the HUD, the banners, and the title / paused / game-over screens. The
// renderer only reads state — it never changes a rule. Glow comes from layered
// strokes and pre-rendered sprites, not per-frame shadowBlur, so it stays fast.
import { ENEMY, FIELD, FONT, PALETTE, PICKUP, PICKUP_RADIUS, PLAYER } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.5, x - s * 0.45, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.1, x + s, y - s * 0.5, x, y + s * 0.35);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 720;
  let dpr = 1;

  // --- pre-rendered backdrop: gradient + nebula blobs, painted once ---
  const nebula = document.createElement('canvas');
  nebula.width = FIELD.width;
  nebula.height = FIELD.height;
  {
    const n = nebula.getContext('2d');
    const grad = n.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.spaceTop);
    grad.addColorStop(1, PALETTE.spaceBottom);
    n.fillStyle = grad;
    n.fillRect(0, 0, FIELD.width, FIELD.height);
    const blobs = [
      [300, 160, 420, PALETTE.nebulaA],
      [1020, 120, 380, PALETTE.nebulaB],
      [880, 560, 460, PALETTE.nebulaA],
      [180, 580, 340, PALETTE.nebulaC],
      [640, 380, 520, PALETTE.nebulaB],
    ];
    for (const [x, y, r, color] of blobs) {
      const g = n.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g;
      n.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // --- starfield: three parallax layers, fixed seed so scenes are stable ---
  const rng = createRandom(1337);
  const stars = [];
  for (let i = 0; i < 150; i += 1) {
    const depth = 0.3 + rng() * 0.7;
    stars.push({
      x: rng() * FIELD.width,
      y: rng() * FIELD.height,
      r: 0.6 + depth * 1.5,
      depth,
      phase: rng() * Math.PI * 2,
      speed: 0.6 + rng() * 1.6,
    });
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = canvas.clientWidth || FIELD.width;
    viewH = canvas.clientHeight || FIELD.height;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(viewW / FIELD.width, viewH / FIELD.height);
    const ox = (viewW - FIELD.width * scale) / 2;
    const oy = (viewH - FIELD.height * scale) / 2;
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    return scale;
  }

  function glowStroke(color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function drawShipShape(kind, radius, t) {
    ctx.beginPath();
    if (kind === 'mite') {
      ctx.moveTo(radius, 0);
      ctx.lineTo(-radius * 0.8, radius * 0.75);
      ctx.lineTo(-radius * 0.35, 0);
      ctx.lineTo(-radius * 0.8, -radius * 0.75);
      ctx.closePath();
    } else if (kind === 'weaver') {
      ctx.moveTo(radius, 0);
      ctx.lineTo(0, radius * 0.8);
      ctx.lineTo(-radius, 0);
      ctx.lineTo(0, -radius * 0.8);
      ctx.closePath();
    } else if (kind === 'splitter') {
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + t * 0.4;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (kind === 'bulwark') {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (kind === 'boss') {
      ctx.moveTo(radius * 1.1, 0);
      ctx.lineTo(radius * 0.5, radius * 0.55);
      ctx.lineTo(-radius * 0.4, radius * 0.8);
      ctx.lineTo(-radius * 1.0, radius * 0.35);
      ctx.lineTo(-radius * 0.7, 0);
      ctx.lineTo(-radius * 1.0, -radius * 0.35);
      ctx.lineTo(-radius * 0.4, -radius * 0.8);
      ctx.lineTo(radius * 0.5, -radius * 0.55);
      ctx.closePath();
    }
  }

  function drawPlayer(p, t) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(t * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.rotate(p.angle);
    // Thruster flame, flickering with thrust.
    const flame = (10 + p.thrust * 14) * (0.8 + Math.random() * 0.4);
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(-14 - flame, 0);
    ctx.lineTo(-14, -6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 160, 60, 0.85)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-14, 3.5);
    ctx.lineTo(-14 - flame * 0.6, 0);
    ctx.lineTo(-14, -3.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 240, 160, 0.95)';
    ctx.fill();
    // Hull: a sleek dart, cyan glow over a dark core.
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-12, 13);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, -13);
    ctx.closePath();
    ctx.fillStyle = '#0b2530';
    ctx.fill();
    glowStroke('rgba(53, 240, 255, 0.35)', 7);
    ctx.stroke();
    glowStroke(PALETTE.player, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-6, -5);
    ctx.closePath();
    ctx.fillStyle = PALETTE.playerCore;
    ctx.fill();
    ctx.restore();
    // Shield ring, breathing gently.
    if (p.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.1 * Math.sin(t * 6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      glowStroke(PALETTE.player, 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEnemy(e, t) {
    const cfg = ENEMY[e.kind];
    ctx.save();
    ctx.translate(e.x, e.y);
    let s = 1;
    if (e.warp > 0) {
      s = 1 - (e.warp / 0.5) * 0.8;
      ctx.globalAlpha = 1 - e.warp / 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * (2 - s), 0, Math.PI * 2);
      glowStroke(cfg.color, 2);
      ctx.globalAlpha = (1 - e.warp / 0.5) * 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1 - e.warp / 0.5;
    }
    ctx.scale(s, s);
    ctx.rotate(e.angle);
    drawShipShape(e.kind, e.radius, e.t);
    ctx.fillStyle = 'rgba(10, 8, 24, 0.9)';
    ctx.fill();
    glowStroke(cfg.color, 5);
    ctx.globalAlpha *= 0.4;
    ctx.stroke();
    ctx.globalAlpha = s === 1 ? 1 : ctx.globalAlpha;
    glowStroke(cfg.color, 2);
    ctx.stroke();
    // Inner detail per kind.
    ctx.beginPath();
    if (e.kind === 'weaver') {
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else if (e.kind === 'splitter') {
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-6, -6);
      ctx.closePath();
      ctx.fillStyle = cfg.color;
      ctx.fill();
    } else if (e.kind === 'bulwark') {
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color;
      ctx.fill();
    } else if (e.kind === 'boss') {
      const pulse = 1 + Math.sin(t * 5) * 0.12;
      ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2e63';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 7 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      // Rotating outer ring.
      ctx.rotate(-e.angle + t * 0.8);
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 10, 0, Math.PI * 1.2);
      glowStroke('rgba(255, 46, 99, 0.8)', 3);
      ctx.stroke();
    }
    ctx.restore();
    // Boss health bar above the ship, clamped so it never leaves the top edge.
    if (e.kind === 'boss' && e.warp <= 0) {
      const w = 130;
      const frac = Math.max(0, e.hp / e.maxHp);
      const barY = Math.max(12, e.y - e.radius - 26);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, barY, w, 9);
      ctx.fillStyle = '#ff2e63';
      ctx.fillRect(e.x - w / 2 + 1, barY + 1, (w - 2) * frac, 7);
    }
  }

  function drawPickup(p, t) {
    const cfg = PICKUP[p.kind];
    const blink = p.life < 3 ? (Math.floor(t * 8) % 2 === 0 ? 0.35 : 1) : 1;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(t * 3 + p.x) * 3);
    ctx.globalAlpha = blink;
    ctx.rotate(t * 1.2);
    ctx.beginPath();
    ctx.moveTo(0, -PICKUP_RADIUS);
    ctx.lineTo(PICKUP_RADIUS, 0);
    ctx.lineTo(0, PICKUP_RADIUS);
    ctx.lineTo(-PICKUP_RADIUS, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10, 14, 34, 0.9)';
    ctx.fill();
    glowStroke(cfg.color, 5);
    ctx.globalAlpha = blink * 0.4;
    ctx.stroke();
    ctx.globalAlpha = blink;
    glowStroke(cfg.color, 2);
    ctx.stroke();
    // Glyph per kind.
    ctx.fillStyle = cfg.color;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = p.kind === 'shield' ? 'S' : p.kind === 'spread' ? '3' : p.kind === 'rapid' ? 'R' : p.kind === 'repair' ? '+' : 'N';
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 170, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHud(state, ui) {
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Score, top-left.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('S C O R E', 28, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(String(state.score), 28, 70);
    // Combo meter under the score.
    if (state.combo >= 2) {
      const frac = state.comboTimer / 2.5;
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText(`COMBO x${state.combo}`, 28, 98);
      ctx.fillStyle = 'rgba(255, 210, 62, 0.25)';
      ctx.fillRect(28, 106, 120, 5);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(28, 106, 120 * frac, 5);
    }
    // Wave, top-centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('W A V E', FIELD.width / 2, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(String(state.wave), FIELD.width / 2, 64);
    // Boss bar, top-centre under the wave.
    if (state.boss) {
      const w = 340;
      const frac = Math.max(0, state.boss.hp / state.boss.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(FIELD.width / 2 - w / 2, 76, w, 10);
      ctx.fillStyle = '#ff2e63';
      ctx.fillRect(FIELD.width / 2 - w / 2 + 1, 77, (w - 2) * frac, 8);
      ctx.fillStyle = '#ff8fb0';
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText('D R E A D N O U G H T', FIELD.width / 2, 104);
    }
    // Hull hearts + shield pips, top-right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('H U L L', FIELD.width - 28, 34);
    for (let i = 0; i < PLAYER.hull; i += 1) {
      heartPath(ctx, FIELD.width - 40 - i * 30, 58, 11);
      ctx.fillStyle = i < p.hull ? '#ff5340' : 'rgba(255, 83, 64, 0.18)';
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('S H I E L D', FIELD.width - 28, 96);
    for (let i = 0; i < PLAYER.shieldMax; i += 1) {
      ctx.beginPath();
      ctx.arc(FIELD.width - 40 - i * 26, 112, 7, 0, Math.PI * 2);
      ctx.fillStyle = i < p.shield ? PALETTE.player : 'rgba(53, 240, 255, 0.15)';
      ctx.fill();
    }
    // Novas, bottom-left.
    ctx.textAlign = 'left';
    for (let i = 0; i < p.novas; i += 1) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText('✦', 28 + i * 26, FIELD.height - 30);
    }
    if (p.novas > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 12px ${FONT}`;
      ctx.fillText('Q — NOVA BOMB', 28 + p.novas * 26 + 8, FIELD.height - 30);
    }
    // Power-up timers, bottom-centre.
    ctx.textAlign = 'center';
    let line = '';
    if (p.spreadTimer > 0) line += `SPREAD ${Math.ceil(p.spreadTimer)}s  `;
    if (p.rapidTimer > 0) line += `RAPID ${Math.ceil(p.rapidTimer)}s`;
    if (line) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(line, FIELD.width / 2, FIELD.height - 30);
    }
    // Hints, bottom-right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(ui.muted ? 'M — SOUND OFF' : 'P PAUSE · M MUTE', FIELD.width - 28, FIELD.height - 30);
  }

  function drawBanner(state) {
    if (state.bannerTimer <= 0 || !state.banner) return;
    const total = state.banner.includes('CLEAR') ? 2.6 : 1.4;
    const frac = Math.min(1, state.bannerTimer / total);
    const alpha = Math.min(1, frac * 3);
    const scaleIn = 1 + (1 - Math.min(1, (total - state.bannerTimer) * 4)) * 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(FIELD.width / 2, 200);
    ctx.scale(scaleIn, scaleIn);
    ctx.textAlign = 'center';
    ctx.font = `800 52px ${FONT}`;
    ctx.shadowColor = 'rgba(53, 240, 255, 0.8)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(state.banner, 0, 0);
    ctx.restore();
  }

  function drawTitle(state, best, t) {
    ctx.fillStyle = 'rgba(4, 6, 18, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    const bob = Math.sin(t * 1.4) * 6;
    ctx.save();
    ctx.translate(FIELD.width / 2, 218 + bob);
    ctx.font = `900 104px ${FONT}`;
    ctx.shadowColor = 'rgba(53, 240, 255, 0.9)';
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#eafcff';
    ctx.fillText('VOIDSTORM', 0, 0);
    ctx.shadowBlur = 0;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('H O L D   T H E   L I N E   I N   T H E   N E O N   V O I D', 0, 44);
    ctx.restore();
    // How to play.
    panel(FIELD.width / 2 - 300, 330, 600, 148);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 17px ${FONT}`;
    const rows = [
      ['WASD / ARROWS', 'fly your ship'],
      ['MOUSE', 'aim — hold CLICK or SPACE to fire'],
      ['Q', 'nova bomb — clears the sky'],
      ['P', 'pause      ·      M mute'],
    ];
    rows.forEach(([key, desc], i) => {
      const y = 362 + i * 32;
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.player;
      ctx.fillText(key, FIELD.width / 2 - 16, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(desc, FIELD.width / 2 + 16, y);
    });
    ctx.textAlign = 'center';
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(`BEST  ${best}`, FIELD.width / 2, 516);
    }
    if (Math.floor(t * 1.2 + 0.25) % 2 === 0) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText('CLICK OR PRESS SPACE TO LAUNCH', FIELD.width / 2, 566);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('Waves of raiders, a Dreadnought every 5th wave — chain kills for combo score.', FIELD.width / 2, 622);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4, 6, 18, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('Press P or click to resume', FIELD.width / 2, FIELD.height / 2 + 34);
  }

  function drawOver(state, best, isNewBest) {
    ctx.fillStyle = 'rgba(8, 4, 14, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(FIELD.width / 2 - 280, 168, 560, 330);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5340';
    ctx.font = `900 58px ${FONT}`;
    ctx.shadowColor = 'rgba(255, 83, 64, 0.7)';
    ctx.shadowBlur = 26;
    ctx.fillText('GAME OVER', FIELD.width / 2, 238);
    ctx.shadowBlur = 0;
    if (isNewBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText('★ NEW BEST ★', FIELD.width / 2, 278);
    }
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('SCORE', FIELD.width / 2, 322);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(String(state.score), FIELD.width / 2, 368);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText(`WAVE ${state.wave}  ·  ${state.kills} KILLS  ·  BEST ${best}`, FIELD.width / 2, 410);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 22px ${FONT}`;
    if (Math.floor(performance.now() / 700) % 2 === 0) {
      ctx.fillText('CLICK OR PRESS SPACE TO FLY AGAIN', FIELD.width / 2, 462);
    }
  }

  function draw(state, screen, ui) {
    const t = state.time;
    frame();
    // Shake: a few pixels of random offset while shake is hot.
    if (state.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    ctx.drawImage(nebula, 0, 0);
    // Stars, drifting down slowly with a little parallax against the player.
    const px = state.player.x - FIELD.width / 2;
    const py = state.player.y - FIELD.height / 2;
    for (const s of stars) {
      const y = (s.y + t * 6 * s.depth) % FIELD.height;
      const x = (s.x - px * 0.03 * s.depth + FIELD.width) % FIELD.width;
      const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      ctx.globalAlpha = 0.35 + 0.6 * s.depth * tw;
      ctx.fillStyle = '#dfeaff';
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.pickups) if (p.active) drawPickup(p, t);
    ctx.globalCompositeOperation = 'source-over';
    for (const e of state.enemies) if (e.active) drawEnemy(e, t);
    // Enemy bullets: glowing orbs.
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.ebullets) {
      if (!b.active) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 107, 129, 0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b81';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd7de';
      ctx.fill();
    }
    // Player bullets: bright capsules.
    for (const b of state.bullets) {
      if (!b.active) continue;
      const a = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.strokeStyle = 'rgba(143, 247, 255, 0.4)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.strokeStyle = '#c8fbff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
    // Particles.
    for (const p of state.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Player ship.
    if (state.player.alive) drawPlayer(state.player, t);
    // Floating score texts.
    ctx.textAlign = 'center';
    for (const f of state.floats) {
      if (!f.active) continue;
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.font = `800 17px ${FONT}`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, ui);
    drawBanner(state);
    // Damage flash: a red vignette that fades.
    if (state.flash > 0) {
      const g = ctx.createRadialGradient(
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.3,
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.75,
      );
      g.addColorStop(0, 'rgba(255, 40, 60, 0)');
      g.addColorStop(1, `rgba(255, 40, 60, ${state.flash * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    // Low hull: a slow red pulse at the edges.
    if (screen === SCREEN_PLAY && state.player.hull === 1 && state.player.alive) {
      const pulse = 0.1 + 0.08 * Math.sin(t * 4);
      const g = ctx.createRadialGradient(
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.32,
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.75,
      );
      g.addColorStop(0, 'rgba(255, 40, 60, 0)');
      g.addColorStop(1, `rgba(255, 40, 60, ${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_TITLE) drawTitle(state, ui.best, t);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, ui.best, ui.isNewBest);
  }

  return { draw, resize };
}
