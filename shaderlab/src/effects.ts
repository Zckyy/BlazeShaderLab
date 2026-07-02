// Effect definitions. Each effect is a GLSL snippet that mutates uv and/or col.
// Params are named and typed: floats become `float <key>`, colors become `vec3 <key>`
// arguments of the generated function, in declaration order.

export type ParamDef =
  | { key: string; label: string; type?: 'float'; min: number; max: number; step: number; def: number }
  | { key: string; label: string; type: 'color'; def: string }

export interface EffectDef {
  id: string
  name: string
  kind: 'generate' | 'modify'
  params: ParamDef[]
  glsl: string
}

export const GLSL_HELPERS = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + 17.17));
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(13.7, 7.3);
    a *= 0.5;
  }
  return v;
}
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer8(vec2 a) {
  return bayer2(a / 4.0) * 0.0625 + bayer2(a / 2.0) * 0.25 + bayer2(a);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (0.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 palette(float x, float shift) {
  return 0.5 + 0.5 * cos(6.28318 * (x + shift) + vec3(0.0, 2.094, 4.188));
}
`

const f = (key: string, label: string, min: number, max: number, step: number, def: number): ParamDef =>
  ({ key, label, min, max, step, def })
const c = (key: string, label: string, def: string): ParamDef => ({ key, label, type: 'color', def })

export const EFFECTS: EffectDef[] = [
  {
    // Port of Shader Lab's GradientPass (basementstudio/shader-lab):
    // colored points blended by inverse-pow-distance weight, noise domain warp,
    // vortex rotation, animated point motion, ACES tonemap.
    id: 'meshgradient',
    name: 'Mesh Gradient',
    kind: 'generate',
    params: [
      c('colA', 'Color 1', '#ff2d96'),
      c('colB', 'Color 2', '#5c2dff'),
      c('colC', 'Color 3', '#00d5ff'),
      c('colD', 'Color 4', '#ff7a2d'),
      f('falloff', 'Falloff', 0.5, 4, 0.01, 1.85),
      f('speedM', 'Motion Speed', 0, 2, 0.01, 0.2),
      f('motion', 'Motion Amount', 0, 0.6, 0.01, 0.18),
      f('warpAmt', 'Warp', 0, 0.6, 0.01, 0.18),
      f('vortex', 'Vortex', -1, 1, 0.01, 0.12),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 q = (uv - vec2(0.5 * asp2, 0.5)) * 2.0;
      float mt = t * speedM;
      q += warpAmt * 2.0 * vec2(
        fbm(q * 1.4 + mt * 0.1) - 0.5,
        fbm(q * 1.4 + 13.7 + mt * 0.1) - 0.5
      );
      float va = length(q) * vortex;
      q = mat2(cos(va), -sin(va), sin(va), cos(va)) * q;
      vec3 pcols[4] = vec3[4](colA, colB, colC, colD);
      vec3 acc = vec3(0.0);
      float tw = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i + 1);
        vec2 pp = 0.7 * vec2(cos(fi * 1.57 + 0.7), sin(fi * 1.57 + 0.7));
        pp += motion * vec2(
          sin(mt * fi * 0.73 + fi),
          cos(mt * fi * 0.41 + fi * 1.7)
        );
        float d = max(length(q - pp), 0.01);
        float w = 1.0 / pow(d, falloff);
        acc += pcols[i] * w;
        tw += w;
      }
      col = aces(acc / max(tw, 1e-4));
    `,
  },
  {
    id: 'gradient',
    name: 'Linear Gradient',
    kind: 'generate',
    params: [
      c('colA', 'Color A', '#0b0b2a'),
      c('colB', 'Color B', '#ff4d6d'),
      f('angle', 'Angle', 0, 6.28, 0.01, 0.8),
      f('scale', 'Scale', 0.1, 5, 0.01, 1),
      f('speed', 'Speed', 0, 3, 0.01, 0.3),
    ],
    glsl: `
      vec2 dir = vec2(cos(angle), sin(angle));
      float g = dot(uv, dir) * scale + t * speed * 0.3;
      col = mix(colA, colB, 0.5 + 0.5 * sin(g * 6.28318));
    `,
  },
  {
    id: 'cosine',
    name: 'Cosine Gradient',
    kind: 'generate',
    params: [
      f('scale', 'Scale', 0.1, 5, 0.01, 1),
      f('speed', 'Speed', 0, 3, 0.01, 0.3),
      f('shift', 'Hue Shift', 0, 1, 0.01, 0),
    ],
    glsl: `
      float g = dot(uv, vec2(0.7, 0.7)) * scale + t * speed;
      col = palette(g, shift);
    `,
  },
  {
    id: 'noise',
    name: 'FBM Noise',
    kind: 'generate',
    params: [
      c('colA', 'Dark', '#000000'),
      c('colB', 'Light', '#ffffff'),
      f('scale', 'Scale', 0.5, 20, 0.1, 4),
      f('speed', 'Speed', 0, 3, 0.01, 0.4),
      f('contrast', 'Contrast', 0.2, 4, 0.01, 1),
    ],
    glsl: `
      float n = fbm(uv * scale + vec2(t * speed, t * speed * 0.6));
      n = pow(clamp(n, 0.0, 1.0), contrast);
      col = mix(colA, colB, n);
    `,
  },
  {
    id: 'plasma',
    name: 'Plasma',
    kind: 'generate',
    params: [
      f('scale', 'Scale', 1, 20, 0.1, 6),
      f('speed', 'Speed', 0, 3, 0.01, 0.5),
      f('shift', 'Hue Shift', 0, 1, 0.01, 0.2),
    ],
    glsl: `
      vec2 q = uv * scale;
      float v = sin(q.x + t * speed) + sin(q.y + t * speed * 1.3)
              + sin(q.x + q.y + t * speed * 0.7)
              + sin(length(q - scale * 0.5) + t * speed * 1.7);
      col = palette(v * 0.125, shift);
    `,
  },
  {
    id: 'voronoi',
    name: 'Voronoi Cells',
    kind: 'generate',
    params: [
      c('colA', 'Cell', '#12061f'),
      c('colB', 'Edge', '#9dffe0'),
      f('scale', 'Scale', 1, 20, 0.1, 5),
      f('speed', 'Speed', 0, 3, 0.01, 0.6),
      f('edge', 'Edge Width', 0, 1, 0.01, 0.35),
    ],
    glsl: `
      vec2 q = uv * scale;
      vec2 iq = floor(q);
      vec2 fq = fract(q);
      float md = 8.0;
      for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 r = o + 0.5 + 0.5 * sin(t * speed + 6.2831 * hash22(iq + o)) - fq;
        md = min(md, dot(r, r));
      }
      float d = sqrt(md);
      col = mix(colB, colA, smoothstep(edge, edge + 0.35, d));
    `,
  },
  {
    id: 'rings',
    name: 'Rings',
    kind: 'generate',
    params: [
      c('colA', 'Color A', '#000000'),
      c('colB', 'Color B', '#ffffff'),
      f('count', 'Count', 1, 40, 0.5, 12),
      f('speed', 'Speed', -3, 3, 0.01, 0.8),
      f('softness', 'Softness', 0.01, 1, 0.01, 0.2),
    ],
    glsl: `
      float d = length(uv - 0.5);
      float r = sin(d * count * 6.2831 - t * speed);
      col = mix(colA, colB, smoothstep(-softness, softness, r));
    `,
  },
  {
    id: 'waves',
    name: 'Waves',
    kind: 'generate',
    params: [
      c('colA', 'Color A', '#001028'),
      c('colB', 'Color B', '#3dd5ff'),
      f('freq', 'Frequency', 1, 40, 0.5, 10),
      f('speed', 'Speed', -3, 3, 0.01, 1),
      f('wobble', 'Wobble', 0, 3, 0.01, 0.6),
    ],
    glsl: `
      float w = sin(uv.y * freq + sin(uv.x * freq * 0.5 + t) * wobble + t * speed);
      col = mix(colA, colB, 0.5 + 0.5 * w);
    `,
  },
  {
    id: 'pattern',
    name: 'Pattern',
    kind: 'generate',
    params: [
      c('colA', 'Background', '#101014'),
      c('colB', 'Foreground', '#e8e8ec'),
      f('scale', 'Scale', 1, 40, 0.5, 8),
      f('speed', 'Speed', 0, 3, 0.01, 0.3),
      f('style', 'Style', 0, 2, 1, 0),
      f('rotation', 'Rotation', 0, 3.14, 0.01, 0),
    ],
    glsl: `
      mat2 R = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
      vec2 q = R * uv * scale + t * speed * 0.3;
      float v;
      if (style < 0.5) {
        v = mod(floor(q.x) + floor(q.y), 2.0);
      } else if (style < 1.5) {
        v = step(0.5, fract(q.x));
      } else {
        v = 1.0 - step(0.32, length(fract(q) - 0.5));
      }
      col = mix(colA, colB, v);
    `,
  },
  {
    id: 'metaballs',
    name: 'Metaballs',
    kind: 'generate',
    params: [
      c('colA', 'Background', '#05010f'),
      c('colB', 'Blob', '#4dff9d'),
      f('count', 'Count', 1, 8, 1, 4),
      f('bsize', 'Size', 0.05, 0.5, 0.005, 0.16),
      f('speed', 'Speed', 0, 3, 0.01, 0.5),
      f('soft', 'Softness', 0.01, 1, 0.01, 0.15),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 q = uv - vec2(0.5 * asp2, 0.5);
      float fsum = 0.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= count) break;
        float fi = float(i) + 1.0;
        vec2 p = 0.34 * vec2(
          sin(t * speed * (0.6 + fi * 0.31) + fi * 1.7),
          cos(t * speed * (0.5 + fi * 0.23) + fi * 2.3)
        );
        vec2 d = q - p;
        fsum += (bsize * bsize) / max(dot(d, d), 1e-5);
      }
      col = mix(colA, colB, smoothstep(1.0 - soft, 1.0 + soft, fsum));
    `,
  },
  {
    id: 'starfield',
    name: 'Starfield',
    kind: 'generate',
    params: [
      c('tint', 'Star Color', '#ffffff'),
      c('colA', 'Sky', '#020210'),
      f('density', 'Density', 4, 60, 1, 20),
      f('speed', 'Drift', 0, 1, 0.01, 0.05),
      f('twinkle', 'Twinkle', 0, 10, 0.1, 3),
    ],
    glsl: `
      vec3 acc = colA;
      for (int i = 0; i < 3; i++) {
        float fi = float(i) + 1.0;
        vec2 q = uv * density * (0.6 + fi * 0.4) + vec2(t * speed * fi, fi * 17.31);
        vec2 idv = floor(q);
        vec2 fv = fract(q);
        vec2 sp = 0.15 + 0.7 * hash22(idv);
        float b = hash21(idv + 3.1);
        b *= 0.6 + 0.4 * sin(t * twinkle * (0.5 + b) + b * 40.0);
        float star = smoothstep(0.12 * b, 0.0, length(fv - sp));
        acc += star * b * tint / fi;
      }
      col = acc;
    `,
  },
  {
    id: 'caustics',
    name: 'Caustics',
    kind: 'generate',
    params: [
      c('colA', 'Deep', '#00263f'),
      c('colB', 'Light', '#9fe8ff'),
      f('scale', 'Scale', 0.5, 20, 0.1, 5),
      f('speed', 'Speed', 0, 3, 0.01, 0.5),
      f('intensity', 'Sharpness', 0.5, 8, 0.1, 3),
    ],
    glsl: `
      vec2 q = uv * scale;
      float v1 = 1.0 - abs(2.0 * vnoise(q + vec2(t * speed, t * speed * 0.6)) - 1.0);
      float v2 = 1.0 - abs(2.0 * vnoise(q * 1.9 + vec2(-t * speed * 0.7, t * speed * 0.4) + 5.2) - 1.0);
      float ca = pow(clamp(v1 * v2, 0.0, 1.0), intensity);
      col = mix(colA, colB, ca);
    `,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    kind: 'generate',
    params: [
      c('colA', 'Sky', '#02030f'),
      c('colB', 'Band A', '#1fff8f'),
      c('colC', 'Band B', '#7a2dff'),
      f('speed', 'Speed', 0, 3, 0.01, 0.4),
      f('intensity', 'Intensity', 0, 2, 0.01, 0.8),
    ],
    glsl: `
      vec3 acc = colA;
      for (int i = 0; i < 3; i++) {
        float fi = float(i) + 1.0;
        float w = fbm(vec2(uv.x * 1.5 + fi * 7.0, t * speed * 0.4 + fi * 3.3));
        float band = exp(-abs(uv.y - (0.25 + 0.5 * w)) * (14.0 - fi * 3.0));
        acc += mix(colB, colC, w) * band * intensity / fi;
      }
      col = acc;
    `,
  },
  {
    id: 'truchet',
    name: 'Truchet',
    kind: 'generate',
    params: [
      c('colA', 'Background', '#111116'),
      c('colB', 'Line', '#ffd23d'),
      f('scale', 'Scale', 2, 30, 0.5, 8),
      f('width', 'Line Width', 0.02, 0.3, 0.005, 0.08),
      f('rate', 'Flip Rate', 0, 4, 0.05, 0.5),
    ],
    glsl: `
      vec2 q = uv * scale;
      vec2 idv = floor(q);
      vec2 fv = fract(q);
      float flip = step(0.5, hash21(idv + floor(t * rate)));
      fv.x = mix(fv.x, 1.0 - fv.x, flip);
      float d = min(abs(length(fv) - 0.5), abs(length(fv - 1.0) - 0.5));
      col = mix(colA, colB, smoothstep(width, width - 0.03, d));
    `,
  },
  {
    id: 'warp',
    name: 'Noise Warp',
    kind: 'modify',
    params: [
      f('amount', 'Amount', 0, 0.5, 0.005, 0.15),
      f('scale', 'Scale', 0.5, 15, 0.1, 3),
      f('speed', 'Speed', 0, 3, 0.01, 0.5),
    ],
    glsl: `
      uv += amount * vec2(
        fbm(uv * scale + t * speed) - 0.5,
        fbm(uv * scale + 31.4 + t * speed) - 0.5
      ) * 2.0;
    `,
  },
  {
    id: 'kaleido',
    name: 'Kaleidoscope',
    kind: 'modify',
    params: [
      f('segments', 'Segments', 2, 16, 1, 6),
      f('rotation', 'Rotation', -3, 3, 0.01, 0.2),
      f('zoomAmt', 'Zoom', 0.2, 3, 0.01, 1),
    ],
    glsl: `
      vec2 cc = uv - 0.5;
      float a = atan(cc.y, cc.x) + t * rotation;
      float r = length(cc) / max(zoomAmt, 0.001);
      float seg = 6.2831 / max(segments, 1.0);
      a = abs(mod(a, seg) - seg * 0.5);
      uv = vec2(cos(a), sin(a)) * r + 0.5;
    `,
  },
  {
    id: 'pixelate',
    name: 'Pixelate',
    kind: 'modify',
    params: [
      f('cells', 'Cells', 2, 200, 1, 40),
      f('aspectR', 'Aspect', 0.2, 5, 0.01, 1),
    ],
    glsl: `
      vec2 cellsv = vec2(cells, cells * aspectR);
      uv = (floor(uv * cellsv) + 0.5) / cellsv;
    `,
  },
  {
    id: 'flutedglass',
    name: 'Fluted Glass',
    kind: 'modify',
    params: [
      f('ribs', 'Ribs', 4, 120, 1, 24),
      f('refraction', 'Refraction', 0, 1, 0.01, 0.7),
      f('curve', 'Curve', 0, 0.1, 0.001, 0.02),
    ],
    glsl: `
      float fx2 = uv.x * ribs;
      float ph = fract(fx2) - 0.5;
      float flatX = (floor(fx2) + 0.5) / ribs;
      uv.x = mix(uv.x, flatX, refraction);
      uv.y += sin(ph * 3.14159) * curve;
    `,
  },
  {
    id: 'lens',
    name: 'Magnify Lens',
    kind: 'modify',
    params: [
      f('radius', 'Radius', 0.05, 0.8, 0.01, 0.3),
      f('zoomAmt', 'Zoom', 1, 5, 0.05, 2),
      f('orbit', 'Orbit Speed', 0, 2, 0.01, 0.3),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 cen = vec2(0.5 * asp2, 0.5) + 0.22 * vec2(cos(t * orbit), sin(t * orbit * 1.3));
      vec2 d = uv - cen;
      float r = length(d);
      float zf = mix(1.0 / max(zoomAmt, 0.1), 1.0, smoothstep(radius * 0.75, radius, r));
      uv = cen + d * zf;
    `,
  },
  {
    id: 'slice',
    name: 'Slice',
    kind: 'modify',
    params: [
      f('bands', 'Bands', 2, 60, 1, 14),
      f('offset', 'Offset', 0, 0.5, 0.005, 0.08),
      f('rate', 'Rate', 0, 10, 0.1, 2),
    ],
    glsl: `
      float band = floor(uv.y * bands);
      float off = (hash21(vec2(band, floor(t * rate))) - 0.5) * 2.0 * offset;
      uv.x += off;
    `,
  },
  {
    id: 'halftone',
    name: 'Halftone',
    kind: 'modify',
    params: [
      f('dotSize', 'Dot Size', 3, 40, 1, 10),
      f('colorize', 'Colorize', 0, 1, 0.01, 0),
      f('angle', 'Angle', 0, 3.14, 0.01, 0.6),
      c('ink', 'Ink', '#ffffff'),
      c('paper', 'Paper', '#000000'),
    ],
    glsl: `
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      vec2 q = R * gl_FragCoord.xy;
      vec2 g = mod(q, dotSize) - 0.5 * dotSize;
      float r = sqrt(clamp(luma, 0.0, 1.0)) * dotSize * 0.65;
      float m = smoothstep(r, r - 1.5, length(g));
      vec3 inkCol = mix(ink, col / max(luma, 0.001), colorize);
      col = mix(paper, inkCol, m);
    `,
  },
  {
    id: 'ascii',
    name: 'ASCII',
    kind: 'modify',
    params: [
      f('cellSize', 'Cell Size', 6, 40, 1, 14),
      f('colorize', 'Colorize', 0, 1, 0.01, 1),
      c('ink', 'Ink', '#ffffff'),
    ],
    glsl: `
      vec2 g = fract(gl_FragCoord.xy / max(cellSize, 2.0)) * 2.0 - 1.0;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      float dotm = step(length(g), 0.3);
      float plus = max(step(abs(g.x), 0.16), step(abs(g.y), 0.16))
                 * step(max(abs(g.x), abs(g.y)), 0.7);
      float star = max(plus, step(abs(abs(g.x) - abs(g.y)), 0.18)
                 * step(max(abs(g.x), abs(g.y)), 0.7));
      float block = step(max(abs(g.x), abs(g.y)), 0.8);
      float m = luma < 0.15 ? 0.0
              : luma < 0.35 ? dotm
              : luma < 0.6 ? plus
              : luma < 0.85 ? star
              : block;
      col = m * mix(ink, col / max(luma, 0.001), colorize);
    `,
  },
  {
    id: 'threshold',
    name: 'Threshold',
    kind: 'modify',
    params: [
      f('cutoff', 'Cutoff', 0, 1, 0.01, 0.5),
      f('softness', 'Softness', 0, 0.5, 0.01, 0.02),
      c('dark', 'Dark', '#000000'),
      c('light', 'Light', '#ffffff'),
    ],
    glsl: `
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      float m = smoothstep(cutoff - softness - 0.001, cutoff + softness, luma);
      col = mix(dark, light, m);
    `,
  },
  {
    id: 'edges',
    name: 'Edge Detect',
    kind: 'modify',
    params: [
      f('strength', 'Strength', 1, 40, 0.5, 12),
      f('colorize', 'Colorize', 0, 1, 0.01, 0),
      f('invert', 'Invert', 0, 1, 1, 0),
      c('ink', 'Ink', '#ffffff'),
    ],
    glsl: `
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      float e = clamp(length(vec2(dFdx(luma), dFdy(luma))) * strength, 0.0, 1.0);
      e = mix(e, 1.0 - e, invert);
      col = e * mix(ink, col / max(luma, 0.001), colorize);
    `,
  },
  {
    id: 'bloom',
    name: 'Bloom Glow',
    kind: 'modify',
    params: [
      f('strength', 'Strength', 0, 2, 0.01, 0.5),
      f('cutoff', 'Threshold', 0, 1, 0.01, 0.62),
      c('tint', 'Tint', '#ffffff'),
    ],
    glsl: `
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float glow = smoothstep(cutoff, 1.0, luma) * strength;
      col += glow * tint;
    `,
  },
  {
    id: 'chromab',
    name: 'Chromatic Aberration',
    kind: 'modify',
    params: [
      f('amount', 'Amount', 0, 3, 0.01, 1),
      f('radial', 'Radial', 0, 1, 0.01, 1),
    ],
    glsl: `
      vec2 sc = gl_FragCoord.xy / u_res - 0.5;
      vec2 o = mix(vec2(1.0, 0.0), sc * 2.0, radial) * amount * 8.0;
      col.r += dFdx(col.r) * o.x + dFdy(col.r) * o.y;
      col.b -= dFdx(col.b) * o.x + dFdy(col.b) * o.y;
    `,
  },
  {
    id: 'hueshift',
    name: 'Hue Shift',
    kind: 'modify',
    params: [
      f('shift', 'Shift', 0, 1, 0.01, 0.3),
      f('animate', 'Animate', 0, 2, 0.01, 0),
      f('saturation', 'Saturation', 0, 2, 0.01, 1),
    ],
    glsl: `
      float h = (shift + t * animate) * 6.2831;
      vec3 k = vec3(0.57735);
      col = col * cos(h) + cross(k, col) * sin(h) + k * dot(k, col) * (1.0 - cos(h));
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, saturation);
    `,
  },
  {
    id: 'posterize',
    name: 'Posterize',
    kind: 'modify',
    params: [
      f('levels', 'Levels', 2, 16, 1, 4),
      f('gam', 'Gamma', 0.2, 3, 0.01, 1),
    ],
    glsl: `
      col = pow(max(col, 0.0), vec3(gam));
      col = floor(col * levels) / max(levels - 1.0, 1.0);
    `,
  },
  {
    id: 'dither',
    name: 'Dithering',
    kind: 'modify',
    params: [
      f('pxSize', 'Pixel Size', 1, 16, 1, 3),
      f('levels', 'Levels', 2, 16, 1, 3),
      f('spread', 'Spread', 0, 2, 0.01, 1),
    ],
    glsl: `
      vec2 px = floor(gl_FragCoord.xy / max(pxSize, 1.0));
      float d = (bayer8(px) - 0.5) * spread;
      float lv = max(levels - 1.0, 1.0);
      col = floor(col * lv + d + 0.5) / lv;
    `,
  },
  {
    id: 'crt',
    name: 'CRT',
    kind: 'modify',
    params: [
      f('curvature', 'Curvature', 0, 2, 0.01, 0.5),
      f('scanlines', 'Scanlines', 0, 1, 0.01, 0.35),
      f('rgbMask', 'RGB Mask', 0, 1, 0.01, 0.4),
      f('flicker', 'Flicker', 0, 0.3, 0.01, 0),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 suv = gl_FragCoord.xy / u_res;
      vec2 sc = suv - 0.5;
      sc *= 1.0 + curvature * dot(sc, sc) * 1.5;
      suv = sc + 0.5;
      uv = suv * vec2(asp2, 1.0);
      col *= 1.0 - scanlines * (0.5 + 0.5 * sin(suv.y * u_res.y * 3.14159 * 0.5));
      float m = mod(floor(gl_FragCoord.x / 2.0), 3.0);
      vec3 mask = m < 1.0 ? vec3(1.0, 0.7, 0.7)
                : m < 2.0 ? vec3(0.7, 1.0, 0.7)
                : vec3(0.7, 0.7, 1.0);
      col *= mix(vec3(1.0), mask, rgbMask * 0.8);
      col *= 1.0 - flicker * (0.5 + 0.5 * sin(t * 47.0));
      vec2 bd = smoothstep(vec2(-0.005), vec2(0.02), suv)
              * smoothstep(vec2(-0.005), vec2(0.02), 1.0 - suv);
      col *= bd.x * bd.y;
    `,
  },
  {
    id: 'vignette',
    name: 'Vignette',
    kind: 'modify',
    params: [
      f('strength', 'Strength', 0, 2, 0.01, 0.8),
      f('radius', 'Radius', 0.1, 1.5, 0.01, 0.75),
      f('softness', 'Softness', 0.05, 1, 0.01, 0.45),
      c('tint', 'Tint', '#000000'),
    ],
    glsl: `
      float d = length(uv - 0.5) / 0.7071;
      float v = smoothstep(radius, radius - softness, d);
      col = mix(col, tint, (1.0 - v) * clamp(strength, 0.0, 1.0));
    `,
  },
  {
    id: 'grain',
    name: 'Film Grain',
    kind: 'modify',
    params: [
      f('amount', 'Amount', 0, 0.5, 0.005, 0.08),
      f('gsize', 'Size', 1, 8, 0.1, 1),
    ],
    glsl: `
      float g = hash21(floor(uv * u_res / max(gsize, 1.0)) + fract(t) * 100.0);
      col += (g - 0.5) * amount;
    `,
  },
]

export const EFFECT_MAP = new Map(EFFECTS.map((e) => [e.id, e]))

export function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '')
  const v = n.length === 3 ? n.split('').map((ch) => ch + ch).join('') : n.padEnd(6, '0').slice(0, 6)
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ]
}
