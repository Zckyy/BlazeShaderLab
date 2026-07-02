import { EFFECT_MAP, GLSL_HELPERS, hexToRgb } from './effects.ts'
import type { Layer } from './types.ts'

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export function buildFragmentShader(layers: Layer[]): string {
  const enabled = layers.filter((l) => l.enabled)
  const fns: string[] = []
  const calls: string[] = []
  const uniforms: string[] = []
  const seen = new Set<string>()

  for (const layer of enabled) {
    const fx = EFFECT_MAP.get(layer.effectId)
    if (!fx) continue
    if (!seen.has(fx.id)) {
      seen.add(fx.id)
      const args = fx.params
        .map((p) => `${p.type === 'color' ? 'vec3' : 'float'} ${p.key}`)
        .join(', ')
      fns.push(
        `void fx_${fx.id}(inout vec2 uv, inout vec3 col, float t${args ? ', ' + args : ''}) {\n${fx.glsl}\n}`
      )
    }
    for (const p of fx.params) {
      uniforms.push(
        `uniform ${p.type === 'color' ? 'vec3' : 'float'} u_${layer.uid}_${p.key};`
      )
    }
    uniforms.push(`uniform float u_${layer.uid}_op;`)
    const op = `u_${layer.uid}_op`
    const callArgs = fx.params.map((p) => `u_${layer.uid}_${p.key}`).join(', ')
    const blend =
      layer.blend === 'add'
        ? `col + c2 * ${op}`
        : layer.blend === 'multiply'
          ? `mix(col, col * c2, ${op})`
          : `mix(col, c2, ${op})`
    calls.push(`  {
    vec2 uv2 = uv; vec3 c2 = col;
    fx_${fx.id}(uv2, c2, t${callArgs ? ', ' + callArgs : ''});
    uv = mix(uv, uv2, ${op});
    col = ${blend};
  }`)
  }

  return `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
${uniforms.join('\n')}
out vec4 fragColor;
${GLSL_HELPERS}
${fns.join('\n')}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.x *= u_res.x / u_res.y;
  float t = u_time;
  vec3 col = vec3(0.0);
${calls.join('\n')}
  fragColor = vec4(col, 1.0);
}
`
}

export class Renderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram | null = null
  private uniformLocs = new Map<string, WebGLUniformLocation | null>()
  error: string | null = null

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 not supported')
    this.gl = gl
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
  }

  rebuild(layers: Layer[]) {
    const gl = this.gl
    const src = buildFragmentShader(layers)
    const compile = (type: number, source: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, source)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh)
        gl.deleteShader(sh)
        throw new Error(log || 'shader compile failed')
      }
      return sh
    }
    try {
      const vs = compile(gl.VERTEX_SHADER, VERT)
      const fs = compile(gl.FRAGMENT_SHADER, src)
      const prog = gl.createProgram()!
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) || 'link failed')
      }
      if (this.program) gl.deleteProgram(this.program)
      this.program = prog
      this.uniformLocs.clear()
      gl.useProgram(prog)
      const posLoc = gl.getAttribLocation(prog, 'a_pos')
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
      this.error = null
    } catch (e) {
      this.error = String(e)
    }
  }

  private loc(name: string) {
    if (!this.uniformLocs.has(name)) {
      this.uniformLocs.set(name, this.gl.getUniformLocation(this.program!, name))
    }
    return this.uniformLocs.get(name) ?? null
  }

  private draw(layers: Layer[], time: number, w: number, h: number) {
    const gl = this.gl
    if (!this.program) return
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.program)
    gl.uniform2f(this.loc('u_res'), w, h)
    gl.uniform1f(this.loc('u_time'), time)
    for (const layer of layers) {
      if (!layer.enabled) continue
      const fx = EFFECT_MAP.get(layer.effectId)
      if (!fx) continue
      for (const p of fx.params) {
        const l = this.loc(`u_${layer.uid}_${p.key}`)
        if (!l) continue
        const v = layer.values[p.key]
        if (p.type === 'color') {
          const [r, g, b] = hexToRgb(typeof v === 'string' ? v : p.def)
          gl.uniform3f(l, r, g, b)
        } else {
          gl.uniform1f(l, typeof v === 'number' ? v : p.def)
        }
      }
      const lop = this.loc(`u_${layer.uid}_op`)
      if (lop) gl.uniform1f(lop, layer.opacity)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  render(layers: Layer[], time: number) {
    const canvas = this.gl.canvas as HTMLCanvasElement
    const w = Math.floor(canvas.clientWidth * Math.min(devicePixelRatio, 2))
    const h = Math.floor(canvas.clientHeight * Math.min(devicePixelRatio, 2))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    this.draw(layers, time, w, h)
  }

  renderFixed(layers: Layer[], time: number, width: number, height: number) {
    const canvas = this.gl.canvas as HTMLCanvasElement
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    this.draw(layers, time, width, height)
  }
}
