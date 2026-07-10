import { FONTS, DEFAULT_FONT, TEXT_STYLES } from './fonts.ts'

// Effect definitions. Each effect is a GLSL snippet that mutates uv and/or col.
// Params are named and typed: floats become `float <key>`, colors become `vec3 <key>`
// arguments of the generated function, in declaration order.

export type ParamDef =
  // xy pairs two float params (marked 'x' and 'y', keys differing only in the
  // trailing letter) into a single 2D pad control in the UI
  | { key: string; label: string; type?: 'float'; min: number; max: number; step: number; def: number; xy?: 'x' | 'y' }
  | { key: string; label: string; type: 'color'; def: string }
  | { key: string; label: string; type: 'text'; def: string }
  // image params hold a data URL uploaded by the user; they feed the layer's
  // texture (CPU side) like text params
  | { key: string; label: string; type: 'image'; def: string }
  | { key: string; label: string; type: 'select'; options: string[]; def: string; uniform?: boolean }

// text/select params configure the layer's texture (CPU side) rather than
// becoming shader uniforms — except select params marked `uniform: true`,
// which reach the shader as a float holding the selected option's index
export const isUniformParam = (p: ParamDef) =>
  p.type !== 'text' && p.type !== 'image' && (p.type !== 'select' || p.uniform === true)

export interface EffectDef {
  id: string
  name: string
  kind: 'generate' | 'modify'
  params: ParamDef[]
  glsl: string
  // effect samples a per-layer canvas texture (passed as `sampler2D tex`)
  texture?: boolean
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
// pixel-grid effects (ASCII, Dither, Voxel) size their cells in raw screen
// pixels; without this they look fine at the editor's canvas size but turn
// into giant blocks at small export resolutions. Scaling by canvas height
// against a 1080p reference keeps the same slider value looking the same
// density at any output size.
float pxScale() {
  return max(u_res.y, 1.0) / 1080.0;
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (0.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 palette(float x, float shift) {
  return 0.5 + 0.5 * cos(6.28318 * (x + shift) + vec3(0.0, 2.094, 4.188));
}
vec2 hexCenterPointy(vec2 p, float s) {
  float qf = (p.x * 0.57735026919 - p.y / 3.0) / s;
  float rf = (p.y * 0.66666666667) / s;
  float sf = -qf - rf;
  float qr = floor(qf + 0.5);
  float rr = floor(rf + 0.5);
  float sr = floor(sf + 0.5);
  float qd = abs(qr - qf);
  float rd = abs(rr - rf);
  float sd = abs(sr - sf);
  if (qd > rd && qd > sd) {
    qr = -rr - sr;
  } else if (rd > sd) {
    rr = -qr - sr;
  }
  return vec2((qr * 1.73205080757 + rr * 0.86602540378) * s, rr * 1.5 * s);
}
vec3 permute289(vec3 x) { return mod((x * 34.0 + 1.0) * x, 289.0); }
float snoise2(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute289(permute289(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float voro2(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float md = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + hash22(ip + o) - fp;
    md = min(md, dot(r, r));
  }
  return sqrt(md);
}
// signed noise in [-1, 1]; mode: 0 simplex, 1 value, 2 ridge, 3 turbulence, 4 voronoi
float warpNoise(vec2 p, float mode) {
  if (mode < 0.5) return snoise2(p);
  if (mode < 1.5) return fbm(p) * 2.0 - 1.0;
  if (mode < 2.5) return 1.0 - 2.0 * abs(fbm(p) * 2.0 - 1.0);
  if (mode < 3.5) return abs(snoise2(p)) * 2.0 - 1.0;
  return voro2(p) * 2.0 - 1.0;
}
vec2 rot2d(vec2 v, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * v;
}
vec3 tonemapReinhard(vec3 x) { return x / (1.0 + x); }
vec3 uncharted2Curve(vec3 x) {
  float A = 0.15; float B = 0.5; float C = 0.1; float D = 0.2; float E = 0.02; float F = 0.3;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}
vec3 tonemapFilmic(vec3 c) {
  return clamp(uncharted2Curve(c * 2.0) / uncharted2Curve(vec3(11.2)), 0.0, 1.0);
}
vec3 tonemapCinematic(vec3 x) {
  x = max(vec3(0.0), x - 0.004);
  return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
}
// mode: 0 aces, 1 reinhard, 2 filmic, 3 cinematic, 4 none
vec3 applyTonemap(vec3 c, float mode) {
  if (mode < 0.5) return aces(c);
  if (mode < 1.5) return tonemapReinhard(c);
  if (mode < 2.5) return tonemapFilmic(c);
  if (mode < 3.5) return tonemapCinematic(c);
  return clamp(c, 0.0, 1.0);
}
`

const f = (key: string, label: string, min: number, max: number, step: number, def: number) =>
  ({ key, label, min, max, step, def }) satisfies ParamDef
const c = (key: string, label: string, def: string): ParamDef => ({ key, label, type: 'color', def })

export const EFFECTS: EffectDef[] = [
  {
    // Port of Shader Lab's GradientPass (basementstudio/shader-lab):
    // 2-5 positionable weighted color points blended by inverse-pow-distance,
    // iterated noise domain warp (selectable noise), vortex rotation, animated
    // point motion, selectable tonemap, glow.
    id: 'meshgradient',
    name: 'Mesh Gradient',
    kind: 'generate',
    params: [
      f('points', 'Points', 2, 5, 1, 4),
      c('col1', 'Color 1', '#ff2d96'),
      { ...f('p1x', 'Point 1 Position', -1.2, 1.2, 0.01, -0.45), xy: 'x' as const },
      { ...f('p1y', 'Point 1 Y', -1.2, 1.2, 0.01, 0.54), xy: 'y' as const },
      f('w1', 'Weight 1', 0, 3, 0.01, 1),
      c('col2', 'Color 2', '#5c2dff'),
      { ...f('p2x', 'Point 2 Position', -1.2, 1.2, 0.01, -0.54), xy: 'x' as const },
      { ...f('p2y', 'Point 2 Y', -1.2, 1.2, 0.01, -0.45), xy: 'y' as const },
      f('w2', 'Weight 2', 0, 3, 0.01, 1),
      c('col3', 'Color 3', '#00d5ff'),
      { ...f('p3x', 'Point 3 Position', -1.2, 1.2, 0.01, 0.45), xy: 'x' as const },
      { ...f('p3y', 'Point 3 Y', -1.2, 1.2, 0.01, -0.53), xy: 'y' as const },
      f('w3', 'Weight 3', 0, 3, 0.01, 1),
      c('col4', 'Color 4', '#ff7a2d'),
      { ...f('p4x', 'Point 4 Position', -1.2, 1.2, 0.01, 0.54), xy: 'x' as const },
      { ...f('p4y', 'Point 4 Y', -1.2, 1.2, 0.01, 0.45), xy: 'y' as const },
      f('w4', 'Weight 4', 0, 3, 0.01, 1),
      c('col5', 'Color 5', '#ffffff'),
      { ...f('p5x', 'Point 5 Position', -1.2, 1.2, 0.01, 0), xy: 'x' as const },
      { ...f('p5y', 'Point 5 Y', -1.2, 1.2, 0.01, 0), xy: 'y' as const },
      f('w5', 'Weight 5', 0, 3, 0.01, 1),
      f('falloff', 'Falloff', 0.5, 4, 0.01, 1.85),
      f('speedM', 'Motion Speed', 0, 2, 0.01, 0.2),
      f('motion', 'Motion Amount', 0, 0.6, 0.01, 0.18),
      { key: 'noiseType', label: 'Warp Noise', type: 'select', uniform: true,
        options: ['Simplex', 'Value', 'Ridge', 'Turbulence', 'Voronoi'], def: 'Simplex' },
      f('warpAmt', 'Warp', 0, 0.6, 0.01, 0.18),
      f('warpScale', 'Warp Scale', 0.1, 4, 0.01, 1.4),
      f('warpIter', 'Warp Iterations', 1, 5, 1, 1),
      f('warpDecay', 'Warp Decay', 0.1, 3, 0.01, 1),
      f('warpBias', 'Warp Bias', 0, 1, 0.01, 0.5),
      f('seed', 'Seed', 0, 100, 1, 0),
      f('vortex', 'Vortex', -1, 1, 0.01, 0.12),
      { key: 'tonemap', label: 'Tonemap', type: 'select', uniform: true,
        options: ['ACES', 'Reinhard', 'Filmic', 'Cinematic', 'None'], def: 'ACES' },
      f('glowStr', 'Glow Strength', 0, 1, 0.01, 0.18),
      f('glowThr', 'Glow Threshold', 0, 1, 0.01, 0.62),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 q = (uv - vec2(0.5 * asp2, 0.5)) * 2.0;
      float mt = t * speedM;
      for (int i = 1; i <= 5; i++) {
        float fi = float(i);
        if (fi > warpIter + 0.5) break;
        float strength = warpAmt / pow(fi, warpDecay);
        vec2 wp = q * warpScale + seed * 73.7;
        float nx = warpNoise(wp + vec2(0.0, mt * 0.1 + fi * 100.0), noiseType);
        float ny = warpNoise(wp + vec2(13.7, 7.1 + mt * 0.1 + fi * 200.0), noiseType);
        q.x += strength * nx * warpBias * 2.0;
        q.y += strength * ny * (1.0 - warpBias) * 2.0;
      }
      float va = length(q) * vortex;
      q = mat2(cos(va), -sin(va), sin(va), cos(va)) * q;
      vec3 pcols[5] = vec3[5](col1, col2, col3, col4, col5);
      vec2 ppos[5] = vec2[5](vec2(p1x, p1y), vec2(p2x, p2y), vec2(p3x, p3y), vec2(p4x, p4y), vec2(p5x, p5y));
      float pws[5] = float[5](w1, w2, w3, w4, w5);
      vec3 acc = vec3(0.0);
      float tw = 0.0;
      for (int i = 0; i < 5; i++) {
        float fi = float(i + 1);
        float act = step(fi, points + 0.5);
        vec2 pp = ppos[i] + motion * vec2(
          sin(mt * fi * 0.73 + fi),
          cos(mt * fi * 0.41 + fi * 1.7)
        );
        float d = max(length(q - pp), 0.01);
        float w = pws[i] * act / pow(d, falloff);
        acc += pcols[i] * w;
        tw += w;
      }
      col = applyTonemap(acc / max(tw, 1e-4), tonemap);
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += smoothstep(glowThr, 1.0, luma) * glowStr;
      col = clamp(col, 0.0, 1.0);
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
    id: 'marbleagate',
    name: 'Marble / Agate',
    kind: 'generate',
    params: [
      c('base', 'Base', '#111018'),
      c('veinA', 'Vein A', '#f2efe5'),
      c('veinB', 'Vein B', '#54d3c2'),
      c('accent', 'Accent', '#d66bff'),
      f('scale', 'Scale', 0.5, 18, 0.1, 5.2),
      f('rings', 'Rings', 0, 16, 0.1, 5.5),
      f('warp', 'Warp', 0, 3, 0.01, 1.25),
      f('turbulence', 'Turbulence', 0, 2, 0.01, 0.75),
      f('sharpness', 'Sharpness', 0.2, 8, 0.1, 2.6),
      f('contrast', 'Contrast', 0.5, 4, 0.01, 1.4),
      f('angle', 'Angle', 0, 6.28, 0.01, 0.45),
      f('speed', 'Speed', -2, 2, 0.01, 0.22),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2, 0.5);
      mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      vec2 q = R * p * scale;

      float flow = t * speed;
      float n1 = fbm(q * 0.9 + vec2(flow, -flow * 0.35));
      float n2 = fbm(q * 2.1 + vec2(-flow * 0.6, flow * 0.4) + n1 * 4.0);
      q += warp * vec2(n1 - 0.5, n2 - 0.5);

      float radial = length(p * vec2(1.0 / max(asp2, 0.001), 1.0));
      float strata = q.x + n1 * turbulence * 3.0 + radial * rings;
      float bands = 0.5 + 0.5 * sin(strata * 6.28318);
      bands = pow(clamp(bands, 0.0, 1.0), sharpness);

      float fine = fbm(q * 4.0 + n2 * 2.0 + flow);
      float vein = smoothstep(0.5, 0.98, bands * (0.55 + fine));
      float lace = smoothstep(0.68, 0.72, abs(fract(strata + fine * 0.35) - 0.5));
      float depth = pow(clamp(mix(bands, fine, 0.35), 0.0, 1.0), contrast);

      vec3 stone = mix(base, veinB, depth * 0.75);
      stone = mix(stone, veinA, vein);
      stone = mix(stone, accent, lace * (0.25 + 0.75 * fine));
      col = clamp(stone, 0.0, 1.0);
    `,
  },
  {
    id: 'topomap',
    name: 'Topographic Map',
    kind: 'generate',
    params: [
      c('low', 'Lowland', '#102d2a'),
      c('high', 'Highland', '#e5d7a3'),
      c('lineCol', 'Contour', '#f8f3dc'),
      c('water', 'Water', '#153d72'),
      f('scale', 'Scale', 0.5, 18, 0.1, 5),
      f('contours', 'Contours', 3, 40, 1, 16),
      f('lineWidth', 'Line Width', 0.005, 0.2, 0.005, 0.045),
      f('terrace', 'Terrace', 0, 1, 0.01, 0.35),
      f('roughness', 'Roughness', 0, 2, 0.01, 0.8),
      f('waterLevel', 'Water Level', 0, 1, 0.01, 0.28),
      f('angle', 'Angle', 0, 6.28, 0.01, 0.2),
      f('speed', 'Drift', -2, 2, 0.01, 0.08),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2, 0.5);
      mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      vec2 q = R * p * scale + vec2(t * speed, -t * speed * 0.6);

      float broad = fbm(q * 0.72);
      float detail = fbm(q * 2.4 + broad * 3.0 + 19.7);
      float height = clamp(mix(broad, detail, roughness * 0.45), 0.0, 1.0);
      height = smoothstep(0.02, 0.98, height);

      float banded = floor(height * contours) / max(contours, 1.0);
      float terrain = mix(height, banded, terrace);
      vec3 land = mix(low, high, terrain);
      land *= 0.82 + 0.28 * detail;

      float waterMask = 1.0 - smoothstep(waterLevel - 0.025, waterLevel + 0.025, height);
      vec3 waterCol = water * (0.72 + 0.28 * fbm(q * 6.0 + t * speed));
      vec3 mapCol = mix(land, waterCol, waterMask);

      float contourPos = abs(fract(height * contours) - 0.5);
      float major = step(0.985, fract(height * contours * 0.2));
      float width = lineWidth * mix(1.0, 1.9, major);
      float line = smoothstep(width, 0.0, contourPos);
      line *= smoothstep(waterLevel + 0.015, waterLevel + 0.08, height);

      float shore = smoothstep(0.035, 0.0, abs(height - waterLevel));
      mapCol = mix(mapCol, lineCol, max(line, shore * 0.65));
      col = clamp(mapCol, 0.0, 1.0);
    `,
  },
  {
    id: 'inkwash',
    name: 'Ink Wash',
    kind: 'generate',
    params: [
      c('paper', 'Paper', '#f2ead8'),
      c('ink', 'Ink', '#111018'),
      c('wash', 'Wash', '#4d5a73'),
      c('stain', 'Stain', '#b46a4a'),
      f('scale', 'Scale', 0.5, 16, 0.1, 4.2),
      f('blooms', 'Blooms', 1, 18, 0.1, 7),
      f('bleed', 'Bleed', 0, 3, 0.01, 1.15),
      f('edge', 'Edge Darkening', 0, 3, 0.01, 1.3),
      f('pigment', 'Pigment', 0, 2, 0.01, 0.7),
      f('paperGrain', 'Paper Grain', 0, 0.5, 0.005, 0.12),
      f('contrast', 'Contrast', 0.4, 5, 0.01, 1.7),
      f('speed', 'Drift', -2, 2, 0.01, 0.12),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2, 0.5);
      vec2 q = p * scale;
      float mt = t * speed;

      float n1 = fbm(q * 0.65 + vec2(mt, -mt * 0.35));
      float n2 = fbm(q * 1.6 + n1 * 3.2 + vec2(-mt * 0.45, mt * 0.25));
      q += bleed * vec2(n1 - 0.5, n2 - 0.5);

      float washField = fbm(q * 0.75 + n2 * 2.0);
      float bloomField = 0.5 + 0.5 * sin((q.x + q.y * 0.45 + n1 * 3.0) * blooms);
      float bloom = smoothstep(0.28, 0.92, washField * 0.7 + bloomField * 0.45);
      bloom = pow(clamp(bloom, 0.0, 1.0), contrast);

      float rim = smoothstep(0.08, 0.0, abs(bloom - 0.48)) * edge;
      float gran = hash21(floor(gl_FragCoord.xy * 0.75) + floor(t * 3.0));
      float paperNoise = fbm(uv * u_res / 180.0);
      vec3 paperCol = paper * (1.0 + (paperNoise - 0.5) * paperGrain);

      vec3 washCol = mix(wash, ink, bloom * 0.8 + rim * 0.25);
      washCol *= 0.82 + pigment * 0.25 * gran;
      vec3 stainCol = mix(washCol, stain, smoothstep(0.72, 1.0, n2) * 0.35);
      float alpha = clamp(bloom * 0.82 + rim * 0.35, 0.0, 1.0);

      col = mix(paperCol, stainCol, alpha);
      col = clamp(col, 0.0, 1.0);
    `,
  },
  {
    id: 'watercolor',
    name: 'Watercolor Bloom',
    kind: 'generate',
    params: [
      c('paper', 'Paper', '#f7efe0'),
      c('washA', 'Wash A', '#5fb7d4'),
      c('washB', 'Wash B', '#d66bff'),
      c('washC', 'Wash C', '#ffd166'),
      c('edgeCol', 'Wet Edge', '#4a356b'),
      f('scale', 'Scale', 0.5, 16, 0.1, 3.6),
      f('blooms', 'Blooms', 1, 18, 0.1, 6.5),
      f('bleed', 'Bleed', 0, 3, 0.01, 1.35),
      f('wetEdge', 'Wet Edge', 0, 3, 0.01, 1.15),
      f('granulation', 'Granulation', 0, 2, 0.01, 0.65),
      f('paperGrain', 'Paper Grain', 0, 0.5, 0.005, 0.1),
      f('opacity', 'Pigment', 0, 2, 0.01, 0.95),
      f('speed', 'Drift', -2, 2, 0.01, 0.08),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2, 0.5);
      vec2 q = p * scale;
      float mt = t * speed;

      float paperNoise = fbm(uv * u_res / 150.0);
      float tooth = hash21(floor(gl_FragCoord.xy * 0.65));
      vec3 paperCol = paper * (1.0 + (paperNoise - 0.5) * paperGrain + (tooth - 0.5) * paperGrain * 0.55);

      float n1 = fbm(q * 0.72 + vec2(mt, -mt * 0.32));
      float n2 = fbm(q * 1.55 + n1 * 3.8 + vec2(-mt * 0.45, mt * 0.18));
      vec2 warped = q + bleed * vec2(n1 - 0.5, n2 - 0.5);

      float softPool = fbm(warped * 0.62 + n2 * 1.6);
      float bloomWave = 0.5 + 0.5 * sin((warped.x * 0.82 + warped.y * 0.38 + n1 * 3.2) * blooms);
      float pool = smoothstep(0.2, 0.92, softPool * 0.72 + bloomWave * 0.38);
      float feather = fbm(warped * 3.2 + pool * 2.5);
      pool *= 0.72 + 0.38 * feather;
      pool = clamp(pool, 0.0, 1.0);

      float edgeMask = smoothstep(0.08, 0.0, abs(pool - 0.48));
      float backrun = smoothstep(0.58, 0.96, fbm(warped * 2.0 - n1 * 2.2 + 31.0))
        * smoothstep(0.18, 0.92, pool);
      float gran = (hash21(floor(gl_FragCoord.xy / 2.0) + floor(t * 2.0)) - 0.5)
        * granulation * smoothstep(0.12, 0.95, pool);

      vec3 washMix = mix(washA, washB, n2);
      washMix = mix(washMix, washC, smoothstep(0.58, 1.0, n1) * 0.55);
      washMix *= 1.0 + gran;
      vec3 stained = mix(washMix, edgeCol, edgeMask * wetEdge * 0.45);
      stained = mix(stained, paperCol, backrun * 0.28);

      float alpha = clamp(pool * opacity + edgeMask * wetEdge * 0.18, 0.0, 1.0);
      col = mix(paperCol, stained, alpha);
      col = clamp(col, 0.0, 1.0);
    `,
  },
  {
    id: 'cloudedglass',
    name: 'Clouded Glass',
    kind: 'generate',
    params: [
      c('glass', 'Glass Tint', '#bfe7f5'),
      c('frost', 'Frost', '#f4fbff'),
      c('shadow', 'Shadow', '#40606f'),
      c('stain', 'Condensation', '#8fb7c6'),
      f('scale', 'Scale', 0.5, 16, 0.1, 4.5),
      f('clouds', 'Clouds', 0, 2, 0.01, 0.9),
      f('haze', 'Haze', 0, 2, 0.01, 0.85),
      f('contrast', 'Contrast', 0.4, 4, 0.01, 1.35),
      f('speed', 'Drift', -2, 2, 0.01, 0.08),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2, 0.5);
      vec2 q = p * scale;
      float mt = t * speed;

      float n1 = fbm(q * 0.55 + vec2(mt * 0.35, -mt * 0.18));
      float n2 = fbm(q * 1.35 + n1 * 3.5 + vec2(-mt * 0.22, mt * 0.12));
      float n3 = fbm(q * 3.1 + n2 * 2.2 + 17.0);

      float cloudy = smoothstep(0.18, 0.96, n1 * clouds + n2 * 0.55);
      cloudy = pow(clamp(cloudy, 0.0, 1.0), contrast);
      float milk = smoothstep(0.2, 0.92, cloudy + n3 * 0.22);

      float condensation = smoothstep(0.58, 0.98, fbm(q * 2.2 + n1 * 2.6 - mt * 0.18))
        * smoothstep(0.12, 0.88, cloudy)
        * haze * 0.28;
      float softVeil = fbm(q * 5.5 + n2 * 1.8 + 43.0) * haze * 0.08;

      vec3 baseCol = mix(glass, frost, milk * haze);
      baseCol = mix(baseCol, shadow, (1.0 - cloudy) * 0.28);
      baseCol = mix(baseCol, stain, condensation);
      baseCol += frost * softVeil;
      baseCol *= 0.9 + 0.18 * n3;
      col = clamp(baseCol, 0.0, 1.0);
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
    // Port of Paper Shaders' Swirl (paper-design/shaders, MIT):
    // twisting color bands radiating from the center with noise fraying.
    id: 'swirl',
    name: 'Swirl',
    kind: 'generate',
    params: [
      c('colorBack', 'Background', '#150b22'),
      c('col1', 'Color 1', '#7c3aed'),
      c('col2', 'Color 2', '#ff6b62'),
      c('col3', 'Color 3', '#f5c25b'),
      c('col4', 'Color 4', '#2dd4bf'),
      c('col5', 'Color 5', '#150b22'),
      f('bands', 'Bands', 1, 12, 1, 5),
      // twist beyond ~0.5 pushes the visible bands off-canvas; the library
      // default is 0.1
      f('twist', 'Twist', 0, 1, 0.01, 0.15),
      f('center', 'Center', 0, 1, 0.01, 0.3),
      f('proportion', 'Proportion', 0, 1, 0.01, 0.5),
      f('softness', 'Softness', 0, 1, 0.01, 0.55),
      f('fray', 'Noise', 0, 1, 0.01, 0.25),
      f('frayFreq', 'Noise Frequency', 0, 1, 0.01, 0.5),
      f('scale', 'Scale', 0.05, 4, 0.01, 1),
      f('speed', 'Speed', -2, 2, 0.01, 0.35),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      // match Paper's object UV (fit: cover): longest axis spans [-0.5, 0.5]
      vec2 q = (uv - vec2(0.5 * asp2, 0.5)) / max(asp2, 1.0);
      q /= max(scale, 0.001);
      float l = max(length(q), 1e-4);
      float tt = t * speed;
      float angle = ceil(bands) * atan(q.y, q.x) + tt;
      float angleNorm = angle / 6.28318530718;
      float tw = 3.0 * clamp(twist, 0.0, 1.0);
      float shape = fract(pow(l, -tw) + angleNorm);
      shape = 1.0 - abs(2.0 * shape - 1.0);
      shape += fray * snoise2(15.0 * frayFreq * frayFreq * q);
      float mid = smoothstep(0.2, 0.2 + 0.8 * center, pow(l, tw));
      shape = mix(0.0, shape, mid);
      float prop = clamp(proportion, 0.0, 1.0);
      float expo = mix(0.25, 1.0, prop * 2.0);
      expo = mix(expo, 10.0, max(0.0, prop * 2.0 - 1.0));
      shape = pow(max(shape, 0.0), expo);
      float mixer = shape * 5.0;
      vec3 cols5[5] = vec3[5](col1, col2, col3, col4, col5);
      vec3 gradient = col1;
      float outerShape = 0.0;
      for (int i = 1; i <= 5; i++) {
        float m = clamp(mixer - float(i - 1), 0.0, 1.0);
        float aa = fwidth(m);
        m = smoothstep(0.5 - 0.5 * softness - aa, 0.5 + 0.5 * softness + aa, m);
        if (i == 1) outerShape = m;
        gradient = mix(gradient, cols5[i - 1], m);
      }
      float midAA = 0.1 * fwidth(pow(l, -tw));
      float outerMid = smoothstep(0.2, 0.2 + midAA, pow(l, tw));
      outerShape = mix(0.0, outerShape, outerMid);
      col = mix(colorBack, gradient, clamp(outerShape, 0.0, 1.0));
    `,
  },
  {
    // Port of Paper Shaders' NeuroNoise (paper-design/shaders, MIT):
    // glowing neural filaments from 15 rotated sine layers.
    id: 'neuronoise',
    name: 'Neuro Noise',
    kind: 'generate',
    params: [
      c('colorFront', 'Front', '#ff6f8e'),
      c('colorMid', 'Middle', '#6f3cff'),
      c('colorBack', 'Back', '#020207'),
      f('brightness', 'Brightness', 0, 2, 0.01, 1),
      f('contrast', 'Contrast', 0, 2, 0.01, 1.15),
      f('scale', 'Scale', 0.05, 4, 0.01, 1),
      f('speed', 'Speed', -2, 2, 0.01, 0.35),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      // match Paper's pattern UV at a 1080p reference (height spans 10.8 units)
      vec2 q = (uv - vec2(0.5 * asp2, 0.5)) * 10.8 / max(scale, 0.001);
      q *= 0.13;
      float tt = 0.5 * t * speed;
      vec2 sineAcc = vec2(0.0);
      vec2 acc = vec2(0.0);
      float sc = 8.0;
      for (int j = 0; j < 15; j++) {
        q = rot2d(q, 1.0);
        sineAcc = rot2d(sineAcc, 1.0);
        vec2 layer = q * sc + float(j) + sineAcc - tt;
        sineAcc += sin(layer);
        acc += (0.5 + 0.5 * cos(layer)) / sc;
        sc *= 1.2;
      }
      float n = acc.x + acc.y;
      n = (1.0 + brightness) * n * n;
      n = pow(n, 0.7 + 6.0 * contrast);
      n = min(1.4, n);
      float blend = smoothstep(0.7, 1.4, n);
      vec3 front = mix(colorMid, colorFront, blend);
      float alpha = clamp(n, 0.0, 1.0);
      col = front * max(n, 0.0) + colorBack * (1.0 - alpha);
    `,
  },
  {
    // Port of Paper Shaders' Warp (paper-design/shaders, MIT):
    // noise-distorted, swirled checks/stripes/edge blended over 4 colors.
    id: 'warpflow',
    name: 'Warp Flow',
    kind: 'generate',
    params: [
      c('col1', 'Color 1', '#121212'),
      c('col2', 'Color 2', '#9470ff'),
      c('col3', 'Color 3', '#ff654a'),
      c('col4', 'Color 4', '#121212'),
      f('proportion', 'Proportion', 0, 1, 0.01, 0.45),
      f('softness', 'Softness', 0, 1, 0.01, 1),
      f('distortion', 'Distortion', 0, 1, 0.01, 0.32),
      f('swirlAmt', 'Swirl', 0, 1, 0.01, 0.8),
      f('swirlIter', 'Swirl Passes', 0, 20, 1, 10),
      { key: 'shape', label: 'Shape', type: 'select', uniform: true,
        options: ['Checks', 'Stripes', 'Edge'], def: 'Checks' },
      f('shapeScale', 'Shape Scale', 0, 1, 0.01, 0.1),
      f('scale', 'Scale', 0.05, 4, 0.01, 1),
      f('speed', 'Speed', -2, 2, 0.01, 0.35),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      // Paper's pattern UV at a 1080p reference, halved as in the original
      vec2 q = (uv - vec2(0.5 * asp2, 0.5)) * 10.8 / max(scale, 0.001);
      q *= 0.5;
      float tt = 0.0625 * (t * speed + 118.0);
      float n1 = vnoise(q + tt);
      float n2 = vnoise(q * 2.0 - tt);
      float ang = n1 * 6.28318530718;
      q.x += 4.0 * distortion * n2 * cos(ang);
      q.y += 4.0 * distortion * n2 * sin(ang);
      for (int i = 1; i <= 20; i++) {
        if (float(i) >= swirlIter) break;
        float fi = float(i);
        q.x += swirlAmt / fi * cos(tt + fi * 1.5 * q.y);
        q.y += swirlAmt / fi * cos(tt + fi * 1.0 * q.x);
      }
      float prop = clamp(proportion, 0.0, 1.0);
      float sv = 0.0;
      if (shape < 0.5) {
        vec2 cuv = q * (0.5 + 3.5 * shapeScale);
        sv = 0.5 + 0.5 * sin(cuv.x) * cos(cuv.y);
        sv += 0.48 * sign(prop - 0.5) * pow(abs(prop - 0.5), 0.5);
      } else if (shape < 1.5) {
        vec2 suv = q * (2.0 * shapeScale);
        float fy = fract(suv.y);
        sv = smoothstep(0.0, 0.55, fy) * (1.0 - smoothstep(0.45, 1.0, fy));
        sv += 0.48 * sign(prop - 0.5) * pow(abs(prop - 0.5), 0.5);
      } else {
        float ss = 5.0 * (1.0 - shapeScale);
        float e0 = 0.45 - ss;
        float e1 = 0.55 + ss;
        sv = smoothstep(min(e0, e1), max(e0, e1), 1.0 - q.y + 0.3 * (prop - 0.5));
      }
      float mixer = sv * 3.0;
      vec3 cols4[4] = vec3[4](col1, col2, col3, col4);
      vec3 gradient = col1;
      float aa = fwidth(sv);
      for (int i = 1; i < 4; i++) {
        float m = clamp(mixer - float(i - 1), 0.0, 1.0);
        float lms = floor(m);
        float sft = 0.5 * softness + fwidth(m);
        float sm = smoothstep(max(0.0, 0.5 - sft - aa), min(1.0, 0.5 + sft + aa), m - lms);
        m = mix(lms + sm, m, softness);
        gradient = mix(gradient, cols4[i], m);
      }
      col = clamp(gradient, 0.0, 1.0);
    `,
  },
  {
    id: 'text',
    name: 'Text',
    kind: 'generate',
    texture: true,
    params: [
      { key: 'txt', label: 'Text', type: 'text', def: 'BLAZE' },
      { key: 'font', label: 'Font', type: 'select', options: FONTS.map((ft) => ft.family), def: DEFAULT_FONT.family },
      { key: 'style', label: 'Style', type: 'select', options: [...TEXT_STYLES], def: 'Fill' },
      c('fill', 'Fill', '#ffffff'),
      c('fill2', 'Gradient Fill', '#ff2d96'),
      f('grad', 'Gradient', 0, 1, 0.01, 0),
      c('outCol', 'Outline', '#00d5ff'),
      f('size', 'Size', 0.05, 2, 0.01, 0.8),
      f('posX', 'X', -1, 1, 0.01, 0),
      f('posY', 'Y', -1, 1, 0.01, 0),
      f('rot', 'Rotate', -3.14, 3.14, 0.01, 0),
      f('spin', 'Spin', -3, 3, 0.01, 0),
      f('wobble', 'Wobble', 0, 0.2, 0.005, 0),
      f('wspeed', 'Wobble Speed', 0, 8, 0.05, 2),
      f('glitch', 'Glitch', 0, 0.3, 0.005, 0),
      f('shadowX', 'Shadow X', -0.3, 0.3, 0.005, 0),
      f('shadowY', 'Shadow Y', -0.3, 0.3, 0.005, 0),
      c('shadowCol', 'Shadow', '#000000'),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2 + posX * 0.5 * asp2, 0.5 + posY * 0.5);
      float ang = rot + t * spin;
      float ca = cos(ang);
      float sa = sin(ang);
      p = mat2(ca, -sa, sa, ca) * p;
      p.y += sin(p.x * 14.0 + t * wspeed) * wobble;
      vec2 tuv = p / max(size, 0.001) + 0.5;
      tuv.y = 1.0 - tuv.y;
      tuv.x += (hash21(vec2(floor(tuv.y * 24.0), floor(t * 9.0))) - 0.5) * glitch;
      vec2 suv = tuv - vec2(shadowX, -shadowY);
      float inS = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
      float inT = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
      float sm = texture(tex, clamp(suv, 0.0, 1.0)).a * inS;
      col = mix(col, shadowCol, sm);
      vec4 tx = texture(tex, clamp(tuv, 0.0, 1.0)) * inT;
      vec3 fcol = mix(fill, fill2, grad * (1.0 - tuv.y));
      col = mix(col, fcol, tx.r);
      col = mix(col, outCol, tx.g);
    `,
  },
  {
    id: 'image',
    name: 'Image',
    kind: 'generate',
    texture: true,
    params: [
      { key: 'src', label: 'Image', type: 'image', def: '' },
      { key: 'fit', label: 'Fit', type: 'select', uniform: true,
        options: ['Cover', 'Contain', 'Manual'], def: 'Cover' },
      f('size', 'Size', 0.05, 3, 0.01, 0.8),
      { ...f('posX', 'Position', -1, 1, 0.01, 0), xy: 'x' as const },
      { ...f('posY', 'Position Y', -1, 1, 0.01, 0), xy: 'y' as const },
      f('rot', 'Rotate', -3.14, 3.14, 0.01, 0),
      f('spin', 'Spin', -3, 3, 0.01, 0),
      f('alpha', 'Image Alpha', 0, 1, 0.01, 1),
      c('tint', 'Tint', '#ffffff'),
      f('tintAmt', 'Tint Amount', 0, 1, 0.01, 0),
    ],
    glsl: `
      float asp2 = u_res.x / u_res.y;
      vec2 p = uv - vec2(0.5 * asp2 + posX * 0.5 * asp2, 0.5 + posY * 0.5);
      float ang = rot + t * spin;
      float ca = cos(ang);
      float sa = sin(ang);
      p = mat2(ca, -sa, sa, ca) * p;
      float ta = max(texAspect, 0.001);
      // image height in uv units (canvas height = 1); width = height * ta
      float ih;
      if (fit < 0.5) {
        ih = max(1.0, asp2 / ta);
      } else if (fit < 1.5) {
        ih = min(1.0, asp2 / ta);
      } else {
        ih = max(size, 0.001);
      }
      vec2 tuv = p / vec2(ih * ta, ih) + 0.5;
      tuv.y = 1.0 - tuv.y;
      float inT = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
      vec4 tx = texture(tex, clamp(tuv, 0.0, 1.0));
      vec3 icol = mix(tx.rgb, tx.rgb * tint, tintAmt);
      col = mix(col, icol, tx.a * inT * alpha);
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
    // Adapted from Basement Studio Shader Lab's VoxelPass:
    // fake isometric hex blocks with face shading, outlines, height, and lego caps.
    id: 'voxel',
    name: 'Voxel',
    kind: 'modify',
    params: [
      f('cellSize', 'Cell Size', 4, 96, 1, 24),
      f('depth', 'Depth', 0, 1, 0.01, 0.6),
      f('maxHeight', 'Max Height', 1, 8, 1, 6),
      f('topShade', 'Top Shade', 0, 1.5, 0.01, 1),
      f('lightShade', 'Light Side', 0, 1.5, 0.01, 0.78),
      f('darkShade', 'Dark Side', 0, 1.5, 0.01, 0.55),
      f('flipLight', 'Flip Light', 0, 1, 1, 0),
      f('lego', 'Lego Caps', 0, 1, 1, 0),
      f('outlineWidth', 'Outline', 0, 4, 0.1, 1),
      c('outlineColor', 'Outline Color', '#0a0a0a'),
    ],
    glsl: `
      const float SQRT3 = 1.73205080757;
      const int STACK_LIMIT = 8;
      vec2 pix = gl_FragCoord.xy;
      float s = max(cellSize, 4.0) * pxScale();
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float height = mix(1.0, 1.0 + luma * (clamp(maxHeight, 1.0, 8.0) - 1.0), depth);

      float bestFound = 0.0;
      float bestJ = 0.0;
      vec2 bestCenter = vec2(0.0);
      for (int k = STACK_LIMIT - 1; k >= 0; k--) {
        float j = float(k);
        vec2 probe = vec2(pix.x, pix.y + j * s);
        vec2 center = hexCenterPointy(probe, s);
        float cubeExists = step(j + 0.001, height);
        float take = cubeExists * (1.0 - bestFound);
        bestFound = max(bestFound, take);
        bestJ = mix(bestJ, j, take);
        bestCenter = mix(bestCenter, center, take);
      }

      vec2 cubeCenter = vec2(bestCenter.x, bestCenter.y - bestJ * s);
      vec2 localP = pix - cubeCenter;
      float lx = localP.x;
      float ly = localP.y;

      float topThreshold = -abs(lx) / SQRT3;
      float isTop = step(ly, topThreshold);
      float isRight = (1.0 - isTop) * step(0.0, lx);
      float flip = step(0.5, flipLight);
      float sideBright = mix(lightShade, darkShade, flip);
      float sideDark = mix(darkShade, lightShade, flip);
      float cubeFaceShade = mix(mix(sideDark, sideBright, isRight), topShade, isTop);

      float legoOn = step(0.5, lego);
      float notchH = s * 0.18;
      float notchRx = s * 0.4;
      float notchRy = s * 0.2;
      float notchBaseY = s * -0.5;
      float notchTopY = notchBaseY - notchH;
      float capDx = lx;
      float capDy = ly - notchTopY;
      float capR = (capDx / notchRx) * (capDx / notchRx) + (capDy / notchRy) * (capDy / notchRy);
      float inCap = 1.0 - step(1.0, capR);
      float tNorm = clamp(1.0 - (lx / notchRx) * (lx / notchRx), 0.0, 1.0);
      float arc = sqrt(tNorm) * notchRy;
      float yTopArc = notchTopY + arc;
      float yBaseArc = notchBaseY + arc;
      float inSideBand = (1.0 - step(notchRx, abs(lx)))
        * step(yTopArc, ly)
        * (1.0 - step(yBaseArc, ly));
      float inNotch = legoOn * isTop * max(inCap, inSideBand);
      float notchCapShade = topShade * 0.92;
      float sideT = clamp(lx / notchRx * 0.5 + 0.5, 0.0, 1.0);
      float notchSideShade = mix(sideDark, sideBright, sideT);
      float notchFaceShade = mix(notchSideShade, notchCapShade, inCap);
      float faceShade = mix(cubeFaceShade, notchFaceShade, inNotch);

      vec3 litColor = col * faceShade;
      float inradius = s * SQRT3 * 0.5;
      float proj1 = abs(lx);
      float proj2 = abs(lx * 0.5 + ly * SQRT3 * 0.5);
      float proj3 = abs(lx * 0.5 - ly * SQRT3 * 0.5);
      float dEdge = inradius - max(max(proj1, proj2), proj3);
      float outlineMask = 1.0 - smoothstep(0.0, max(outlineWidth, 0.0001), dEdge);
      col = mix(litColor, outlineColor, outlineMask);
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
      float ds = dotSize * pxScale();
      vec2 q = R * gl_FragCoord.xy;
      vec2 g = mod(q, ds) - 0.5 * ds;
      float r = sqrt(clamp(luma, 0.0, 1.0)) * ds * 0.65;
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
      vec2 g = fract(gl_FragCoord.xy / (max(cellSize, 2.0) * pxScale())) * 2.0 - 1.0;
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
    id: 'gradmap',
    name: 'Duotone / Gradient Map',
    kind: 'modify',
    params: [
      c('shadow', 'Shadow', '#12061f'),
      c('mid', 'Midtone', '#ff2d96'),
      c('highlight', 'Highlight', '#f8f3dc'),
      f('midpoint', 'Midpoint', 0.05, 0.95, 0.01, 0.5),
      f('blendAmt', 'Blend', 0, 1, 0.01, 1),
      f('contrast', 'Contrast', 0.2, 4, 0.01, 1),
      f('gamma', 'Gamma', 0.2, 3, 0.01, 1),
      f('shift', 'Shift', -1, 1, 0.01, 0),
      f('animate', 'Animate', -2, 2, 0.01, 0),
    ],
    glsl: `
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      luma = pow(clamp(luma, 0.0, 1.0), gamma);
      luma = clamp((luma - 0.5) * contrast + 0.5 + shift + t * animate * 0.1, 0.0, 1.0);
      float mp = clamp(midpoint, 0.01, 0.99);
      vec3 mapped = luma < mp
        ? mix(shadow, mid, smoothstep(0.0, mp, luma))
        : mix(mid, highlight, smoothstep(mp, 1.0, luma));
      col = mix(col, mapped, blendAmt);
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
      vec2 px = floor(gl_FragCoord.xy / (max(pxSize, 1.0) * pxScale()));
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
