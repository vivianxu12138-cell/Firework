/**
 * 流线型烟花：升空彗星尾 → 爆炸柔光粒子（与 app.js 配套）
 */

export const GRAVITY = 260;

const DRAG = 0.982;

const SHELL_ASCENT_MS = 300;
const GRAVITY_SHELL = 340;

const PALETTES = [
  { core: "#fff5e6", edge: "#e8c9a8" },
  { core: "#ffd080", edge: "#ff9830" },
  { core: "#a8dcff", edge: "#5aa8e8" },
];

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function pickPalette() {
  return PALETTES[Math.floor(Math.random() * PALETTES.length)];
}

export class Particle {
  constructor(x, y, vx, vy, opts) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.colorCore = opts.colorCore;
    this.colorEdge = opts.colorEdge;
    this.lifeMs = opts.lifeMs;
    this.ageMs = 0;
    this.r = opts.r ?? 2.8;
  }

  update(dtMs) {
    this.ageMs += dtMs;
    const dt = dtMs / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * dt;
    this.vx *= DRAG;
    this.vy *= DRAG;
  }

  get alive() {
    return this.ageMs < this.lifeMs;
  }

  get lifeRatio() {
    return Math.min(1, this.ageMs / this.lifeMs);
  }

  get alpha() {
    const t = this.lifeRatio;
    return (1 - t) * (1 - t);
  }

  draw(ctx) {
    const a = this.alpha;
    if (a < 0.02) return;

    const speed = Math.hypot(this.vx, this.vy) || 1;
    const angle = Math.atan2(this.vy, this.vx);
    const stretch = Math.min(3.4, 1.2 + speed / 240);
    const rad = this.r * (1 + this.lifeRatio * 0.2);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.scale(stretch, 1);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 2.4);
    const b = Math.min(1, a * 1.15);
    g.addColorStop(0, rgba(this.colorCore, b));
    g.addColorStop(0.45, rgba(this.colorCore, b * 0.55));
    g.addColorStop(0.85, rgba(this.colorEdge, b * 0.35));
    g.addColorStop(1, rgba(this.colorEdge, 0));

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class ShellHead {
  constructor(x, y, vx, vy, palette) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.palette = palette;
  }

  update(dtMs) {
    const dt = dtMs / 1000;
    this.vy += GRAVITY_SHELL * dt;
    this.vx *= 0.996;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const nx = this.vx / speed;
    const ny = this.vy / speed;
    const tailLen = Math.min(100, 42 + speed * 0.11);

    const hx = this.x;
    const hy = this.y;
    const tx = hx - nx * tailLen;
    const ty = hy - ny * tailLen;

    ctx.lineCap = "round";

    const gWide = ctx.createLinearGradient(tx, ty, hx, hy);
    gWide.addColorStop(0, rgba(this.palette.edge, 0));
    gWide.addColorStop(0.4, rgba(this.palette.edge, 0.35));
    gWide.addColorStop(0.75, rgba(this.palette.core, 0.65));
    gWide.addColorStop(1, rgba(this.palette.core, 0.85));
    ctx.strokeStyle = gWide;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    const gCore = ctx.createLinearGradient(tx, ty, hx, hy);
    gCore.addColorStop(0, rgba(this.palette.edge, 0));
    gCore.addColorStop(0.55, rgba(this.palette.core, 0.55));
    gCore.addColorStop(1, rgba("#ffffff", 1));
    ctx.strokeStyle = gCore;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    const headR = 4;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, headR * 2);
    hg.addColorStop(0, rgba("#ffffff", 0.95));
    hg.addColorStop(0.35, rgba(this.palette.core, 0.75));
    hg.addColorStop(0.7, rgba(this.palette.core, 0.25));
    hg.addColorStop(1, rgba(this.palette.edge, 0));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, headR * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

class FireworkShow {
  constructor(tipX, tipY) {
    this.tipX = tipX;
    this.tipY = tipY;
    this.palette = pickPalette();

    this.shell = new ShellHead(
      tipX,
      tipY,
      (Math.random() - 0.5) * 70,
      -(620 + Math.random() * 80),
      this.palette
    );

    this.phase = "ascend";
    this.ascentMs = 0;
    this.particles = [];
    this.dead = false;
    this.burstX = tipX;
    this.burstY = tipY;
  }

  _spawnExplosion(cx, cy) {
    this.burstX = cx;
    this.burstY = cy;
    const { core, edge } = this.palette;
    const n = 48 + Math.floor(Math.random() * 16);
    const speed0 = 320 + Math.random() * 120;

    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.1;
      const sp = speed0 * (0.88 + Math.random() * 0.22);
      this.particles.push(
        new Particle(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp, {
          colorCore: core,
          colorEdge: edge,
          lifeMs: 650 + Math.random() * 380,
          r: 2.2 + Math.random() * 2.2,
        })
      );
    }
  }

  update(dtMs) {
    if (this.phase === "ascend") {
      this.ascentMs += dtMs;
      this.shell.update(dtMs);
      if (this.ascentMs >= SHELL_ASCENT_MS) {
        this.phase = "burst";
        this._spawnExplosion(this.shell.x, this.shell.y);
      }
      return;
    }

    if (this.phase === "burst") {
      for (const p of this.particles) {
        if (p.alive) p.update(dtMs);
      }
      this.particles = this.particles.filter((p) => p.alive);
      if (!this.particles.length) this.dead = true;
    }
  }

  draw(ctx) {
    if (this.phase === "ascend") {
      this.shell.draw(ctx);
      return;
    }
    for (const p of this.particles) p.draw(ctx);
  }

  get alive() {
    return !this.dead;
  }
}

export class FireworksEngine {
  constructor() {
    this.shows = [];
  }

  spawn(x, y) {
    this.shows.push(new FireworkShow(x, y));
  }

  update(dtMs) {
    for (const s of this.shows) s.update(dtMs);
    this.shows = this.shows.filter((s) => s.alive);
  }

  draw(ctx) {
    for (const s of this.shows) s.draw(ctx);
  }
}
