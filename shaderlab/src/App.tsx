import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { EFFECTS, EFFECT_MAP } from './effects.ts'
import { Renderer, buildFragmentShader } from './renderer.ts'
import { PRESETS } from './presets.ts'
import type { Layer, BlendMode } from './types.ts'

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  )
}

let uidCounter = 0
const newUid = () => `l${uidCounter++}_${Math.random().toString(36).slice(2, 6)}`

function makeLayer(effectId: string): Layer {
  const fx = EFFECT_MAP.get(effectId)!
  const values: Layer['values'] = {}
  for (const p of fx.params) values[p.key] = p.def
  return {
    uid: newUid(),
    effectId,
    enabled: true,
    opacity: 1,
    blend: 'normal',
    values,
  }
}

function randomValues(effectId: string): Layer['values'] {
  const fx = EFFECT_MAP.get(effectId)!
  const values: Layer['values'] = {}
  for (const p of fx.params) {
    if (p.type === 'color') {
      values[p.key] =
        '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    } else {
      values[p.key] =
        Math.round((p.min + Math.random() * (p.max - p.min)) / p.step) * p.step
    }
  }
  return values
}

const DEFAULT_LAYERS: Layer[] = [
  makeLayer('meshgradient'),
  makeLayer('warp'),
  { ...makeLayer('vignette'), opacity: 0.9 },
]

const STORAGE_KEY = 'shaderlab-project'

// Rebuilds layers from untrusted/saved JSON: unknown effects are dropped,
// missing params get defaults, uids are regenerated.
function sanitizeLayers(raw: unknown): Layer[] | null {
  if (!Array.isArray(raw)) return null
  const out: Layer[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const l = item as Partial<Layer>
    const fx = EFFECT_MAP.get(l.effectId ?? '')
    if (!fx) continue
    const base = makeLayer(fx.id)
    if (l.values && typeof l.values === 'object') {
      for (const p of fx.params) {
        const v = (l.values as Record<string, unknown>)[p.key]
        if (p.type === 'color' && typeof v === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(v)) {
          base.values[p.key] = v
        } else if (p.type !== 'color' && typeof v === 'number' && isFinite(v)) {
          base.values[p.key] = Math.min(p.max, Math.max(p.min, v))
        }
      }
    }
    base.enabled = l.enabled !== false
    base.opacity = typeof l.opacity === 'number' ? Math.min(1, Math.max(0, l.opacity)) : 1
    base.blend = l.blend === 'add' || l.blend === 'multiply' ? l.blend : 'normal'
    out.push(base)
  }
  return out.length > 0 ? out : null
}

function encodeShare(layers: Layer[]): string {
  const json = JSON.stringify({ version: 1, layers })
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function decodeShare(hash: string): Layer[] | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    return sanitizeLayers(parsed.layers)
  } catch {
    return null
  }
}

function buildPreset(name: string): Layer[] | null {
  const preset = PRESETS.find((p) => p.name === name)
  if (!preset) return null
  return preset.layers
    .filter((pl) => EFFECT_MAP.has(pl.effectId))
    .map((pl) => {
      const l = makeLayer(pl.effectId)
      if (pl.values) Object.assign(l.values, pl.values)
      if (pl.opacity !== undefined) l.opacity = pl.opacity
      if (pl.blend) l.blend = pl.blend
      return l
    })
}

function loadInitialLayers(): Layer[] {
  // a share link takes priority over the local auto-save
  if (location.hash.startsWith('#p=')) {
    const shared = decodeShare(location.hash.slice(3))
    if (shared) return shared
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const layers = sanitizeLayers(parsed.layers)
      if (layers) return layers
    }
  } catch {
    // corrupted save — fall back to defaults
  }
  return DEFAULT_LAYERS
}

const INITIAL_LAYERS = loadInitialLayers()

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const layersRef = useRef<Layer[]>(INITIAL_LAYERS)
  const [layers, setLayersState] = useState<Layer[]>(INITIAL_LAYERS)
  const [selected, setSelected] = useState<string | null>(INITIAL_LAYERS[0].uid)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [time, setTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // close the export menu when clicking anywhere outside it
  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [exportOpen])
  const [aspect, setAspect] = useState<'fill' | '1:1' | '16:9' | '9:16'>('fill')
  const dragUid = useRef<string | null>(null)
  const [draggingUid, setDraggingUid] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const prevRects = useRef(new Map<string, number>())

  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  const timeRef = useRef(0)
  playingRef.current = playing
  speedRef.current = speed

  const setLayers = useCallback((next: Layer[], structural = false) => {
    layersRef.current = next
    setLayersState(next)
    if (structural && rendererRef.current) {
      rendererRef.current.rebuild(next)
      setError(rendererRef.current.error)
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, layers: next }))
    } catch {
      // storage full or unavailable — skip autosave
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const r = new Renderer(canvas)
    rendererRef.current = r
    r.rebuild(layersRef.current)
    setError(r.error)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current) {
        timeRef.current += dt * speedRef.current
        setTime(timeRef.current)
      }
      r.render(layersRef.current, timeRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const updateLayer = (uid: string, patch: Partial<Layer>, structural = false) => {
    setLayers(
      layersRef.current.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
      structural
    )
  }

  const addLayer = (effectId: string) => {
    const l = makeLayer(effectId)
    setLayers([...layersRef.current, l], true)
    setSelected(l.uid)
    setAddOpen(false)
  }

  const removeLayer = (uid: string) => {
    setLayers(layersRef.current.filter((l) => l.uid !== uid), true)
    if (selected === uid) setSelected(null)
  }

  const moveLayer = (uid: string, dir: -1 | 1) => {
    const arr = [...layersRef.current]
    const i = arr.findIndex((l) => l.uid === uid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setLayers(arr, true)
  }

  const randomizeLayers = () => {
    const gens = EFFECTS.filter((e) => e.kind === 'generate')
    const mods = EFFECTS.filter((e) => e.kind === 'modify')
    const pick = (arr: typeof EFFECTS) => arr[Math.floor(Math.random() * arr.length)]
    const stack: Layer[] = [makeLayer(pick(gens).id)]
    const extra = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < extra; i++) {
      const l = makeLayer(pick(Math.random() < 0.7 ? mods : gens).id)
      const fx = EFFECT_MAP.get(l.effectId)!
      if (fx.kind === 'generate') {
        l.blend = Math.random() < 0.5 ? 'add' : 'multiply'
        l.opacity = 0.3 + Math.random() * 0.7
      }
      stack.push(l)
    }
    const randomized = stack.map((l) => ({ ...l, values: randomValues(l.effectId) }))
    setLayers(randomized, true)
    setSelected(randomized[0].uid)
  }

  const randomize = () => {
    setLayers(
      layersRef.current.map((l) => ({ ...l, values: randomValues(l.effectId) }))
    )
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // fit canvas to viewport at the chosen aspect ratio
  useEffect(() => {
    const canvas = canvasRef.current!
    const vp = viewportRef.current!
    const apply = () => {
      if (aspect === 'fill') {
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        return
      }
      const [aw, ah] = aspect === '1:1' ? [1, 1] : aspect === '16:9' ? [16, 9] : [9, 16]
      const rect = vp.getBoundingClientRect()
      const w = Math.min(rect.width, (rect.height * aw) / ah)
      canvas.style.width = `${w}px`
      canvas.style.height = `${(w * ah) / aw}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [aspect])

  const loadPreset = (name: string) => {
    const preset = buildPreset(name)
    if (!preset) return
    setLayers(preset, true)
    setSelected(preset[0].uid)
  }

  const duplicateLayer = (uid: string) => {
    const arr = [...layersRef.current]
    const i = arr.findIndex((l) => l.uid === uid)
    if (i < 0) return
    const copy: Layer = { ...arr[i], uid: newUid(), values: { ...arr[i].values } }
    arr.splice(i + 1, 0, copy)
    setLayers(arr, true)
    setSelected(copy.uid)
  }

  // live reorder while dragging (visual only); shader rebuilds once on drag end
  const reorderLayer = (fromUid: string, toUid: string, finalize: boolean) => {
    if (fromUid !== toUid) {
      const arr = [...layersRef.current]
      const from = arr.findIndex((l) => l.uid === fromUid)
      const to = arr.findIndex((l) => l.uid === toUid)
      if (from < 0 || to < 0) return
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      setLayers(arr, finalize)
    } else if (finalize) {
      setLayers([...layersRef.current], true)
    }
  }

  const endDrag = () => {
    if (dragUid.current) reorderLayer(dragUid.current, dragUid.current, true)
    dragUid.current = null
    setDraggingUid(null)
  }

  // FLIP: animate rows sliding into their new slots when the list order changes
  useLayoutEffect(() => {
    const next = new Map<string, number>()
    rowRefs.current.forEach((el, uid) => {
      if (!el) return
      const top = el.getBoundingClientRect().top
      const prev = prevRects.current.get(uid)
      // the dragged row follows the cursor via the browser drag image;
      // animating it too makes the list look chaotic
      if (uid !== dragUid.current && prev !== undefined && Math.abs(prev - top) > 1) {
        el.style.transition = 'none'
        el.style.transform = `translateY(${prev - top}px)`
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.18s ease'
          el.style.transform = ''
        })
      }
      next.set(uid, top)
    })
    prevRects.current = next
  }, [layers])

  const snapshot = () => {
    canvasRef.current!.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'shaderlab.png'
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/png')
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#p=${encodeShare(layersRef.current)}`
    history.replaceState(null, '', url)
    await navigator.clipboard.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 1500)
  }

  const exportProject = () => {
    const json = JSON.stringify({ version: 1, layers: layersRef.current }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'shaderlab-project.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const imported = sanitizeLayers(parsed.layers)
      if (!imported) {
        setError('Import failed: no valid layers found in file')
        return
      }
      setLayers(imported, true)
      setSelected(imported[0].uid)
    } catch {
      setError('Import failed: not a valid project JSON file')
    }
  }

  const exportGLSL = async () => {
    await navigator.clipboard.writeText(buildFragmentShader(layersRef.current))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const scrub = (t: number) => {
    timeRef.current = t
    setTime(t)
  }

  const sel = layers.find((l) => l.uid === selected) ?? null
  const selFx = sel ? EFFECT_MAP.get(sel.effectId)! : null

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          Blaze<span>ShaderLab</span>
        </h1>
        <div className="topbar-actions">
          <select
            className="preset-select"
            value=""
            onChange={(e) => { if (e.target.value) loadPreset(e.target.value) }}
          >
            <option value="">Presets</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <button onClick={randomize}>Randomize</button>
          <button onClick={share}>{shared ? 'Link copied' : 'Share'}</button>
          <div className="export-menu-wrap" ref={exportRef}>
            <button
              className={exportOpen ? 'open' : ''}
              onClick={() => setExportOpen(!exportOpen)}
            >
              {copied ? 'Copied' : 'Export ▾'}
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => { snapshot(); setExportOpen(false) }}>
                  PNG <em>image</em>
                </button>
                <button onClick={() => { exportGLSL(); setExportOpen(false) }}>
                  GLSL <em>clipboard</em>
                </button>
                <button onClick={() => { exportProject(); setExportOpen(false) }}>
                  Project <em>json</em>
                </button>
              </div>
            )}
          </div>
          <button onClick={() => fileInputRef.current?.click()}>Load</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importProject(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="main">
        <aside className="panel layers-panel">
          <div className="panel-head">
            <span>Layers</span>
            <span className="head-btns">
              <button className="add-btn" onClick={randomizeLayers} title="Random layer stack">
                RND
              </button>
              <button className="add-btn" onClick={() => setAddOpen(!addOpen)}>
                + Add
              </button>
            </span>
          </div>
          {addOpen && (
            <div className="add-menu">
              {EFFECTS.map((fx) => (
                <button key={fx.id} onClick={() => addLayer(fx.id)}>
                  <em className={fx.kind}>{fx.kind === 'generate' ? 'GEN' : 'FX'}</em>
                  {fx.name}
                </button>
              ))}
            </div>
          )}
          <div className="layer-list">
            {[...layers].reverse().map((l) => {
              const fx = EFFECT_MAP.get(l.effectId)!
              return (
                <div
                  key={l.uid}
                  ref={(el) => {
                    if (el) rowRefs.current.set(l.uid, el)
                    else rowRefs.current.delete(l.uid)
                  }}
                  className={`layer ${selected === l.uid ? 'sel' : ''} ${l.enabled ? '' : 'off'} ${draggingUid === l.uid ? 'dragging' : ''}`}
                  onClick={() => setSelected(l.uid)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!dragUid.current || dragUid.current === l.uid) return
                    // only swap once the cursor crosses this row's midpoint,
                    // otherwise the swapped-in row immediately swaps back (jitter)
                    const rect = e.currentTarget.getBoundingClientRect()
                    const mid = rect.top + rect.height / 2
                    const fromEl = rowRefs.current.get(dragUid.current)
                    if (!fromEl) return
                    const movingDown = fromEl.getBoundingClientRect().top < rect.top
                    if (movingDown ? e.clientY > mid : e.clientY < mid) {
                      reorderLayer(dragUid.current, l.uid, false)
                    }
                  }}
                  onDrop={(e) => { e.preventDefault(); endDrag() }}
                >
                  <span
                    className="drag-handle"
                    title="Drag to reorder"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.uid)
                      e.dataTransfer.effectAllowed = 'move'
                      dragUid.current = l.uid
                      setDraggingUid(l.uid)
                    }}
                    onDragEnd={endDrag}
                  >
                    ⠿
                  </span>
                  <button
                    className="eye"
                    title="Toggle visibility"
                    onClick={(e) => {
                      e.stopPropagation()
                      updateLayer(l.uid, { enabled: !l.enabled }, true)
                    }}
                  >
                    <EyeIcon open={l.enabled} />
                  </button>
                  <em className={`kind-badge ${fx.kind}`}>
                    {fx.kind === 'generate' ? 'GEN' : 'FX'}
                  </em>
                  <span className="layer-name">{fx.name}</span>
                  <span className="layer-btns">
                    <button onClick={(e) => { e.stopPropagation(); duplicateLayer(l.uid) }} title="Duplicate">⧉</button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(l.uid, 1) }} title="Move up">↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(l.uid, -1) }} title="Move down">↓</button>
                    <button onClick={(e) => { e.stopPropagation(); removeLayer(l.uid) }} title="Delete">✕</button>
                  </span>
                </div>
              )
            })}
            {layers.length === 0 && <div className="empty">No layers — add one</div>}
          </div>
        </aside>

        <section className="viewport" ref={viewportRef}>
          <canvas ref={canvasRef} />
          <div className="aspect-bar">
            {(['fill', '1:1', '16:9', '9:16'] as const).map((a) => (
              <button
                key={a}
                className={aspect === a ? 'on' : ''}
                onClick={() => setAspect(a)}
              >
                {a === 'fill' ? 'Fill' : a}
              </button>
            ))}
          </div>
          {error && <pre className="shader-error">{error}</pre>}
        </section>

        <aside className="panel props-panel">
          <div className="panel-head">
            <span>{selFx ? selFx.name : 'Properties'}</span>
          </div>
          {sel && selFx ? (
            <div className="props">
              {selFx.params.map((p) => {
                const v = sel.values[p.key]
                if (p.type === 'color') {
                  return (
                    <label key={p.key} className="color-row">
                      <span>{p.label}</span>
                      <input
                        type="color"
                        value={typeof v === 'string' ? v : p.def}
                        onChange={(e) =>
                          updateLayer(sel.uid, {
                            values: { ...sel.values, [p.key]: e.target.value },
                          })
                        }
                      />
                    </label>
                  )
                }
                const num = typeof v === 'number' ? v : p.def
                return (
                  <label key={p.key}>
                    <span>
                      {p.label} <b>{num.toFixed(2)}</b>
                    </span>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={num}
                      onChange={(e) =>
                        updateLayer(sel.uid, {
                          values: { ...sel.values, [p.key]: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                )
              })}
              <label>
                <span>
                  Opacity <b>{sel.opacity.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sel.opacity}
                  onChange={(e) => updateLayer(sel.uid, { opacity: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>Blend</span>
                <select
                  value={sel.blend}
                  onChange={(e) =>
                    updateLayer(sel.uid, { blend: e.target.value as BlendMode }, true)
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="add">Add</option>
                  <option value="multiply">Multiply</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="empty">Select a layer</div>
          )}
        </aside>
      </div>

      <footer className="timeline">
        <button className="play" onClick={() => setPlaying(!playing)}>
          {playing ? '⏸' : '▶'}
        </button>
        <span className="time">{time.toFixed(1)}s</span>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={60}
          step={0.01}
          value={time % 60}
          onChange={(e) => scrub(Number(e.target.value))}
        />
        <span className="speed-label">Speed</span>
        <input
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ width: 100 }}
        />
        <span className="time">{speed.toFixed(2)}×</span>
      </footer>
    </div>
  )
}
