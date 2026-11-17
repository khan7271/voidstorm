// VOIDSTORM tuning: every number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  accel: 2400,
  maxSpeed: 460,
  drag: 2.6,
  fireInterval: 0.16,
  bulletSpeed: 760,
  hull: 3,
  shieldMax: 3,
  shieldRegenDelay: 4,
  invulnerable: 2,
  novaMax: 2,
};

export const BULLET = { radius: 5, speed: 760, life: 1.1, damage: 1 };
export const EBULLET = { radius: 6, speed: 300, life: 4 };

/** Enemy kinds, by id. cost is the wave-budget price; score is the base points. */
export const ENEMY = {
  mite: { radius: 13, hp: 1, speed: 210, score: 10, cost: 1, color: '#ff5d8f' },
  weaver: { radius: 16, hp: 2, speed: 150, score: 25, cost: 2, color: '#c86bff' },
  splitter: { radius: 22, hp: 3, speed: 110, score: 40, cost: 3, color: '#ff9f43' },
  bulwark: { radius: 30, hp: 9, speed: 55, score: 60, cost: 4, color: '#ff5340' },
  boss: { radius: 64, hp: 150, speed: 70, score: 500, cost: 0, color: '#ff2e63' },
};

export const WAVE = {
  baseBudget: 8,
  budgetPerWave: 5,
  spawnInterval: 0.75,
  spawnSpeedup: 0.94,
  minSpawnInterval: 0.3,
  bossEvery: 5,
  clearPause: 2.6,
};

export const PICKUP = {
  shield: { color: '#35f0ff', label: 'SHIELD' },
  spread: { color: '#ffd23e', label: 'SPREAD SHOT' },
  rapid: { color: '#7dff5e', label: 'RAPID FIRE' },
  repair: { color: '#ff7ad9', label: '+1 HULL' },
  nova: { color: '#ffffff', label: 'NOVA BOMB' },
};
export const PICKUP_RADIUS = 13;
export const PICKUP_MAGNET = 110;
export const POWER_DURATION = 12;

export const COMBO = { window: 2.5, max: 8 };

/** Pool sizes: everything is allocated once at boot, nothing in the hot loop. */
export const POOL = { bullets: 96, ebullets: 160, enemies: 48, particles: 420, pickups: 16, floats: 24 };

export const PALETTE = {
  spaceTop: '#070a1c',
  spaceBottom: '#12082b',
  nebulaA: 'rgba(88, 40, 180, 0.20)',
  nebulaB: 'rgba(20, 120, 160, 0.16)',
  nebulaC: 'rgba(255, 46, 99, 0.10)',
  player: '#35f0ff',
  playerCore: '#eafcff',
  bullet: '#8ff7ff',
  ebullet: '#ff6b81',
  text: '#eef4ff',
  muted: '#8b93b8',
  gold: '#ffd23e',
  danger: '#ff5340',
  panel: 'rgba(10, 14, 34, 0.82)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'voidstorm.best';
