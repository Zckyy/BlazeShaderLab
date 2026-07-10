import { EFFECT_MAP, GLSL_HELPERS, hexToRgb, isUniformParam } from './effects.ts'
import { DEFAULT_FONT, FONT_MAP, TEXT_STYLES, drawTextToCanvas, ensureFontLoaded, fontLoaded } from './fonts.ts'
import type { TextStyle } from './fonts.ts'
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
    const uniformParams = fx.params.filter(isUniformParam)
    if (!seen.has(fx.id)) {
      seen.add(fx.id)
      const args = [
        ...(fx.texture ? ['sampler2D tex', 'float texAspect'] : []),
        ...uniformParams.map((p) => `${p.type === 'color' ? 'vec3' : 'float'} ${p.key}`),
      ].join(', ')
      fns.push(
        `void fx_${fx.id}(inout vec2 uv, inout vec3 col, float t${args ? ', ' + args : ''}) {\n${fx.glsl}\n}`
      )
    }
    if (fx.texture) {
      uniforms.push(`uniform sampler2D u_${layer.uid}_tex;`)
      uniforms.push(`uniform float u_${layer.uid}_tasp;`)
    }
    for (const p of uniformParams) {
      uniforms.push(
        `uniform ${p.type === 'color' ? 'vec3' : 'float'} u_${layer.uid}_${p.key};`
      )
    }
    uniforms.push(`uniform float u_${layer.uid}_op;`)
    const op = `u_${layer.uid}_op`
    const callArgs = [
      ...(fx.texture ? [`u_${layer.uid}_tex`, `u_${layer.uid}_tasp`] : []),
      ...uniformParams.map((p) => `u_${layer.uid}_${p.key}`),
    ].join(', ')
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
  // per-layer canvas textures for texture effects (e.g. text); key tracks
  // the rendered content so the texture re-uploads only when it changes
  private texCache = new Map<string, { key: string; tex: WebGLTexture; aspect: number }>()
  private texCanvas: HTMLCanvasElement | null = null
  // decoded user-uploaded images keyed by data URL; id gives each source a
  // short stable cache key so we never string-compare full data URLs
  private imgCache = new Map<string, { img: HTMLImageElement; loaded: boolean; id: number }>()
  private imgIdCounter = 0
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

  private texEntry(uid: string) {
    let entry = this.texCache.get(uid)
    if (!entry) {
      entry = { key: '', tex: this.gl.createTexture()!, aspect: 1 }
      this.texCache.set(uid, entry)
    }
    return entry
  }

  private syncLayerTexture(layer: Layer, unit: number) {
    const fx = EFFECT_MAP.get(layer.effectId)
    const imageParam = fx?.params.find((param) => param.type === 'image')
    if (imageParam) this.syncImageTexture(layer, unit, imageParam.key)
    else this.syncTextTexture(layer, unit)
    const l = this.loc(`u_${layer.uid}_tex`)
    if (l) this.gl.uniform1i(l, unit)
    const la = this.loc(`u_${layer.uid}_tasp`)
    if (la) this.gl.uniform1f(la, this.texCache.get(layer.uid)?.aspect ?? 1)
  }

  private syncImageTexture(layer: Layer, unit: number, sourceKey = 'src') {
    const gl = this.gl
    const src = String(layer.values[sourceKey] ?? '')
    let img = src ? this.imgCache.get(src) : undefined
    if (src && !img) {
      const el = new Image()
      img = { img: el, loaded: false, id: this.imgIdCounter++ }
      this.imgCache.set(src, img)
      el.onload = () => {
        img!.loaded = true
      }
      el.src = src
    }
    // key flips when the image finishes decoding, forcing a re-upload
    const key = img ? `${img.id}:${img.loaded ? 1 : 0}` : 'none'
    const entry = this.texEntry(layer.uid)
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, entry.tex)
    if (entry.key !== key) {
      entry.key = key
      if (img?.loaded) {
        entry.aspect = img.img.naturalWidth / Math.max(img.img.naturalHeight, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img.img)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      } else {
        // transparent 1x1 placeholder until the upload finishes decoding
        entry.aspect = 1
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
  }

  private syncTextTexture(layer: Layer, unit: number) {
    const gl = this.gl
    const text = String(layer.values.txt ?? '')
    const font = FONT_MAP.get(String(layer.values.font)) ?? DEFAULT_FONT
    ensureFontLoaded(font)
    // key flips when the font finishes downloading, forcing a re-render
    const styleRaw = String(layer.values.style ?? 'Fill')
    const style = TEXT_STYLES.includes(styleRaw as TextStyle) ? (styleRaw as TextStyle) : 'Fill'
    const key = [font.family, fontLoaded(font) ? 1 : 0, style, text].join(' ')
    const entry = this.texEntry(layer.uid)
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, entry.tex)
    if (entry.key !== key) {
      entry.key = key
      if (!this.texCanvas) this.texCanvas = document.createElement('canvas')
      drawTextToCanvas(this.texCanvas, text, font, style)
      entry.aspect = this.texCanvas.width / Math.max(this.texCanvas.height, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.texCanvas)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
  }

  rebuild(layers: Layer[]) {
    const gl = this.gl
    // drop textures for layers that no longer exist
    const uids = new Set(layers.map((l) => l.uid))
    for (const [uid, entry] of this.texCache) {
      if (!uids.has(uid)) {
        gl.deleteTexture(entry.tex)
        this.texCache.delete(uid)
      }
    }
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
    let texUnit = 0
    for (const layer of layers) {
      if (!layer.enabled) continue
      const fx = EFFECT_MAP.get(layer.effectId)
      if (!fx) continue
      if (fx.texture) this.syncLayerTexture(layer, texUnit++)
      for (const p of fx.params) {
        if (!isUniformParam(p)) continue
        const l = this.loc(`u_${layer.uid}_${p.key}`)
        if (!l) continue
        const v = layer.values[p.key]
        if (p.type === 'color') {
          const [r, g, b] = hexToRgb(typeof v === 'string' ? v : p.def)
          gl.uniform3f(l, r, g, b)
        } else if (p.type === 'select') {
          const idx = p.options.indexOf(typeof v === 'string' ? v : p.def)
          gl.uniform1f(l, Math.max(0, idx))
        } else if (p.type === undefined || p.type === 'float') {
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

  finish() {
    this.gl.finish()
  }
}
