/**
 * Clase dedicada exclusivamente a la animación en Canvas.
 * Modos disponibles: 'fill-drip' | 'drip' | 'fill'
 */
export class WaterCanvasFX {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.config = {
      waterColor: options.waterColor || 'rgba(14, 165, 233, 0.72)',
      backWaveColor: options.backWaveColor || 'rgba(56, 189, 248, 0.42)',
      dropColor: options.dropColor || 'rgba(2, 132, 199, 0.85)',
      waveAmplitude: options.waveAmplitude ?? 5,
      waveFrequency: options.waveFrequency ?? 0.035,
      waveSpeed: options.waveSpeed ?? 0.06,
      dropIntervalMs: options.dropIntervalMs ?? 550,
      ...options
    };

    this.mode = options.mode || 'fill-drip';
    this.level = Math.max(0, Math.min(1, options.initialLevel ?? 0));
    this.phase = 0;
    this.drops = [];
    this.lastDropTime = 0;
    this.rafId = null;
    this.width = 0;
    this.height = 0;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas.parentElement || this.canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);

    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setLevel(value) {
    this.level = Math.max(0, Math.min(1, Number(value) || 0));
  }

  setAnimation(mode) {
    this.mode = mode;
    if (mode === 'fill') {
      this.drops = [];
    }
  }

  start() {
    if (this.rafId) return;
    const loop = (timestamp) => {
      this._update(timestamp);
      this._draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (!this.rafId) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  destroy() {
    this.stop();
    this._resizeObserver.disconnect();
  }

  _spawnDrop() {
    this.drops.push({
      x: this.width * (0.2 + Math.random() * 0.6),
      y: 0,
      vy: 1.4 + Math.random() * 1.2,
      radius: 3.2 + Math.random() * 1.8,
      alpha: 0.95
    });
  }

  _update(timestamp) {
    this.phase += this.config.waveSpeed;

    const hasDrip = this.mode === 'drip' || this.mode === 'fill-drip';
    if (hasDrip && timestamp - this.lastDropTime >= this.config.dropIntervalMs) {
      this._spawnDrop();
      this.lastDropTime = timestamp;
    }

    const surfaceY = this._getSurfaceY();

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.vy += 0.08;
      drop.y += drop.vy;

      if (drop.y + drop.radius >= surfaceY) {
        this.drops.splice(i, 1);
      }
    }
  }

  _getSurfaceY() {
    const hasFill = this.mode === 'fill' || this.mode === 'fill-drip';
    const effectiveLevel = hasFill ? this.level : 0.08;
    return this.height - effectiveLevel * this.height;
  }

  _drawWave(baseY, amp, freq, phaseOffset, color) {
    const { ctx, width, height } = this;
    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let x = 0; x <= width; x += 4) {
      const y = baseY + Math.sin(x * freq + this.phase + phaseOffset) * amp;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  _drawDrops() {
    const { ctx, config, drops } = this;
    for (const drop of drops) {
      ctx.save();
      ctx.fillStyle = config.dropColor;
      ctx.globalAlpha = drop.alpha;

      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.moveTo(drop.x - drop.radius * 0.85, drop.y - drop.radius * 0.3);
      ctx.lineTo(drop.x, drop.y - drop.radius * 2.2);
      ctx.lineTo(drop.x + drop.radius * 0.85, drop.y - drop.radius * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  _draw() {
    const { ctx, width, height, config } = this;
    ctx.clearRect(0, 0, width, height);

    const surfaceY = this._getSurfaceY();
    const hasFill = this.mode === 'fill' || this.mode === 'fill-drip';
    const hasDrip = this.mode === 'drip' || this.mode === 'fill-drip';

    if (hasFill && this.level > 0) {
      this._drawWave(
        surfaceY - 2,
        config.waveAmplitude * 0.8,
        config.waveFrequency * 0.85,
        1.6,
        config.backWaveColor
      );
      this._drawWave(
        surfaceY,
        config.waveAmplitude,
        config.waveFrequency,
        0,
        config.waterColor
      );
    }

    if (hasDrip) {
      this._drawDrops();
    }
  }
}