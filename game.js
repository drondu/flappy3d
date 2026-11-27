/**
 * Flappy Bird 3D — Cinematic Physics, Dynamic Camera Rigs, Slow-Mo Impact & HUD Overlay
 */
(() => {
  const WORLD = {
    CEILING_Y: 10.0,
    BIRD_START_Y: 5.2,
    BIRD_RADIUS: 0.37,
    GRAVITY: -29.5,
    FLAP_VY: 8.9,
    MAX_FALL_VY: -12.8,
    PIPE_SPEED: 7.4,
    PIPE_SHAFT_R: 0.95,
    PIPE_CAP_R: 1.12,
    PIPE_CAP_H: 0.65,
    PIPE_SPACING: 10.0,
    SPAWN_Z: -58.0,
    DESPAWN_Z: 14.0,
    GAP_INITIAL: 3.2,
    GAP_MIN: 2.65,
    MIN_GAP_BOTTOM: 1.85,
    MAX_GAP_TOP: 8.55,
  };

  const THEME_MODES = ["auto", "golden", "day", "night"];
  const CAMERA_MODES = [
    { id: "chase", label: "3/4 Chase" },
    { id: "side", label: "Side 3D" },
    { id: "behind", label: "Behind" },
  ];
  const BEST_KEY = "flappy_bird_3d_best_v1";

  class FlappyGame3D {
    constructor(glCanvas, hudCanvas, ui) {
      this.glCanvas = glCanvas;
      this.hudCanvas = hudCanvas;
      this.hud = hudCanvas.getContext("2d");
      this.ui = ui;
      this.sfx = new SoundFX("flappy3d_muted");
      this.renderer = new FlappyRenderer3D(glCanvas);

      this.state = "ready"; // ready | playing | paused | dying | gameover
      this.themeModeIndex = 0;
      this.cameraModeIndex = 0;
      this.score = 0;
      this.best = this._loadBest();
      this.isNewBest = false;

      this.time = 0;
      this.scrollZ = 0;
      this.flashAlpha = 0;
      this.shakeTimer = 0;
      this.slowMoTimer = 0;
      this.scoreFovKick = 0;
      this.deadTimer = 0;
      this.letterbox = 1; // 1 = cinematic framing on ready/gameover, 0 = full frame during flight

      this.bird = this._createBird();
      this.pipes = [];
      this.particles = [];
      this.popups = [];

      const initialRig = this._targetCameraRig();
      this.camPos = [...initialRig.pos];
      this.camTarget = [...initialRig.target];
      this.camFov = initialRig.fov;
      this.camRoll = 0;

      this.hudWidth = 800;
      this.hudHeight = 500;

      this._resize();
      this._bindEvents();
      this._syncUI();

      this.lastFrame = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    _loadBest() {
      try {
        const val = parseInt(localStorage.getItem(BEST_KEY) || "0", 10);
        return Number.isFinite(val) && val > 0 ? val : 0;
      } catch {
        return 0;
      }
    }

    _saveBest(value) {
      try {
        localStorage.setItem(BEST_KEY, String(value));
      } catch {}
    }

    _createBird() {
      return {
        y: WORLD.BIRD_START_Y,
        vy: 0,
        pitch: 0,
        yaw: 0,
        roll: 0,
        squash: 0,
        wingPhase: 0,
        wingAngle: 0,
      };
    }

    _currentThemeName() {
      const mode = THEME_MODES[this.themeModeIndex];
      if (mode !== "auto") return mode;
      const cycle = Math.floor(this.score / 10) % 3;
      return cycle === 0 ? "golden" : cycle === 1 ? "day" : "night";
    }

    _targetCameraRig() {
      const mode = CAMERA_MODES[this.cameraModeIndex].id;
      const by = this.bird ? this.bird.y : WORLD.BIRD_START_Y;
      const vy = this.bird ? this.bird.vy : 0;
      const isPlaying = this.state === "playing";
      const bank = isPlaying ? Math.max(-0.028, Math.min(0.028, vy * 0.0024)) : 0;
      const fovBoost = isPlaying ? this.scoreFovKick * 3.0 : 0;

      // Base rig strictly follows the active camera selection across all menus & gameplay
      let pos, target, fov, roll;
      if (mode === "side") {
        pos = [13.6, 5.15, 1.9];
        target = [0.0, 4.9, -4.4];
        fov = 45 + fovBoost * 0.6;
        roll = 0;
      } else if (mode === "behind") {
        const previewY = this.state === "gameover" ? WORLD.BIRD_START_Y * 0.65 + by * 0.35 : by;
        pos = [0.0, Math.max(2.2, previewY * 0.56 + 2.55), 6.6];
        target = [0.0, Math.max(2.1, previewY * 0.62 + 1.85), -14.5];
        fov = 57 + fovBoost;
        roll = bank * 0.8;
      } else {
        // 3/4 Chase (default)
        pos = [6.4, 4.4 + (by - 5.0) * 0.24, 7.6];
        target = [0.0, 4.6 + (by - 5.0) * 0.28, -5.4];
        fov = 51 + fovBoost;
        roll = bank;
      }

      // Subtle breathing motion in menus while preserving exact camera preview angle
      if (this.state === "ready") {
        const sway = Math.sin(this.time * 0.7);
        const lift = Math.cos(this.time * 0.55);
        pos[0] += mode === "behind" ? sway * 0.22 : sway * 0.35;
        pos[1] += lift * 0.16;
        roll += sway * 0.009;
      } else if (this.state === "dying" || this.state === "gameover") {
        const drift = Math.sin(this.deadTimer * 0.55);
        pos[0] += mode === "behind" ? drift * 0.25 : drift * 0.4;
        pos[2] += 0.65;
        fov -= 1.5;
      }

      return { pos, target, fov, roll };
    }

    _resize() {
      const rect = this.glCanvas.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width || 800));
      const h = Math.max(200, Math.round(rect.height || 500));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.hudWidth = w;
      this.hudHeight = h;
      this.renderer.resize(w, h, dpr);

      this.hudCanvas.width = Math.round(w * dpr);
      this.hudCanvas.height = Math.round(h * dpr);
      this.hud.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _syncUI() {
      if (this.ui.scoreEl) this.ui.scoreEl.textContent = String(this.score);
      if (this.ui.bestEl) this.ui.bestEl.textContent = String(this.best);
      if (this.ui.muteBtn) {
        this.ui.muteBtn.textContent = this.sfx.muted ? "Sound: Off" : "Sound: On";
      }
      if (this.ui.pauseBtn) {
        this.ui.pauseBtn.textContent = this.state === "paused" ? "Resume" : "Pause";
      }
      if (this.ui.themeBtn) {
        const label = THEME_MODES[this.themeModeIndex];
        this.ui.themeBtn.textContent = "Sky: " + label.charAt(0).toUpperCase() + label.slice(1);
      }
      if (this.ui.camBtn) {
        this.ui.camBtn.textContent = "Cam: " + CAMERA_MODES[this.cameraModeIndex].label;
      }
    }

    _bindEvents() {
      window.addEventListener("resize", () => this._resize());

      this.glCanvas.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        this.glCanvas.focus();
        this._handlePrimaryAction();
      });

      window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
          e.preventDefault();
          this._handlePrimaryAction();
        } else if (e.code === "KeyC") {
          e.preventDefault();
          this.cycleCamera();
        } else if (e.code === "KeyP" || e.code === "Escape") {
          e.preventDefault();
          this.togglePause();
        } else if (e.code === "KeyM") {
          e.preventDefault();
          this.toggleMute();
        } else if (e.code === "KeyT") {
          e.preventDefault();
          this.cycleTheme();
        } else if (e.code === "KeyR" && (this.state === "gameover" || this.state === "paused")) {
          e.preventDefault();
          this.reset(true);
        }
      });

      if (this.ui.camBtn) this.ui.camBtn.addEventListener("click", () => this.cycleCamera());
      if (this.ui.themeBtn) this.ui.themeBtn.addEventListener("click", () => this.cycleTheme());
      if (this.ui.pauseBtn) this.ui.pauseBtn.addEventListener("click", () => this.togglePause());
      if (this.ui.muteBtn) this.ui.muteBtn.addEventListener("click", () => this.toggleMute());

      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "playing") {
          this.state = "paused";
          this._syncUI();
        }
      });
    }

    cycleCamera() {
      this.cameraModeIndex = (this.cameraModeIndex + 1) % CAMERA_MODES.length;
      this._syncUI();
    }

    cycleTheme() {
      this.themeModeIndex = (this.themeModeIndex + 1) % THEME_MODES.length;
      this._syncUI();
    }

    toggleMute() {
      this.sfx.toggleMute();
      this._syncUI();
    }

    togglePause() {
      if (this.state === "playing") {
        this.state = "paused";
      } else if (this.state === "paused") {
        this.state = "playing";
        this.lastFrame = performance.now();
      }
      this._syncUI();
    }

    reset(startImmediately = false) {
      this.score = 0;
      this.isNewBest = false;
      this.pipes = [];
      this.particles = [];
      this.popups = [];
      this.bird = this._createBird();
      this.flashAlpha = 0;
      this.shakeTimer = 0;
      this.slowMoTimer = 0;
      this.scoreFovKick = 0;
      this.deadTimer = 0;
      this.state = startImmediately ? "playing" : "ready";
      if (startImmediately) {
        this._seedInitialPipes();
        this._flap();
      }
      this._syncUI();
    }

    _seedInitialPipes() {
      this.pipes = [];
      for (let z = -19; z >= WORLD.SPAWN_Z; z -= WORLD.PIPE_SPACING) {
        this._spawnPipe(z);
      }
    }

    _handlePrimaryAction() {
      if (this.state === "ready") {
        this.state = "playing";
        this._seedInitialPipes();
        this._flap();
        this._syncUI();
      } else if (this.state === "playing") {
        this._flap();
      } else if (this.state === "paused") {
        this.togglePause();
      } else if (this.state === "gameover" && this.deadTimer >= 0.42) {
        this.reset(true);
      }
    }

    _flap() {
      this.bird.vy = WORLD.FLAP_VY;
      this.bird.pitch = 0.46;
      this.bird.squash = 1.0;
      this.bird.wingPhase = Math.PI * 0.5;
      this.sfx.flap();
      this._spawnFeathers(0, this.bird.y - 0.1, 0.35, 5, false);
    }

    _currentGap() {
      const t = Math.min(this.score / 30, 1);
      return WORLD.GAP_INITIAL - t * (WORLD.GAP_INITIAL - WORLD.GAP_MIN);
    }

    _spawnPipe(z) {
      const gap = this._currentGap();
      const maxBottom = WORLD.MAX_GAP_TOP - gap;
      const gapBottom =
        WORLD.MIN_GAP_BOTTOM + Math.random() * Math.max(0.5, maxBottom - WORLD.MIN_GAP_BOTTOM);
      this.pipes.push({
        z,
        gapBottom,
        gapTop: gapBottom + gap,
        gap,
        passed: false,
        ringPop: 0,
      });
    }

    _spawnFeathers(x, y, z, count, burst) {
      for (let i = 0; i < count; i++) {
        const speed = burst ? 2.6 + Math.random() * 4.8 : 1.0 + Math.random() * 2.2;
        const a1 = Math.random() * Math.PI * 2;
        const a2 = (Math.random() - 0.3) * Math.PI;
        this.particles.push({
          x,
          y,
          z,
          vx: Math.cos(a1) * Math.cos(a2) * speed,
          vy: Math.sin(a2) * speed + (burst ? 2.0 : -0.35),
          vz: Math.sin(a1) * Math.cos(a2) * speed + (burst ? 0 : 2.8),
          rx: Math.random() * 6,
          ry: Math.random() * 6,
          rz: Math.random() * 6,
          spin: (Math.random() - 0.5) * 11,
          size: burst ? 1.25 + Math.random() * 0.9 : 0.72 + Math.random() * 0.5,
          life: 0,
          maxLife: burst ? 0.72 + Math.random() * 0.3 : 0.38 + Math.random() * 0.18,
          color: i % 2 === 0 ? [1.0, 0.86, 0.22] : [1.0, 0.97, 0.80],
        });
      }
    }

    _spawnScoreBurst(y) {
      this.scoreFovKick = 1.0;
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14;
        const speed = 2.4 + Math.random() * 2.4;
        this.particles.push({
          x: Math.cos(a) * 0.5,
          y: y + Math.sin(a) * 0.5,
          z: 0,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed + 0.8,
          vz: (Math.random() - 0.5) * 2.2 + 2.2,
          rx: 0,
          ry: 0,
          rz: 0,
          spin: 8,
          size: 0.95,
          life: 0,
          maxLife: 0.55,
          color: i % 2 === 0 ? [1.0, 0.94, 0.45] : [0.55, 1.0, 0.82],
        });
      }
      this.popups.push({
        x: 0,
        y: y + 0.75,
        z: 0,
        text: "+1",
        life: 0,
        maxLife: 0.7,
      });
    }

    _triggerDeath(hitGroundDirectly) {
      if (this.state === "dying" || this.state === "gameover") return;

      this.flashAlpha = 0.82;
      this.shakeTimer = 0.26;
      this.slowMoTimer = 0.24;
      this.deadTimer = 0;
      this.sfx.hit();
      this._spawnFeathers(0, this.bird.y, 0, 18, true);

      if (this.score > this.best) {
        this.best = this.score;
        this.isNewBest = true;
        this._saveBest(this.best);
      }

      if (hitGroundDirectly) {
        this.bird.y = WORLD.BIRD_RADIUS;
        this.bird.vy = 0;
        this.state = "gameover";
      } else {
        this.bird.vy = Math.min(this.bird.vy, -1.5);
        this.sfx.die();
        this.state = "dying";
      }
      this._syncUI();
    }

    _circleHitsRect(cz, cy, r, minZ, minY, maxZ, maxY) {
      const nz = Math.max(minZ, Math.min(cz, maxZ));
      const ny = Math.max(minY, Math.min(cy, maxY));
      const dz = cz - nz;
      const dy = cy - ny;
      return dz * dz + dy * dy < r * r;
    }

    _update(rawDt) {
      // Dramatic brief slow-mo on impact
      let simScale = 1.0;
      if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - rawDt);
        simScale = 0.28;
      }
      const dt = rawDt * simScale;

      this.time += rawDt;
      if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - rawDt * 4.0);
      if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - rawDt);
      if (this.scoreFovKick > 0) this.scoreFovKick = Math.max(0, this.scoreFovKick - rawDt * 2.8);
      if (this.bird.squash > 0) this.bird.squash = Math.max(0, this.bird.squash - rawDt * 6.5);

      const targetLetterbox = this.state === "ready" || this.state === "gameover" ? 1 : 0;
      this.letterbox += (targetLetterbox - this.letterbox) * Math.min(1, rawDt * 6.5);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        pt.vy -= 9.5 * dt;
        pt.rx += pt.spin * dt;
        pt.ry += pt.spin * 0.7 * dt;
      }

      for (let i = this.popups.length - 1; i >= 0; i--) {
        const pop = this.popups[i];
        pop.life += rawDt;
        if (pop.life >= pop.maxLife) {
          this.popups.splice(i, 1);
          continue;
        }
        pop.y += 1.6 * rawDt;
      }

      if (this.state === "paused") {
        this._updateCamera(rawDt);
        return;
      }

      if (this.state === "ready") {
        this.scrollZ += WORLD.PIPE_SPEED * 0.65 * rawDt;
        this.bird.y = WORLD.BIRD_START_Y + Math.sin(this.time * 4.4) * 0.26;
        this.bird.wingPhase += rawDt * 11;
        this.bird.wingAngle = Math.sin(this.bird.wingPhase) * 0.62;
        this.bird.pitch = Math.sin(this.time * 4.4) * 0.08;
        this.bird.roll = Math.sin(this.time * 2.2) * 0.06;
        this._updateCamera(rawDt);
        return;
      }

      if (this.state === "playing") {
        this.scrollZ += WORLD.PIPE_SPEED * dt;

        this.bird.vy = Math.max(WORLD.MAX_FALL_VY, this.bird.vy + WORLD.GRAVITY * dt);
        this.bird.y += this.bird.vy * dt;

        if (this.bird.y > WORLD.CEILING_Y - WORLD.BIRD_RADIUS) {
          this.bird.y = WORLD.CEILING_Y - WORLD.BIRD_RADIUS;
          if (this.bird.vy > 0) this.bird.vy = 0;
        }

        if (this.bird.vy > -3.2) {
          this.bird.pitch += (0.42 - this.bird.pitch) * Math.min(1, dt * 11);
          this.bird.wingPhase += dt * 20;
          this.bird.wingAngle = Math.sin(this.bird.wingPhase) * 0.78;
        } else {
          const diveT = Math.min(1, (-this.bird.vy - 3.2) / 8.5);
          const targetPitch = -diveT * (Math.PI * 0.46);
          this.bird.pitch += (targetPitch - this.bird.pitch) * Math.min(1, dt * 9);
          this.bird.wingPhase += dt * 6;
          this.bird.wingAngle = Math.sin(this.bird.wingPhase) * 0.25 + 0.15;
        }
        this.bird.roll = Math.sin(this.time * 3.5) * 0.04;

        if (this.bird.y - WORLD.BIRD_RADIUS <= 0) {
          this._triggerDeath(true);
          return;
        }

        let minPipeZ = 999;
        for (const p of this.pipes) {
          if (p.z < minPipeZ) minPipeZ = p.z;
        }
        if (this.pipes.length === 0 || minPipeZ > WORLD.SPAWN_Z + WORLD.PIPE_SPACING) {
          this._spawnPipe(Math.min(WORLD.SPAWN_Z, minPipeZ - WORLD.PIPE_SPACING));
        }

        const r = WORLD.BIRD_RADIUS;
        for (let i = this.pipes.length - 1; i >= 0; i--) {
          const p = this.pipes[i];
          p.z += WORLD.PIPE_SPEED * dt;

          if (p.passed && p.ringPop < 1) {
            p.ringPop = Math.min(1, p.ringPop + dt * 2.8);
          }

          if (!p.passed && p.z > 0) {
            p.passed = true;
            this.score += 1;
            this.sfx.score();
            this._spawnScoreBurst(this.bird.y);
            this._syncUI();
          }

          if (Math.abs(p.z) < WORLD.PIPE_CAP_R + r + 0.2) {
            const hitLowerShaft = this._circleHitsRect(
              0, this.bird.y, r,
              p.z - WORLD.PIPE_SHAFT_R, -1,
              p.z + WORLD.PIPE_SHAFT_R, p.gapBottom - WORLD.PIPE_CAP_H
            );
            const hitLowerCap = this._circleHitsRect(
              0, this.bird.y, r,
              p.z - WORLD.PIPE_CAP_R, p.gapBottom - WORLD.PIPE_CAP_H,
              p.z + WORLD.PIPE_CAP_R, p.gapBottom
            );
            const hitUpperCap = this._circleHitsRect(
              0, this.bird.y, r,
              p.z - WORLD.PIPE_CAP_R, p.gapTop,
              p.z + WORLD.PIPE_CAP_R, p.gapTop + WORLD.PIPE_CAP_H
            );
            const hitUpperShaft = this._circleHitsRect(
              0, this.bird.y, r,
              p.z - WORLD.PIPE_SHAFT_R, p.gapTop + WORLD.PIPE_CAP_H,
              p.z + WORLD.PIPE_SHAFT_R, 25
            );
            if (hitLowerShaft || hitLowerCap || hitUpperCap || hitUpperShaft) {
              this._triggerDeath(false);
              return;
            }
          }

          if (p.z > WORLD.DESPAWN_Z) {
            this.pipes.splice(i, 1);
          }
        }

        this._updateCamera(rawDt);
        return;
      }

      if (this.state === "dying") {
        this.deadTimer += rawDt;
        this.bird.vy = Math.max(WORLD.MAX_FALL_VY * 1.2, this.bird.vy + WORLD.GRAVITY * 1.15 * dt);
        this.bird.y += this.bird.vy * dt;
        this.bird.pitch = Math.max(-Math.PI * 0.5, this.bird.pitch - dt * 6.5);
        this.bird.roll += dt * 7.5;
        this.bird.wingAngle = 0.25;

        if (this.bird.y - WORLD.BIRD_RADIUS <= 0) {
          this.bird.y = WORLD.BIRD_RADIUS;
          this.bird.vy = 0;
          this.state = "gameover";
        }
        this._updateCamera(rawDt);
        return;
      }

      if (this.state === "gameover") {
        this.deadTimer += rawDt;
        this._updateCamera(rawDt);
      }
    }

    _updateCamera(dt) {
      const rig = this._targetCameraRig();
      const k = 1 - Math.exp(-dt * 6.5);
      for (let i = 0; i < 3; i++) {
        this.camPos[i] += (rig.pos[i] - this.camPos[i]) * k;
        this.camTarget[i] += (rig.target[i] - this.camTarget[i]) * k;
      }
      this.camFov += (rig.fov - this.camFov) * k;
      this.camRoll += (rig.roll - this.camRoll) * k;
    }

    _drawHUD() {
      const ctx = this.hud;
      const w = this.hudWidth;
      const h = this.hudHeight;
      const cx = w * 0.5;
      const themeName = this._currentThemeName();

      ctx.clearRect(0, 0, w, h);

      // Subtle warm anamorphic horizon sheen in Golden Hour / Day
      if (themeName !== "night") {
        const flareY = themeName === "golden" ? h * 0.44 : h * 0.22;
        const flare = ctx.createLinearGradient(w * 0.35, flareY, w, flareY);
        flare.addColorStop(0, "rgba(255, 210, 130, 0)");
        flare.addColorStop(0.65, themeName === "golden" ? "rgba(255, 190, 110, 0.08)" : "rgba(255, 248, 210, 0.05)");
        flare.addColorStop(1, "rgba(255, 210, 130, 0)");
        ctx.fillStyle = flare;
        ctx.fillRect(0, flareY - 22, w, 44);
      }

      // Subtle cinematic radial vignette
      const vig = ctx.createRadialGradient(cx, h * 0.5, Math.min(w, h) * 0.35, cx, h * 0.5, Math.max(w, h) * 0.72);
      vig.addColorStop(0, "rgba(0, 0, 0, 0)");
      vig.addColorStop(1, "rgba(4, 8, 20, 0.38)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Smoothly retracting cinema letterbox bars on ready / gameover
      const barH = Math.round(h * 0.065 * this.letterbox);
      if (barH > 0) {
        ctx.fillStyle = "rgba(6, 10, 20, 0.88)";
        ctx.fillRect(0, 0, w, barH);
        ctx.fillRect(0, h - barH, w, barH);
      }

      // Projected +1 popups above 3D bird
      ctx.save();
      ctx.font = "800 20px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      for (const pop of this.popups) {
        const scr = this.renderer.projectToScreen(pop.x, pop.y, pop.z, w, h);
        if (!scr) continue;
        ctx.globalAlpha = 1 - pop.life / pop.maxLife;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
        ctx.strokeText(pop.text, scr.x, scr.y);
        ctx.fillStyle = "#fef08a";
        ctx.fillText(pop.text, scr.x, scr.y);
      }
      ctx.restore();

      if (this.state === "playing" || this.state === "dying") {
        this._drawOutlinedText(
          String(this.score),
          cx,
          54,
          "900 48px -apple-system, BlinkMacSystemFont, sans-serif",
          "#ffffff",
          "#0f172a",
          6
        );
      } else if (this.state === "ready") {
        this._drawOutlinedText(
          "FLAPPY BIRD 3D",
          cx,
          h * 0.22,
          "900 40px -apple-system, BlinkMacSystemFont, sans-serif",
          "#fef08a",
          "#0f172a",
          6
        );
        const pulse = 1 + Math.sin(this.time * 4.5) * 0.035;
        ctx.save();
        ctx.translate(cx, h * 0.79);
        ctx.scale(pulse, pulse);
        this._drawRoundRect(-132, -23, 264, 46, 23, "rgba(10, 15, 28, 0.76)", "#fef08a", 2);
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 15px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Click or press Space to fly", 0, 1);
        ctx.restore();
      } else if (this.state === "paused") {
        ctx.fillStyle = "rgba(10, 15, 28, 0.45)";
        ctx.fillRect(0, 0, w, h);
        this._drawOutlinedText("PAUSED", cx, h * 0.44, "900 42px -apple-system, BlinkMacSystemFont, sans-serif");
        this._drawOutlinedText(
          "Press P or click to resume",
          cx,
          h * 0.54,
          "700 16px -apple-system, BlinkMacSystemFont, sans-serif",
          "#e2e8f0",
          "#0f172a",
          4
        );
      } else if (this.state === "gameover") {
        ctx.fillStyle = "rgba(10, 15, 28, 0.36)";
        ctx.fillRect(0, barH, w, h - barH * 2);
        this._drawOutlinedText(
          "GAME OVER",
          cx,
          h * 0.20,
          "900 38px -apple-system, BlinkMacSystemFont, sans-serif",
          "#fca5a5",
          "#0f172a",
          6
        );

        const cardW = 300;
        const cardH = 152;
        const cardX = cx - cardW * 0.5;
        const cardY = h * 0.29;
        this._drawRoundRect(cardX, cardY, cardW, cardH, 16, "#ded895", "#543847", 3.5);
        this._drawRoundRect(cardX + 8, cardY + 8, cardW - 16, cardH - 16, 11, "#efeac0", "#c9bf73", 1.5);

        const mx = cardX + 74;
        const my = cardY + 84;
        ctx.fillStyle = "#543847";
        ctx.font = "800 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("MEDAL", mx, cardY + 33);

        const medal = this._medalForScore(this.score);
        if (medal) {
          ctx.beginPath();
          ctx.arc(mx, my, 27, 0, Math.PI * 2);
          ctx.fillStyle = medal.color;
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = medal.rim;
          ctx.stroke();
          ctx.fillStyle = medal.text;
          ctx.font = "800 10px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textBaseline = "middle";
          ctx.fillText(medal.label, mx, my + 1);
        } else {
          ctx.beginPath();
          ctx.arc(mx, my, 25, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(84, 56, 71, 0.12)";
          ctx.fill();
          ctx.fillStyle = "rgba(84, 56, 71, 0.55)";
          ctx.font = "700 10px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textBaseline = "middle";
          ctx.fillText("10+ PTS", mx, my + 1);
        }

        const colX = cardX + cardW - 32;
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#543847";
        ctx.font = "800 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("SCORE", colX, cardY + 38);
        ctx.fillStyle = "#1e293b";
        ctx.font = "900 29px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(String(this.score), colX, cardY + 70);

        ctx.fillStyle = "#543847";
        ctx.font = "800 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("BEST", colX, cardY + 99);

        if (this.isNewBest) {
          this._drawRoundRect(colX - 86, cardY + 87, 38, 16, 4, "#ef4444");
          ctx.fillStyle = "#ffffff";
          ctx.font = "800 10px -apple-system, BlinkMacSystemFont, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("NEW", colX - 67, cardY + 98);
          ctx.textAlign = "right";
        }

        ctx.fillStyle = "#1e293b";
        ctx.font = "900 29px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(String(this.best), colX, cardY + 130);

        ctx.save();
        ctx.globalAlpha = this.deadTimer >= 0.42 ? 1 : 0.45;
        this._drawRoundRect(cx - 96, cardY + cardH + 20, 192, 44, 22, "#22c55e", "#14532d", 3);
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 16px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Play Again", cx, cardY + cardH + 43);
        ctx.restore();
      }

      if (this.flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    _medalForScore(s) {
      if (s >= 40) return { label: "PLATINUM", color: "#e2e8f0", rim: "#94a3b8", text: "#334155" };
      if (s >= 30) return { label: "GOLD", color: "#facc15", rim: "#ca8a04", text: "#713f12" };
      if (s >= 20) return { label: "SILVER", color: "#cbd5e1", rim: "#64748b", text: "#1e293b" };
      if (s >= 10) return { label: "BRONZE", color: "#d97706", rim: "#92400e", text: "#451a03" };
      return null;
    }

    _drawOutlinedText(text, x, y, font, fill = "#ffffff", stroke = "#0f172a", lw = 5) {
      const ctx = this.hud;
      ctx.save();
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = lw;
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    _drawRoundRect(x, y, w, h, r, fill, stroke = null, lw = 2) {
      const ctx = this.hud;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    }

    _loop(now) {
      const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;

      this._update(dt);

      const shake = this.shakeTimer > 0 ? (this.shakeTimer / 0.26) * 0.30 : 0;
      const sx = shake ? (Math.random() - 0.5) * shake * 2 : 0;
      const sy = shake ? (Math.random() - 0.5) * shake * 2 : 0;

      this.renderer.render({
        time: this.time,
        scrollZ: this.scrollZ,
        themeName: this._currentThemeName(),
        camPos: [this.camPos[0] + sx, this.camPos[1] + sy, this.camPos[2]],
        camTarget: [this.camTarget[0], this.camTarget[1], this.camTarget[2]],
        fovDeg: this.camFov,
        camRoll: this.camRoll,
        capHeight: WORLD.PIPE_CAP_H,
        bird: this.bird,
        pipes: this.pipes,
        particles: this.particles,
      });

      this._drawHUD();
      requestAnimationFrame((t) => this._loop(t));
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const glCanvas = document.getElementById("gl-canvas");
    const hudCanvas = document.getElementById("hud-canvas");
    if (!glCanvas || !hudCanvas) return;
    new FlappyGame3D(glCanvas, hudCanvas, {
      scoreEl: document.getElementById("hud-score"),
      bestEl: document.getElementById("hud-best"),
      camBtn: document.getElementById("btn-camera"),
      themeBtn: document.getElementById("btn-theme"),
      pauseBtn: document.getElementById("btn-pause"),
      muteBtn: document.getElementById("btn-mute"),
    });
  });
})();
