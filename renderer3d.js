/**
 * Cinematic Zero-Dependency WebGL 3D Renderer for Flappy Bird 3D.
 * Features ACES filmic tone mapping, directional + hemisphere + Fresnel rim lighting,
 * Mie sun-scattering atmospheric fog, animated sky sunbeams, stepped architectural towers,
 * guaranteed non-overlapping scenery placement, glowing curb lanterns, and 3D particles.
 */
(() => {
  // ---------------- Matrix & Vector Math ----------------
  const Mat4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    perspective(out, fovy, aspect, near, far) {
      const f = 1.0 / Math.tan(fovy * 0.5);
      const nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },
    lookAt(out, eye, target, up) {
      let zx = eye[0] - target[0];
      let zy = eye[1] - target[1];
      let zz = eye[2] - target[2];
      let len = Math.hypot(zx, zy, zz) || 1;
      zx /= len; zy /= len; zz /= len;

      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      len = Math.hypot(xx, xy, xz) || 1;
      xx /= len; xy /= len; xz /= len;

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      out[15] = 1;
      return out;
    },
    multiply(out, a, b) {
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return out;
    },
    fromTRS(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
      const cx = Math.cos(rx), sxr = Math.sin(rx);
      const cy = Math.cos(ry), syr = Math.sin(ry);
      const cz = Math.cos(rz), szr = Math.sin(rz);

      const r00 = cy * cz + syr * sxr * szr;
      const r01 = -cy * szr + syr * sxr * cz;
      const r02 = syr * cx;

      const r10 = cx * szr;
      const r11 = cx * cz;
      const r12 = -sxr;

      const r20 = -syr * cz + cy * sxr * szr;
      const r21 = syr * szr + cy * sxr * cz;
      const r22 = cy * cx;

      out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
      out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
      out[8] = r02 * sz; out[9] = r12 * sz; out[10] = r22 * sz; out[11] = 0;
      out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
      return out;
    },
    normalMat3(out, m) {
      const c0x = m[0], c0y = m[1], c0z = m[2];
      const c1x = m[4], c1y = m[5], c1z = m[6];
      const c2x = m[8], c2y = m[9], c2z = m[10];

      const n0x = c1y * c2z - c1z * c2y;
      const n0y = c1z * c2x - c1x * c2z;
      const n0z = c1x * c2y - c1y * c2x;
      const n1x = c2y * c0z - c2z * c0y;
      const n1y = c2z * c0x - c2x * c0z;
      const n1z = c2x * c0y - c2y * c0x;
      const n2x = c0y * c1z - c0z * c1y;
      const n2y = c0z * c1x - c0x * c1z;
      const n2z = c0x * c1y - c0y * c1x;

      let det = c0x * n0x + c0y * n0y + c0z * n0z;
      if (!det) {
        out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        return out;
      }
      det = 1.0 / det;
      out[0] = n0x * det; out[1] = n0y * det; out[2] = n0z * det;
      out[3] = n1x * det; out[4] = n1y * det; out[5] = n1z * det;
      out[6] = n2x * det; out[7] = n2y * det; out[8] = n2z * det;
      return out;
    },
    project(vp, x, y, z, width, height) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0.001) return null;
      return {
        x: (cx / cw * 0.5 + 0.5) * width,
        y: (1 - (cy / cw * 0.5 + 0.5)) * height,
      };
    },
  };

  // ---------------- Procedural Geometry Builder ----------------
  class MeshBuilder {
    constructor() {
      this.data = [];
    }

    pushTri(p0, p1, p2, n0, n1, n2, c) {
      this.data.push(
        p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], c[0], c[1], c[2],
        p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], c[0], c[1], c[2],
        p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], c[0], c[1], c[2]
      );
    }

    addBox(cx, cy, cz, sx, sy, sz, color) {
      const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
      const faces = [
        { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
        { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
        { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
        { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
        { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
        { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      ];
      for (const f of faces) {
        const p = f.v.map((pt) => [pt[0] + cx, pt[1] + cy, pt[2] + cz]);
        this.pushTri(p[0], p[1], p[2], f.n, f.n, f.n, color);
        this.pushTri(p[0], p[2], p[3], f.n, f.n, f.n, color);
      }
    }

    addEllipsoid(cx, cy, cz, rx, ry, rz, latSegs, lonSegs, colorFn) {
      const color = typeof colorFn === "function" ? colorFn : () => colorFn;
      for (let i = 0; i < latSegs; i++) {
        const t0 = (i / latSegs) * Math.PI;
        const t1 = ((i + 1) / latSegs) * Math.PI;
        for (let j = 0; j < lonSegs; j++) {
          const p0 = (j / lonSegs) * Math.PI * 2;
          const p1 = ((j + 1) / lonSegs) * Math.PI * 2;

          const pt = (t, p) => {
            const st = Math.sin(t), ct = Math.cos(t);
            const sp = Math.sin(p), cp = Math.cos(p);
            const nx = st * cp, ny = ct, nz = st * sp;
            const nl = Math.hypot(nx / rx, ny / ry, nz / rz) || 1;
            return {
              pos: [cx + rx * nx, cy + ry * ny, cz + rz * nz],
              nrm: [(nx / rx) / nl, (ny / ry) / nl, (nz / rz) / nl],
              ny,
              nx,
            };
          };

          const a = pt(t0, p0), b = pt(t1, p0), c = pt(t1, p1), d = pt(t0, p1);
          const col = color((a.ny + c.ny) * 0.5, (a.nx + c.nx) * 0.5);
          this.pushTri(a.pos, b.pos, c.pos, a.nrm, b.nrm, c.nrm, col);
          this.pushTri(a.pos, c.pos, d.pos, a.nrm, c.nrm, d.nrm, col);
        }
      }
    }

    addCylinder(cx, y0, y1, cz, rBottom, rTop, segs, color, capTop = true, capBottom = true) {
      const slope = (rBottom - rTop) / Math.max(0.0001, y1 - y0);
      const nyLen = Math.hypot(1, slope);
      const ny = slope / nyLen;
      const nr = 1 / nyLen;

      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);

        const p00 = [cx + c0 * rBottom, y0, cz + s0 * rBottom];
        const p10 = [cx + c1 * rBottom, y0, cz + s1 * rBottom];
        const p11 = [cx + c1 * rTop, y1, cz + s1 * rTop];
        const p01 = [cx + c0 * rTop, y1, cz + s0 * rTop];
        const n0 = [c0 * nr, ny, s0 * nr];
        const n1 = [c1 * nr, ny, s1 * nr];

        this.pushTri(p00, p10, p11, n0, n1, n1, color);
        this.pushTri(p00, p11, p01, n0, n1, n0, color);

        if (capTop && rTop > 0) {
          this.pushTri([cx, y1, cz], p01, p11, [0, 1, 0], [0, 1, 0], [0, 1, 0], color);
        }
        if (capBottom && rBottom > 0) {
          this.pushTri([cx, y0, cz], p10, p00, [0, -1, 0], [0, -1, 0], [0, -1, 0], color);
        }
      }
    }

    // Faceted mountain pyramid/peak
    addMountainPeak(radius, height, segs, baseColor, snowColor) {
      const midY = height * 0.62;
      const midR = radius * 0.42;
      this.addCylinder(0, 0, midY, 0, radius, midR, segs, baseColor, false, false);
      this.addCylinder(0, midY, height, 0, midR, 0.02, segs, snowColor, false, false);
    }

    addPipeCap(rOuter, rInner, height, segs, outerColor, rimColor, innerColor) {
      // Subtle chamfered rim at bottom and top of cap
      this.addCylinder(0, 0, height * 0.14, 0, rOuter * 0.94, rOuter, segs, outerColor, false, true);
      this.addCylinder(0, height * 0.14, height * 0.90, 0, rOuter, rOuter, segs, outerColor, false, false);
      this.addCylinder(0, height * 0.90, height, 0, rOuter, rOuter * 0.97, segs, rimColor, false, false);

      const rTopOuter = rOuter * 0.97;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);

        const o0 = [c0 * rTopOuter, height, s0 * rTopOuter];
        const o1 = [c1 * rTopOuter, height, s1 * rTopOuter];
        const i0 = [c0 * rInner, height, s0 * rInner];
        const i1 = [c1 * rInner, height, s1 * rInner];
        const up = [0, 1, 0];
        this.pushTri(o0, o1, i1, up, up, up, rimColor);
        this.pushTri(o0, i1, i0, up, up, up, rimColor);

        const d0 = [c0 * rInner, height * 0.16, s0 * rInner];
        const d1 = [c1 * rInner, height * 0.16, s1 * rInner];
        const ni0 = [-c0, 0, -s0];
        const ni1 = [-c1, 0, -s1];
        this.pushTri(i0, i1, d1, ni0, ni1, ni1, innerColor);
        this.pushTri(i0, d1, d0, ni0, ni1, ni0, innerColor);
        this.pushTri([0, height * 0.16, 0], d0, d1, up, up, up, innerColor);
      }
    }

    addTorusXY(majorR, minorR, majorSegs, minorSegs, color) {
      for (let i = 0; i < majorSegs; i++) {
        const u0 = (i / majorSegs) * Math.PI * 2;
        const u1 = ((i + 1) / majorSegs) * Math.PI * 2;
        for (let j = 0; j < minorSegs; j++) {
          const v0 = (j / minorSegs) * Math.PI * 2;
          const v1 = ((j + 1) / minorSegs) * Math.PI * 2;
          const pt = (u, v) => {
            const cu = Math.cos(u), su = Math.sin(u);
            const cv = Math.cos(v), sv = Math.sin(v);
            const r = majorR + minorR * cv;
            return { pos: [r * cu, r * su, minorR * sv], nrm: [cv * cu, cv * su, sv] };
          };
          const a = pt(u0, v0), b = pt(u1, v0), c = pt(u1, v1), d = pt(u0, v1);
          this.pushTri(a.pos, b.pos, c.pos, a.nrm, b.nrm, c.nrm, color);
          this.pushTri(a.pos, c.pos, d.pos, a.nrm, c.nrm, d.nrm, color);
        }
      }
    }

    addBeakCone(cx, cy, zBase, zTip, rx, ry, segs, color) {
      const tip = [cx, cy, zTip];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, zBase];
        const p1 = [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, zBase];
        const am = (a0 + a1) * 0.5;
        const n = [Math.cos(am) * 0.85, Math.sin(am) * 0.85, -0.52];
        this.pushTri(p0, p1, tip, n, n, n, color);
      }
    }

    addDiscXZ(radius, segs, color) {
      const up = [0, 1, 0];
      const center = [0, 0, 0];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [Math.cos(a0) * radius, 0, Math.sin(a0) * radius];
        const p1 = [Math.cos(a1) * radius, 0, Math.sin(a1) * radius];
        this.pushTri(center, p1, p0, up, up, up, color);
      }
    }

    upload(gl) {
      const buf = gl.createBuffer();
      const arr = new Float32Array(this.data);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      return { buffer: buf, count: arr.length / 9 };
    }
  }

  // ---------------- Cinematic Shaders (ACES Filmic + Rim + Volumetric Sunbeams) ----------------
  const SKY_VS = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.999, 1.0);
    }
  `;

  const SKY_FS = `
    precision mediump float;
    varying vec2 vUv;
    uniform vec3 uSkyTop;
    uniform vec3 uSkyMid;
    uniform vec3 uSkyHorizon;
    uniform vec3 uOrbColor;
    uniform vec2 uOrbPos;
    uniform float uAspect;
    uniform float uIsNight;
    uniform float uRayStrength;
    uniform float uTime;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      float y = clamp(vUv.y, 0.0, 1.0);
      vec3 col = mix(uSkyHorizon, uSkyMid, smoothstep(0.14, 0.52, y));
      col = mix(col, uSkyTop, smoothstep(0.48, 0.96, y));

      // Subtle horizon glow band
      float hBand = exp(-abs(y - 0.34) * 9.0);
      col += uOrbColor * hBand * 0.14;

      // Twinkling stars at sunset/night
      if (uIsNight > 0.01 && y > 0.38) {
        vec2 grid = floor(vUv * vec2(120.0, 74.0));
        float h = hash(grid);
        if (h > 0.986) {
          float tw = 0.5 + 0.5 * sin(uTime * 2.2 + h * 65.0);
          float fade = smoothstep(0.38, 0.68, y);
          col += vec3(1.0, 0.97, 0.90) * tw * fade * uIsNight * 1.1;
        }
      }

      // Sun / Moon bloom + soft crepuscular rays
      vec2 d = (vUv - uOrbPos) * vec2(uAspect, 1.0);
      float dist = length(d);
      float angle = atan(d.y, d.x);
      float rays = 0.5 + 0.5 * sin(angle * 7.0 + uTime * 0.18) * cos(angle * 4.0 - uTime * 0.11);
      col += uOrbColor * rays * exp(-dist * 2.4) * uRayStrength;
      col += uOrbColor * exp(-dist * 5.2) * 0.55;
      col += uOrbColor * exp(-dist * 18.0) * 0.75;
      float disc = 1.0 - smoothstep(0.044, 0.054, dist);
      col = mix(col, uOrbColor * 1.6, disc);

      col = aces(col);
      col = pow(col, vec3(1.0 / 2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const MESH_VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec3 aColor;

    uniform mat4 uMVP;
    uniform mat4 uModel;
    uniform mat3 uNormalMat;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vColor;

    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(uNormalMat * aNormal);
      vColor = aColor;
      gl_Position = uMVP * vec4(aPos, 1.0);
    }
  `;

  const MESH_FS = `
    precision mediump float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vColor;

    uniform vec3 uLightDir;
    uniform vec3 uLightColor;
    uniform vec3 uSkyAmbient;
    uniform vec3 uGroundAmbient;
    uniform vec3 uRimColor;
    uniform vec3 uFogColor;
    uniform vec3 uSunFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform vec3 uCamPos;
    uniform float uShininess;
    uniform float uSpecStrength;
    uniform float uRimStrength;
    uniform float uEmissive;
    uniform vec3 uTint;
    uniform float uAlpha;

    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      vec3 N = normalize(vNormal);
      vec3 L = normalize(uLightDir);
      vec3 viewVec = uCamPos - vWorldPos;
      float dist = length(viewVec);
      vec3 V = viewVec / max(dist, 0.0001);
      vec3 H = normalize(L + V);

      // Linearize approximate albedo for richer filmic lighting
      vec3 albedo = pow(max(vColor * uTint, vec3(0.001)), vec3(1.85));

      // Hemisphere bounce + soft-wrapped sunlight + Blinn-Phong specular
      vec3 hemi = mix(uGroundAmbient, uSkyAmbient, N.y * 0.5 + 0.5);
      float diff = max(dot(N, L) * 0.78 + 0.22, 0.0);
      float spec = pow(max(dot(N, H), 0.0), uShininess) * uSpecStrength;

      // Cinematic Fresnel rim backlight
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 rim = uRimColor * fresnel * uRimStrength * (0.45 + 0.55 * max(N.y, 0.0));

      vec3 lit = albedo * (hemi * 0.62 + uLightColor * diff * 0.92) + uLightColor * spec + rim;
      lit = mix(lit, albedo * 1.9, uEmissive);

      // Atmospheric perspective with directional sun-haze scattering
      vec3 rayDir = -V;
      float sunAlign = pow(max(dot(rayDir, L), 0.0), 4.0);
      vec3 fogCol = mix(uFogColor, uSunFogColor, sunAlign * 0.65);
      float heightMist = exp(-max(vWorldPos.y, 0.0) * 0.11) * 0.24;
      float fogFactor = clamp(smoothstep(uFogNear, uFogFar, dist) + heightMist * smoothstep(14.0, 62.0, dist), 0.0, 1.0);

      vec3 hdr = mix(lit, fogCol, fogFactor);
      vec3 mapped = pow(aces(hdr), vec3(1.0 / 2.2));
      gl_FragColor = vec4(mapped, uAlpha);
    }
  `;

  // ---------------- Cinematic Linear-HDR Theme Palettes ----------------
  const THEMES = {
    golden: {
      skyTop: [0.06, 0.10, 0.28],
      skyMid: [0.48, 0.22, 0.34],
      skyHorizon: [1.35, 0.62, 0.28],
      orbColor: [1.8, 1.05, 0.48],
      orbPos: [0.76, 0.56],
      isNight: 0.42,
      rayStrength: 0.22,
      lightDir: [0.55, 0.36, -0.75],
      lightColor: [1.45, 0.88, 0.48],
      skyAmbient: [0.42, 0.34, 0.58],
      groundAmbient: [0.28, 0.20, 0.16],
      rimColor: [1.65, 0.92, 0.42],
      fogColor: [0.68, 0.36, 0.32],
      sunFogColor: [1.35, 0.70, 0.34],
      pipeTint: [0.95, 0.98, 0.88],
      cityTint: [0.32, 0.28, 0.44],
      roofTint: [0.44, 0.36, 0.52],
      windowGlow: 0.9,
      lanternGlow: 1.0,
      cloudTint: [1.15, 0.84, 0.72],
      groundTint: [0.92, 0.86, 0.76],
      mtnTint: [0.34, 0.24, 0.40],
    },
    day: {
      skyTop: [0.07, 0.32, 0.78],
      skyMid: [0.28, 0.64, 0.94],
      skyHorizon: [0.88, 1.02, 1.12],
      orbColor: [1.6, 1.45, 0.95],
      orbPos: [0.80, 0.78],
      isNight: 0.0,
      rayStrength: 0.14,
      lightDir: [0.58, 0.78, -0.28],
      lightColor: [1.35, 1.28, 1.12],
      skyAmbient: [0.55, 0.78, 1.05],
      groundAmbient: [0.34, 0.42, 0.24],
      rimColor: [1.35, 1.25, 0.92],
      fogColor: [0.62, 0.84, 0.96],
      sunFogColor: [1.15, 1.08, 0.86],
      pipeTint: [1.0, 1.0, 1.0],
      cityTint: [0.66, 0.78, 0.88],
      roofTint: [0.76, 0.84, 0.92],
      windowGlow: 0.0,
      lanternGlow: 0.25,
      cloudTint: [1.08, 1.08, 1.06],
      groundTint: [1.0, 1.0, 1.0],
      mtnTint: [0.52, 0.68, 0.84],
    },
    night: {
      skyTop: [0.015, 0.03, 0.11],
      skyMid: [0.04, 0.09, 0.24],
      skyHorizon: [0.10, 0.20, 0.40],
      orbColor: [1.15, 1.32, 1.65],
      orbPos: [0.78, 0.80],
      isNight: 1.0,
      rayStrength: 0.12,
      lightDir: [0.46, 0.72, -0.52],
      lightColor: [0.75, 0.96, 1.35],
      skyAmbient: [0.22, 0.34, 0.62],
      groundAmbient: [0.10, 0.16, 0.16],
      rimColor: [0.65, 1.05, 1.55],
      fogColor: [0.08, 0.16, 0.34],
      sunFogColor: [0.22, 0.36, 0.62],
      pipeTint: [0.78, 1.0, 0.86],
      cityTint: [0.16, 0.22, 0.38],
      roofTint: [0.24, 0.32, 0.50],
      windowGlow: 1.0,
      lanternGlow: 1.0,
      cloudTint: [0.36, 0.48, 0.72],
      groundTint: [0.60, 0.74, 0.72],
      mtnTint: [0.12, 0.20, 0.36],
    },
  };

  function compileProgram(gl, vsSrc, fsSrc) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) || "Shader compile error");
      }
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || "Program link error");
    }
    return prog;
  }

  // Deterministic PRNG so scenery layout is rich & reproducible
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function wrappedDelta(z1, z2, span) {
    let dz = Math.abs(z1 - z2) % span;
    if (dz > span * 0.5) dz = span - dz;
    return dz;
  }

  class FlappyRenderer3D {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error("WebGL not supported");
      this.gl = gl;

      this.skyProg = compileProgram(gl, SKY_VS, SKY_FS);
      this.meshProg = compileProgram(gl, MESH_VS, MESH_FS);

      this._cacheLocations();
      this._buildMeshes();

      this.proj = Mat4.create();
      this.view = Mat4.create();
      this.vp = Mat4.create();
      this.model = Mat4.create();
      this.birdModel = Mat4.create();
      this.wingLocal = Mat4.create();
      this.mvp = Mat4.create();
      this.nrmMat = new Float32Array(9);

      // Guaranteed non-overlapping scenery layers
      this.scenerySpan = 96;
      this.lanterns = this._generateLanterns();
      this.trees = this._generateTrees();
      this.buildings = this._generateBuildings();
      this.mountains = this._generateMountains();
      this.clouds = this._generateClouds();
      this.motes = this._generateMotes();
    }

    _cacheLocations() {
      const gl = this.gl;
      this.skyLoc = {
        aPos: gl.getAttribLocation(this.skyProg, "aPos"),
        uSkyTop: gl.getUniformLocation(this.skyProg, "uSkyTop"),
        uSkyMid: gl.getUniformLocation(this.skyProg, "uSkyMid"),
        uSkyHorizon: gl.getUniformLocation(this.skyProg, "uSkyHorizon"),
        uOrbColor: gl.getUniformLocation(this.skyProg, "uOrbColor"),
        uOrbPos: gl.getUniformLocation(this.skyProg, "uOrbPos"),
        uAspect: gl.getUniformLocation(this.skyProg, "uAspect"),
        uIsNight: gl.getUniformLocation(this.skyProg, "uIsNight"),
        uRayStrength: gl.getUniformLocation(this.skyProg, "uRayStrength"),
        uTime: gl.getUniformLocation(this.skyProg, "uTime"),
      };
      this.meshLoc = {
        aPos: gl.getAttribLocation(this.meshProg, "aPos"),
        aNormal: gl.getAttribLocation(this.meshProg, "aNormal"),
        aColor: gl.getAttribLocation(this.meshProg, "aColor"),
        uMVP: gl.getUniformLocation(this.meshProg, "uMVP"),
        uModel: gl.getUniformLocation(this.meshProg, "uModel"),
        uNormalMat: gl.getUniformLocation(this.meshProg, "uNormalMat"),
        uLightDir: gl.getUniformLocation(this.meshProg, "uLightDir"),
        uLightColor: gl.getUniformLocation(this.meshProg, "uLightColor"),
        uSkyAmbient: gl.getUniformLocation(this.meshProg, "uSkyAmbient"),
        uGroundAmbient: gl.getUniformLocation(this.meshProg, "uGroundAmbient"),
        uRimColor: gl.getUniformLocation(this.meshProg, "uRimColor"),
        uFogColor: gl.getUniformLocation(this.meshProg, "uFogColor"),
        uSunFogColor: gl.getUniformLocation(this.meshProg, "uSunFogColor"),
        uFogNear: gl.getUniformLocation(this.meshProg, "uFogNear"),
        uFogFar: gl.getUniformLocation(this.meshProg, "uFogFar"),
        uCamPos: gl.getUniformLocation(this.meshProg, "uCamPos"),
        uShininess: gl.getUniformLocation(this.meshProg, "uShininess"),
        uSpecStrength: gl.getUniformLocation(this.meshProg, "uSpecStrength"),
        uRimStrength: gl.getUniformLocation(this.meshProg, "uRimStrength"),
        uEmissive: gl.getUniformLocation(this.meshProg, "uEmissive"),
        uTint: gl.getUniformLocation(this.meshProg, "uTint"),
        uAlpha: gl.getUniformLocation(this.meshProg, "uAlpha"),
      };
    }

    _buildMeshes() {
      const gl = this.gl;

      this.skyBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

      // 1. Glossy emerald 3D Pipe shaft
      let b = new MeshBuilder();
      b.addCylinder(0, 0, 1, 0, 0.95, 0.95, 26, [0.30, 0.78, 0.24], false, false);
      this.pipeShaft = b.upload(gl);

      // 2. Beveled hollow Pipe cap collar
      b = new MeshBuilder();
      b.addPipeCap(1.12, 0.78, 0.65, 26, [0.36, 0.84, 0.28], [0.56, 0.94, 0.38], [0.06, 0.18, 0.06]);
      this.pipeCap = b.upload(gl);

      // 3. Sculpted 3D Bird body (faces -Z)
      b = new MeshBuilder();
      b.addEllipsoid(0, 0, 0, 0.46, 0.42, 0.56, 14, 18, (ny) =>
        ny < -0.22 ? [0.99, 0.94, 0.70] : ny > 0.35 ? [1.0, 0.82, 0.14] : [0.97, 0.74, 0.10]
      );
      b.addEllipsoid(0, 0.42, -0.14, 0.11, 0.13, 0.19, 6, 8, [0.98, 0.68, 0.08]);
      // Soft rosy cheeks
      b.addEllipsoid(-0.34, -0.02, -0.26, 0.10, 0.08, 0.10, 6, 8, [0.98, 0.56, 0.42]);
      b.addEllipsoid(0.34, -0.02, -0.26, 0.10, 0.08, 0.10, 6, 8, [0.98, 0.56, 0.42]);
      // Expressive eyes + pupils
      b.addEllipsoid(-0.24, 0.14, -0.36, 0.16, 0.17, 0.15, 10, 12, [0.99, 0.99, 0.99]);
      b.addEllipsoid(0.24, 0.14, -0.36, 0.16, 0.17, 0.15, 10, 12, [0.99, 0.99, 0.99]);
      b.addEllipsoid(-0.26, 0.15, -0.49, 0.075, 0.085, 0.06, 8, 10, [0.06, 0.07, 0.10]);
      b.addEllipsoid(0.26, 0.15, -0.49, 0.075, 0.085, 0.06, 8, 10, [0.06, 0.07, 0.10]);
      // Upper & lower beak
      b.addBeakCone(0, 0.01, -0.48, -0.94, 0.19, 0.11, 10, [0.98, 0.44, 0.09]);
      b.addBeakCone(0, -0.09, -0.46, -0.80, 0.14, 0.07, 10, [0.86, 0.30, 0.05]);
      // Tail fan
      b.addBox(0, 0.08, 0.60, 0.28, 0.07, 0.28, [0.94, 0.58, 0.08]);
      b.addBox(0, -0.03, 0.58, 0.22, 0.06, 0.24, [0.86, 0.46, 0.05]);
      this.birdBody = b.upload(gl);

      // 4. Sculpted wings with gold tips
      b = new MeshBuilder();
      b.addEllipsoid(0.26, 0, 0.04, 0.31, 0.08, 0.22, 8, 12, (_, nx) =>
        nx > 0.45 ? [0.98, 0.78, 0.18] : [0.99, 0.95, 0.76]
      );
      this.rightWing = b.upload(gl);

      b = new MeshBuilder();
      b.addEllipsoid(-0.26, 0, 0.04, 0.31, 0.08, 0.22, 8, 12, (_, nx) =>
        nx < -0.45 ? [0.98, 0.78, 0.18] : [0.99, 0.95, 0.76]
      );
      this.leftWing = b.upload(gl);

      // 5. Scrolling ground corridor (length 4 units along Z)
      b = new MeshBuilder();
      b.addBox(0, -0.25, -1.0, 9.0, 0.5, 2.0, [0.38, 0.74, 0.22]);
      b.addBox(0, -0.25, 1.0, 9.0, 0.5, 2.0, [0.31, 0.66, 0.18]);
      b.addBox(-4.95, -0.16, 0, 0.9, 0.68, 4.0, [0.84, 0.78, 0.52]);
      b.addBox(4.95, -0.16, 0, 0.9, 0.68, 4.0, [0.84, 0.78, 0.52]);
      b.addBox(-34.4, -0.30, 0, 58.0, 0.5, 4.0, [0.24, 0.52, 0.20]);
      b.addBox(34.4, -0.30, 0, 58.0, 0.5, 4.0, [0.24, 0.52, 0.20]);
      this.groundSegment = b.upload(gl);

      // 6. Curbside Lantern post + glowing bulb
      b = new MeshBuilder();
      b.addCylinder(0, 0.18, 1.45, 0, 0.08, 0.06, 8, [0.22, 0.26, 0.32], true, false);
      b.addCylinder(0, 1.42, 1.56, 0, 0.16, 0.12, 8, [0.28, 0.32, 0.38], true, true);
      this.lanternPost = b.upload(gl);

      b = new MeshBuilder();
      b.addEllipsoid(0, 1.66, 0, 0.15, 0.15, 0.15, 7, 8, [1.0, 0.88, 0.48]);
      this.lanternOrb = b.upload(gl);

      // 7. Stylized layered 3D Tree
      b = new MeshBuilder();
      b.addCylinder(0, 0, 1.25, 0, 0.22, 0.15, 8, [0.44, 0.28, 0.16], false, false);
      b.addEllipsoid(0, 1.85, 0, 0.92, 0.92, 0.92, 8, 10, [0.20, 0.62, 0.24]);
      b.addEllipsoid(0.42, 1.52, 0.24, 0.56, 0.56, 0.56, 7, 8, [0.26, 0.70, 0.28]);
      b.addEllipsoid(-0.38, 1.58, -0.22, 0.58, 0.54, 0.58, 7, 8, [0.18, 0.56, 0.22]);
      this.treeMesh = b.upload(gl);

      // 8. Architectural building tower body + stepped roof + glow windows
      b = new MeshBuilder();
      b.addBox(0, 0.5, 0, 1, 1, 1, [0.85, 0.88, 0.94]);
      this.unitBox = b.upload(gl);

      b = new MeshBuilder();
      b.addBox(0, 0.5, 0, 1.04, 1, 1.04, [1.0, 0.84, 0.40]);
      this.windowBox = b.upload(gl);

      // 9. Distant faceted Mountain peak
      b = new MeshBuilder();
      b.addMountainPeak(1.0, 1.0, 7, [0.55, 0.62, 0.74], [0.92, 0.94, 0.98]);
      this.mountainMesh = b.upload(gl);

      // 10. Sculpted 3D Cloud cluster (bounded inside rx<=2.4, ry<=1.15, rz<=1.2)
      b = new MeshBuilder();
      b.addEllipsoid(0, 0.05, 0, 1.35, 0.78, 0.98, 9, 12, (ny) =>
        ny < -0.25 ? [0.82, 0.88, 0.96] : [0.99, 0.99, 1.0]
      );
      b.addEllipsoid(-1.12, -0.10, 0.08, 0.95, 0.60, 0.78, 8, 10, (ny) =>
        ny < -0.25 ? [0.80, 0.86, 0.95] : [0.97, 0.98, 1.0]
      );
      b.addEllipsoid(1.12, -0.08, -0.08, 0.98, 0.62, 0.80, 8, 10, (ny) =>
        ny < -0.25 ? [0.80, 0.86, 0.95] : [0.97, 0.98, 1.0]
      );
      b.addEllipsoid(0.18, 0.42, 0.06, 0.84, 0.56, 0.74, 8, 10, [1.0, 1.0, 1.0]);
      this.cloudMesh = b.upload(gl);

      // 11. Glowing score target hoop
      b = new MeshBuilder();
      b.addTorusXY(1.0, 0.06, 28, 10, [1.0, 0.90, 0.36]);
      this.hoopMesh = b.upload(gl);

      // 12. Soft ground shadow disc
      b = new MeshBuilder();
      b.addDiscXZ(1.0, 22, [0.04, 0.08, 0.04]);
      this.shadowDisc = b.upload(gl);

      // 13. Particle & atmospheric mote
      b = new MeshBuilder();
      b.addEllipsoid(0, 0, 0, 0.14, 0.09, 0.14, 5, 6, [1.0, 1.0, 1.0]);
      this.particleMesh = b.upload(gl);
    }

    // ---------------- Guaranteed Non-Overlapping Scenery Generators ----------------
    _generateLanterns() {
      const list = [];
      const countPerSide = 8;
      for (let i = 0; i < countPerSide; i++) {
        const z = -(i / countPerSide) * this.scenerySpan;
        list.push({ x: -4.95, z });
        list.push({ x: 4.95, z });
      }
      return list;
    }

    _generateTrees() {
      const rand = mulberry32(4211);
      const list = [];
      const span = this.scenerySpan;
      // Strict non-overlapping disc placement in |x| ∈ [7.2, 11.4]
      for (let attempt = 0; attempt < 240 && list.length < 24; attempt++) {
        const side = list.length % 2 === 0 ? -1 : 1;
        const x = side * (7.3 + rand() * 4.0);
        const z = -rand() * span;
        const s = 0.82 + rand() * 0.42;
        const r = 1.18 * s;

        let overlaps = false;
        for (const t of list) {
          const dx = x - t.x;
          const dz = wrappedDelta(z, t.z, span);
          if (Math.hypot(dx, dz) < r + t.r + 1.5) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          list.push({ x, z, s, r, ry: rand() * Math.PI * 2 });
        }
      }
      return list;
    }

    _generateBuildings() {
      const rand = mulberry32(7331);
      const list = [];
      const span = this.scenerySpan;
      // Strict AABB non-overlap check (with 2.2u clearance including Z wrap-around)
      // Strict height cap: body + stepped penthouse <= 11.8 (clouds strictly >= 14.8!)
      for (let attempt = 0; attempt < 420 && list.length < 24; attempt++) {
        const side = list.length % 2 === 0 ? -1 : 1;
        const row = (Math.floor(list.length / 2) % 2); // front avenue vs back avenue
        const xBase = row === 0 ? 17.5 : 26.5;
        const x = side * (xBase + (rand() - 0.5) * 3.4);
        const z = -rand() * span;
        const w = 3.0 + rand() * 2.1;
        const d = 3.0 + rand() * 2.1;
        const h = row === 0 ? (4.6 + rand() * 4.8) : (6.2 + rand() * 4.6); // max ~10.8 + 0.9 cap <= 11.7!
        const hasPenthouse = rand() > 0.35;
        const capH = hasPenthouse ? 0.85 : 0.35;

        let overlaps = false;
        for (const b of list) {
          const dx = Math.abs(x - b.x);
          const dz = wrappedDelta(z, b.z, span);
          const minX = (w + b.w) * 0.5 + 2.2;
          const minZ = (d + b.d) * 0.5 + 2.2;
          if (dx < minX && dz < minZ) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          list.push({ x, z, w, d, h, hasPenthouse, capH });
        }
      }
      return list;
    }

    _generateMountains() {
      const list = [];
      const span = this.scenerySpan;
      const count = 8;
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -(i / count) * span;
        list.push({
          x: side * (46 + (i % 3) * 4),
          z,
          r: 10.5 + (i % 3) * 2.2,
          h: 11.5 + ((i * 7) % 5) * 1.4,
          ry: i * 0.9,
        });
      }
      return list;
    }

    _generateClouds() {
      const rand = mulberry32(9917);
      const list = [];
      const span = this.scenerySpan;
      // Strict spatial guarantees:
      // 1) Elevation y ∈ [16.4, 20.6] so lowest cloud bottom >= 14.9 (tallest tower <= 11.8 -> >= 3.1u open sky!)
      // 2) Horizontal |x| ∈ [10.0, 31.0] so closest cloud edge >= 6.4u away from center pipes (x=0)!
      // 3) Strict 3D bounding-sphere clearance >= 3.2u between any two clouds (with Z wrap-around)!
      for (let attempt = 0; attempt < 360 && list.length < 14; attempt++) {
        const side = list.length % 2 === 0 ? -1 : 1;
        const s = 0.88 + rand() * 0.36; // max s = 1.24 -> max halfWidth ~ 2.75, halfHeight ~ 1.25
        const rx = 2.35 * s;
        const ry = 1.05 * s;
        const rz = 1.15 * s;
        const x = side * (10.2 + rand() * 20.0);
        const y = 16.5 + rand() * 4.0;
        const z = -rand() * span;

        let overlaps = false;
        for (const c of list) {
          const dx = Math.abs(x - c.x);
          const dy = Math.abs(y - c.y);
          const dz = wrappedDelta(z, c.z, span);
          if (dx < rx + c.rx + 2.8 && dy < ry + c.ry + 1.6 && dz < rz + c.rz + 3.2) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          list.push({ x, y, z, s, rx, ry, rz });
        }
      }
      return list;
    }

    _generateMotes() {
      const rand = mulberry32(5521);
      const list = [];
      for (let i = 0; i < 24; i++) {
        list.push({
          x: (rand() - 0.5) * 14,
          y: 1.2 + rand() * 8.2,
          z: -rand() * 48,
          phase: rand() * Math.PI * 2,
          size: 0.32 + rand() * 0.26,
        });
      }
      return list;
    }

    resize(width, height, dpr) {
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
    }

    _bindMesh(mesh) {
      const gl = this.gl;
      const loc = this.meshLoc;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(loc.aNormal);
      gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(loc.aColor);
      gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 36, 24);
    }

    _drawMeshMatrix(mesh, modelMat, opts = {}) {
      const gl = this.gl;
      const loc = this.meshLoc;

      Mat4.multiply(this.mvp, this.vp, modelMat);
      Mat4.normalMat3(this.nrmMat, modelMat);

      gl.uniformMatrix4fv(loc.uModel, false, modelMat);
      gl.uniformMatrix4fv(loc.uMVP, false, this.mvp);
      gl.uniformMatrix3fv(loc.uNormalMat, false, this.nrmMat);
      gl.uniform1f(loc.uShininess, opts.shininess ?? 24.0);
      gl.uniform1f(loc.uSpecStrength, opts.spec ?? 0.25);
      gl.uniform1f(loc.uRimStrength, opts.rim ?? 0.45);
      gl.uniform1f(loc.uEmissive, opts.emissive ?? 0.0);
      const tint = opts.tint ?? [1, 1, 1];
      gl.uniform3f(loc.uTint, tint[0], tint[1], tint[2]);
      gl.uniform1f(loc.uAlpha, opts.alpha ?? 1.0);

      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    _drawMesh(mesh, tx, ty, tz, rx, ry, rz, sx, sy, sz, opts = {}) {
      Mat4.fromTRS(this.model, tx, ty, tz, rx, ry, rz, sx, sy, sz);
      this._drawMeshMatrix(mesh, this.model, opts);
    }

    _wrapZ(baseZ, offset, maxZ, span = this.scenerySpan) {
      const m = (((baseZ + offset) % span) + span) % span;
      return m - span + maxZ;
    }

    render(scene) {
      const gl = this.gl;
      const theme = THEMES[scene.themeName] || THEMES.golden;
      const aspect = this.canvas.width / Math.max(1, this.canvas.height);

      const roll = scene.camRoll || 0;
      const upVec = [Math.sin(roll), Math.cos(roll), 0];

      Mat4.perspective(this.proj, (scene.fovDeg || 52) * (Math.PI / 180), aspect, 0.2, 130);
      Mat4.lookAt(this.view, scene.camPos, scene.camTarget, upVec);
      Mat4.multiply(this.vp, this.proj, this.view);

      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      // 1. Cinematic Sky + Sunbeams pass
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      if (this.meshLoc.aPos >= 0) gl.disableVertexAttribArray(this.meshLoc.aPos);
      if (this.meshLoc.aNormal >= 0) gl.disableVertexAttribArray(this.meshLoc.aNormal);
      if (this.meshLoc.aColor >= 0) gl.disableVertexAttribArray(this.meshLoc.aColor);

      gl.useProgram(this.skyProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.enableVertexAttribArray(this.skyLoc.aPos);
      gl.vertexAttribPointer(this.skyLoc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(this.skyLoc.uSkyTop, theme.skyTop);
      gl.uniform3fv(this.skyLoc.uSkyMid, theme.skyMid);
      gl.uniform3fv(this.skyLoc.uSkyHorizon, theme.skyHorizon);
      gl.uniform3fv(this.skyLoc.uOrbColor, theme.orbColor);
      gl.uniform2fv(this.skyLoc.uOrbPos, theme.orbPos);
      gl.uniform1f(this.skyLoc.uAspect, aspect);
      gl.uniform1f(this.skyLoc.uIsNight, theme.isNight);
      gl.uniform1f(this.skyLoc.uRayStrength, theme.rayStrength);
      gl.uniform1f(this.skyLoc.uTime, scene.time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(this.skyLoc.aPos);

      // 2. Opaque 3D world pass
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(this.meshProg);

      const loc = this.meshLoc;
      gl.uniform3fv(loc.uLightDir, theme.lightDir);
      gl.uniform3fv(loc.uLightColor, theme.lightColor);
      gl.uniform3fv(loc.uSkyAmbient, theme.skyAmbient);
      gl.uniform3fv(loc.uGroundAmbient, theme.groundAmbient);
      gl.uniform3fv(loc.uRimColor, theme.rimColor);
      gl.uniform3fv(loc.uFogColor, theme.fogColor);
      gl.uniform3fv(loc.uSunFogColor, theme.sunFogColor);
      gl.uniform1f(loc.uFogNear, 24.0);
      gl.uniform1f(loc.uFogFar, 94.0);
      gl.uniform3fv(loc.uCamPos, scene.camPos);

      // Ground corridor
      const gScroll = scene.scrollZ % 4;
      this._bindMesh(this.groundSegment);
      for (let z = 16; z >= -88; z -= 4) {
        this._drawMesh(this.groundSegment, 0, 0, z + gScroll, 0, 0, 0, 1, 1, 1, {
          spec: 0.05,
          rim: 0.12,
          tint: theme.groundTint,
        });
      }

      // Curbside Lanterns
      this._bindMesh(this.lanternPost);
      for (const l of this.lanterns) {
        const lz = this._wrapZ(l.z, scene.scrollZ, 16);
        this._drawMesh(this.lanternPost, l.x, 0, lz, 0, 0, 0, 1, 1, 1, {
          spec: 0.3,
          rim: 0.4,
        });
      }
      this._bindMesh(this.lanternOrb);
      for (const l of this.lanterns) {
        const lz = this._wrapZ(l.z, scene.scrollZ, 16);
        this._drawMesh(this.lanternOrb, l.x, 0, lz, 0, 0, 0, 1, 1, 1, {
          emissive: 0.35 + theme.lanternGlow * 0.65,
          spec: 0.1,
          rim: 0.2,
        });
      }

      // Flanking Trees
      this._bindMesh(this.treeMesh);
      for (const t of this.trees) {
        const tz = this._wrapZ(t.z, scene.scrollZ, 16);
        this._drawMesh(this.treeMesh, t.x, 0, tz, 0, t.ry, 0, t.s, t.s, t.s, {
          spec: 0.08,
          rim: 0.42,
          tint: theme.groundTint,
        });
      }

      // Distant Misty Mountain Peaks (outside skyline)
      this._bindMesh(this.mountainMesh);
      for (const m of this.mountains) {
        const mz = this._wrapZ(m.z, scene.scrollZ * 0.22, 18);
        this._drawMesh(this.mountainMesh, m.x, 0, mz, 0, m.ry, 0, m.r, m.h, m.r, {
          spec: 0.04,
          rim: 0.35,
          tint: theme.mtnTint,
        });
      }

      // Non-Overlapping Architectural City Towers
      this._bindMesh(this.unitBox);
      for (const b of this.buildings) {
        const bz = this._wrapZ(b.z, scene.scrollZ * 0.58, 18);
        // Main tower shaft
        this._drawMesh(this.unitBox, b.x, 0, bz, 0, 0, 0, b.w, b.h, b.d, {
          spec: 0.16,
          rim: 0.48,
          tint: theme.cityTint,
        });
        // Rooftop architectural ledge / stepped penthouse (total y <= 11.7)
        if (b.hasPenthouse) {
          this._drawMesh(this.unitBox, b.x, b.h, bz, 0, 0, 0, b.w * 0.64, b.capH, b.d * 0.64, {
            spec: 0.2,
            rim: 0.55,
            tint: theme.roofTint,
          });
        } else {
          this._drawMesh(this.unitBox, b.x, b.h, bz, 0, 0, 0, b.w * 1.06, b.capH, b.d * 1.06, {
            spec: 0.2,
            rim: 0.55,
            tint: theme.roofTint,
          });
        }
      }
      if (theme.windowGlow > 0.01) {
        this._bindMesh(this.windowBox);
        for (const b of this.buildings) {
          const bz = this._wrapZ(b.z, scene.scrollZ * 0.58, 18);
          const bands = Math.max(1, Math.floor((b.h - 1.2) / 2.2));
          for (let k = 0; k < bands; k++) {
            const wy = 1.1 + k * 2.2;
            if (wy + 0.6 > b.h) break;
            this._drawMesh(this.windowBox, b.x, wy, bz, 0, 0, 0, b.w, 0.48, b.d, {
              emissive: 0.9 * theme.windowGlow,
              spec: 0.0,
              rim: 0.0,
            });
          }
        }
      }

      // High-Altitude Non-Overlapping 3D Clouds (strictly y >= 14.9, |x| >= 10.2)
      this._bindMesh(this.cloudMesh);
      for (const c of this.clouds) {
        const cz = this._wrapZ(c.z, scene.scrollZ * 0.24, 18);
        const bobY = Math.sin(scene.time * 0.65 + c.x * 0.3) * 0.14;
        this._drawMesh(this.cloudMesh, c.x, c.y + bobY, cz, 0, 0, 0, c.s, c.s, c.s, {
          spec: 0.06,
          rim: 0.68,
          emissive: 0.14,
          tint: theme.cloudTint,
        });
      }

      // Glossy 3D Pipes
      const CAP_H = scene.capHeight;
      this._bindMesh(this.pipeShaft);
      for (const p of scene.pipes) {
        const lowerShaftH = Math.max(0.05, p.gapBottom - CAP_H);
        this._drawMesh(this.pipeShaft, 0, 0, p.z, 0, 0, 0, 1, lowerShaftH, 1, {
          shininess: 52,
          spec: 0.52,
          rim: 0.62,
          tint: theme.pipeTint,
        });
        const upperShaftY = p.gapTop + CAP_H;
        const upperShaftH = Math.max(1.0, 22.0 - upperShaftY);
        this._drawMesh(this.pipeShaft, 0, upperShaftY, p.z, 0, 0, 0, 1, upperShaftH, 1, {
          shininess: 52,
          spec: 0.52,
          rim: 0.62,
          tint: theme.pipeTint,
        });
      }

      this._bindMesh(this.pipeCap);
      for (const p of scene.pipes) {
        this._drawMesh(this.pipeCap, 0, p.gapBottom - CAP_H, p.z, 0, 0, 0, 1, 1, 1, {
          shininess: 58,
          spec: 0.6,
          rim: 0.72,
          tint: theme.pipeTint,
        });
        this._drawMesh(this.pipeCap, 0, p.gapTop + CAP_H, p.z, Math.PI, 0, 0, 1, 1, 1, {
          shininess: 58,
          spec: 0.6,
          rim: 0.72,
          tint: theme.pipeTint,
        });
      }

      // 3D Bird with Squash/Stretch + Hierarchically Articulated Wings
      const bird = scene.bird;
      const sq = bird.squash || 0;
      const sx = 1 - sq * 0.12;
      const sy = 1 + sq * 0.16;
      const sz = 1 - sq * 0.08;
      Mat4.fromTRS(this.birdModel, 0, bird.y, 0, bird.pitch, bird.yaw, bird.roll, sx, sy, sz);
      this._bindMesh(this.birdBody);
      this._drawMeshMatrix(this.birdBody, this.birdModel, {
        shininess: 46,
        spec: 0.44,
        rim: 0.78,
      });

      const wingAngle = bird.wingAngle;
      Mat4.fromTRS(this.wingLocal, 0.38, 0.04, 0.04, 0, 0, wingAngle, 1, 1, 1);
      Mat4.multiply(this.model, this.birdModel, this.wingLocal);
      this._bindMesh(this.rightWing);
      this._drawMeshMatrix(this.rightWing, this.model, {
        shininess: 26,
        spec: 0.25,
        rim: 0.65,
      });

      Mat4.fromTRS(this.wingLocal, -0.38, 0.04, 0.04, 0, 0, -wingAngle, 1, 1, 1);
      Mat4.multiply(this.model, this.birdModel, this.wingLocal);
      this._bindMesh(this.leftWing);
      this._drawMeshMatrix(this.leftWing, this.model, {
        shininess: 26,
        spec: 0.25,
        rim: 0.65,
      });

      // 3D Particles + Floating Sunbeam Dust Motes
      this._bindMesh(this.particleMesh);
      for (const m of this.motes) {
        const mz = this._wrapZ(m.z, scene.scrollZ * 0.45, 10, 48);
        const my = m.y + Math.sin(scene.time * 1.4 + m.phase) * 0.35;
        this._drawMesh(this.particleMesh, m.x, my, mz, 0, scene.time, 0, m.size, m.size, m.size, {
          emissive: 0.95,
          spec: 0,
          rim: 0,
          tint: theme.orbColor,
        });
      }
      for (const pt of scene.particles) {
        const s = pt.size * (1 - pt.life / pt.maxLife);
        if (s <= 0.01) continue;
        this._drawMesh(this.particleMesh, pt.x, pt.y, pt.z, pt.rx, pt.ry, pt.rz, s, s, s, {
          emissive: 0.72,
          spec: 0.2,
          rim: 0.3,
          tint: pt.color,
        });
      }

      // 3. Translucent pass (ground shadows + glowing target hoop)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      this._bindMesh(this.shadowDisc);
      const birdShadowScale = Math.max(0.28, 0.80 - bird.y * 0.055);
      const birdShadowAlpha = Math.max(0.10, 0.44 - bird.y * 0.032);
      this._drawMesh(this.shadowDisc, 0, 0.025, 0, 0, 0, 0, birdShadowScale, 1, birdShadowScale * 1.15, {
        emissive: 1.0,
        spec: 0.0,
        rim: 0.0,
        alpha: birdShadowAlpha,
      });
      for (const p of scene.pipes) {
        this._drawMesh(this.shadowDisc, 0, 0.02, p.z, 0, 0, 0, 1.35, 1, 1.35, {
          emissive: 1.0,
          spec: 0.0,
          rim: 0.0,
          alpha: 0.30,
        });
      }

      this._bindMesh(this.hoopMesh);
      let nextMarked = false;
      for (const p of scene.pipes) {
        const midY = (p.gapBottom + p.gapTop) * 0.5;
        if (!p.passed && !nextMarked) {
          nextMarked = true;
          const pulse = 1.0 + Math.sin(scene.time * 5.8) * 0.045;
          const r = p.gap * 0.36 * pulse;
          this._drawMesh(this.hoopMesh, 0, midY, p.z, 0, 0, scene.time * 0.9, r, r, 1, {
            emissive: 0.95,
            spec: 0.4,
            rim: 0.6,
            tint: [1.0, 0.92, 0.44],
            alpha: 0.78,
          });
        } else if (p.passed && p.ringPop < 1) {
          const r = p.gap * (0.36 + p.ringPop * 0.62);
          this._drawMesh(this.hoopMesh, 0, midY, p.z, 0, 0, p.ringPop * 2.5, r, r, 1, {
            emissive: 1.0,
            spec: 0.2,
            rim: 0.5,
            tint: [0.58, 1.0, 0.80],
            alpha: (1 - p.ringPop) * 0.88,
          });
        }
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    projectToScreen(x, y, z, width, height) {
      return Mat4.project(this.vp, x, y, z, width, height);
    }
  }

  window.FlappyRenderer3D = FlappyRenderer3D;
})();
