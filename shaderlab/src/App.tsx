import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
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

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      {locked ? (
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      ) : (
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
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
    } else if (p.type === 'text') {
      values[p.key] = p.def
    } else if (p.type === 'select') {
      values[p.key] = p.options[Math.floor(Math.random() * p.options.length)]
    } else {
      values[p.key] =
        Math.round((p.min + Math.random() * (p.max - p.min)) / p.step) * p.step
    }
  }
  return values
}

// The Marble Dreams scene shown on first load (no saved project or share link).
function makeDefaultLayers(): Layer[] {
  const spec: Array<{ effectId: string; values: Layer['values'] }> = [
    {
      effectId: 'marbleagate',
      values: {
        base: '#111018',
        veinA: '#f2efe5',
        veinB: '#54d3c2',
        accent: '#d66bff',
        scale: 5.2,
        rings: 5.5,
        warp: 1.25,
        turbulence: 0.75,
        sharpness: 2.6,
        contrast: 1.4,
        angle: 0.45,
        speed: 0.22,
      },
    },
    { effectId: 'chromab', values: { amount: 1, radial: 1 } },
    { effectId: 'grain', values: { amount: 0.1, gsize: 1 } },
  ]
  return spec.map(({ effectId, values }) => {
    const l = makeLayer(effectId)
    Object.assign(l.values, values)
    return l
  })
}

const DEFAULT_LAYERS: Layer[] = makeDefaultLayers()

const STORAGE_KEY = 'shaderlab-project'
const PNG_EXPORT_SIZES = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '4K', width: 3840, height: 2160 },
]
const GIF_EXPORT_SIZES = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
]
const MP4_EXPORT_SIZES = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '4K', width: 3840, height: 2160 },
]
const DISCORD_EXPORTS = [
  { label: 'PFP', width: 512, height: 512, filename: 'discord-pfp' },
  { label: 'Banner', width: 680, height: 240, filename: 'discord-banner' },
]
const GIF_EXPORT = { duration: 4, fps: 25 }
const MP4_EXPORT = { duration: 4, fps: 30 }

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function decimalsForStep(step: number) {
  const text = step.toString()
  const decimal = text.includes('e-')
    ? Number(text.split('e-')[1])
    : text.includes('.')
      ? text.split('.')[1].length
      : 0
  return Math.min(4, decimal)
}

function formatNumber(value: number, step: number) {
  const decimals = decimalsForStep(step)
  const formatted = value.toFixed(decimals)
  return formatted.includes('.') ? formatted.replace(/\.?0+$/, '') : formatted
}

function snapValue(value: number, min: number, step: number) {
  const decimals = decimalsForStep(step)
  const snapped = min + Math.round((value - min) / step) * step
  return Number(snapped.toFixed(decimals + 2))
}

function sliderStepFor(min: number, max: number, baseStep: number) {
  const range = max - min
  if (range >= 100) return Math.max(baseStep, 1)
  if (range >= 20) return Math.max(baseStep, 0.5)
  if (range >= 5) return Math.max(baseStep, 0.1)
  if (range >= 2) return Math.max(baseStep, 0.05)
  return baseStep
}

function NumberValueInput({
  value,
  min,
  max,
  step,
  onCommit,
}: {
  value: number
  min: number
  max: number
  step: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(formatNumber(value, step))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(formatNumber(value, step))
  }, [focused, step, value])

  const commit = (raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value, step))
      return
    }
    const next = snapValue(clampNumber(parsed, min, max), min, step)
    onCommit(next)
    setDraft(formatNumber(next, step))
  }

  return (
    <input
      className="value-input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        const parsed = Number(raw)
        if (raw !== '' && Number.isFinite(parsed)) {
          onCommit(clampNumber(parsed, min, max))
        }
      }}
      onBlur={(e) => {
        setFocused(false)
        commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(formatNumber(value, step))
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function XYPad({
  x,
  y,
  min,
  max,
  step,
  onChange,
}: {
  x: number
  y: number
  min: number
  max: number
  step: number
  onChange: (x: number, y: number) => void
}) {
  const padRef = useRef<HTMLDivElement>(null)
  const norm = (v: number) => (v - min) / (max - min)
  const fromPointer = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect()
    const nx = clampNumber((e.clientX - r.left) / r.width, 0, 1)
    const ny = clampNumber((e.clientY - r.top) / r.height, 0, 1)
    // pad top = +y to match shader space (uv y points up)
    onChange(
      snapValue(min + nx * (max - min), min, step),
      snapValue(min + (1 - ny) * (max - min), min, step)
    )
  }
  return (
    <div
      ref={padRef}
      className="xy-pad"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // synthetic events carry inactive pointer ids; drag still works via buttons check
        }
        fromPointer(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) fromPointer(e)
      }}
    >
      <div
        className="xy-pad-dot"
        style={{ left: `${norm(x) * 100}%`, top: `${(1 - norm(y)) * 100}%` }}
      />
    </div>
  )
}

// Self-updating clock + scrubber, isolated so the per-frame time tick
// re-renders only this component instead of the whole app.
function TimelineClock({
  timeRef,
  onScrub,
}: {
  timeRef: { current: number }
  onScrub: (t: number) => void
}) {
  const [time, setTime] = useState(timeRef.current)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      // setState with an unchanged value bails out, so this is free while paused
      setTime(timeRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [timeRef])
  return (
    <>
      <span className="time">{time.toFixed(1)}s</span>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={60}
        step={0.01}
        value={time % 60}
        onChange={(e) => onScrub(Number(e.target.value))}
      />
    </>
  )
}

function FontPreviewSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const currentIndex = Math.max(0, options.indexOf(value))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const previewAt = (index: number) => {
    const next = options[(index + options.length) % options.length]
    if (next && next !== value) onChange(next)
  }

  return (
    <div className="font-picker" ref={wrapRef}>
      <button
        type="button"
        className="font-picker-btn"
        style={{ fontFamily: `"${value}"` }}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            previewAt(currentIndex + 1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
            previewAt(currentIndex - 1)
          } else if (e.key === 'Home') {
            e.preventDefault()
            setOpen(true)
            previewAt(0)
          } else if (e.key === 'End') {
            e.preventDefault()
            setOpen(true)
            previewAt(options.length - 1)
          } else if (e.key === 'Escape') {
            setOpen(false)
          } else if (e.key === 'Enter') {
            setOpen((next) => !next)
          }
        }}
      >
        {value}
      </button>
      {open && (
        <div className="font-picker-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option}
              className={option === value ? 'on' : ''}
              style={{ fontFamily: `"${option}"` }}
              onMouseEnter={() => onChange(option)}
              onFocus={() => onChange(option)}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
        } else if (p.type === 'text' && typeof v === 'string') {
          base.values[p.key] = v.slice(0, 200)
        } else if (p.type === 'select' && typeof v === 'string' && p.options.includes(v)) {
          base.values[p.key] = v
        } else if ((p.type === undefined || p.type === 'float') && typeof v === 'number' && isFinite(v)) {
          base.values[p.key] = Math.min(p.max, Math.max(p.min, v))
        }
      }
    }
    base.enabled = l.enabled !== false
    base.locked = l.locked === true
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
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
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
  const [aspect, setAspect] = useState<'fill' | '1:1' | '16:9' | '9:16' | 'custom'>('fill')
  const [customW, setCustomW] = useState(1080)
  const [customH, setCustomH] = useState(1080)
  const dragUid = useRef<string | null>(null)
  const [draggingUid, setDraggingUid] = useState<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const prevRects = useRef(new Map<string, number>())

  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  const timeRef = useRef(0)
  playingRef.current = playing
  speedRef.current = speed

  const saveTimer = useRef<number | undefined>(undefined)
  const saveNow = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = undefined
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, layers: layersRef.current }))
    } catch {
      // storage full or unavailable — skip autosave
    }
  }, [])

  const setLayers = useCallback((next: Layer[], structural = false) => {
    layersRef.current = next
    setLayersState(next)
    if (structural && rendererRef.current) {
      rendererRef.current.rebuild(next)
      setError(rendererRef.current.error)
    }
    // debounced autosave: slider drags fire dozens of updates per second,
    // so batch the JSON.stringify + localStorage write
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(saveNow, 300)
  }, [saveNow])

  // flush a pending autosave when the tab is hidden or closed
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current !== undefined) saveNow()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [saveNow])

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
    if (layersRef.current.find((l) => l.uid === uid)?.locked) return
    setLayers(layersRef.current.filter((l) => l.uid !== uid), true)
    if (selected === uid) setSelected(null)
  }

  const moveLayer = (uid: string, dir: -1 | 1) => {
    const arr = [...layersRef.current]
    const i = arr.findIndex((l) => l.uid === uid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    if (arr[i].locked) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setLayers(arr, true)
  }

  const randomizeLayers = () => {
    const gens = EFFECTS.filter((e) => e.kind === 'generate' && e.id !== 'text')
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
    const randomized: Layer[] = stack.map((l) => ({ ...l, values: randomValues(l.effectId) }))
    // locked layers survive the reshuffle, staying at their original slots
    layersRef.current.forEach((l, i) => {
      if (l.locked) randomized.splice(Math.min(i, randomized.length), 0, l)
    })
    setLayers(randomized, true)
    setSelected(randomized[0].uid)
  }

  const randomize = () => {
    setLayers(
      layersRef.current.map((l) =>
        l.locked ? l : { ...l, values: randomValues(l.effectId) }
      )
    )
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === viewportRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      viewportRef.current?.requestFullscreen()
    }
  }

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
      const [aw, ah] =
        aspect === 'custom'
          ? [Math.max(1, customW), Math.max(1, customH)]
          : aspect === '1:1'
            ? [1, 1]
            : aspect === '16:9'
              ? [16, 9]
              : [9, 16]
      const rect = vp.getBoundingClientRect()
      const w = Math.min(rect.width, (rect.height * aw) / ah)
      canvas.style.width = `${w}px`
      canvas.style.height = `${(w * ah) / aw}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [aspect, customW, customH])

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
    // copies start unlocked so they're immediately editable
    const copy: Layer = { ...arr[i], uid: newUid(), locked: false, values: { ...arr[i].values } }
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
      // locked layers hold their slot: can't be dragged or displaced
      if (arr[from].locked || arr[to].locked) return
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const makeExportRenderer = () => {
    const canvas = document.createElement('canvas')
    const renderer = new Renderer(canvas)
    renderer.rebuild(layersRef.current)
    if (renderer.error) {
      setError(renderer.error)
      return null
    }
    return { canvas, renderer }
  }

  const exportPNG = (width: number, height: number, filename = `shaderlab-${width}x${height}`) => {
    const exportTarget = makeExportRenderer()
    if (!exportTarget) return
    const { canvas, renderer } = exportTarget
    renderer.renderFixed(layersRef.current, timeRef.current, width, height)
    canvas.toBlob((blob) => {
      if (!blob) return
      downloadBlob(blob, `${filename}.png`)
    }, 'image/png')
  }

  const waitForPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const readCanvasPixels = (
    source: HTMLCanvasElement,
    width: number,
    height: number,
    target: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ) => {
    target.width = width
    target.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height).data
  }

  const exportGIF = async (
    width: number,
    height: number,
    filename = `shaderlab-${width}x${height}`
  ) => {
    const name = `GIF ${width}x${height}`
    const exportTarget = makeExportRenderer()
    if (!exportTarget) return
    setExporting(name)
    try {
      const { canvas, renderer } = exportTarget
      const readCanvas = document.createElement('canvas')
      const readCtx = readCanvas.getContext('2d', { willReadFrequently: true })
      if (!readCtx) throw new Error('Could not create GIF readback canvas')

      const gif = GIFEncoder()
      const frames = GIF_EXPORT.duration * GIF_EXPORT.fps
      const delay = 1000 / GIF_EXPORT.fps
      const start = timeRef.current
      const speed = speedRef.current

      // Quantizing a fresh palette per frame bloats the file badly: identical
      // colors land on different indices each frame, wrecking LZW compression.
      // Refresh the palette once per second instead — colors stay faithful as
      // the animation drifts, but indices are stable within each chunk.
      const paletteRefresh = 2
      let palette: number[][] = []

      for (let frame = 0; frame < frames; frame++) {
        const frameTime = start + (frame / GIF_EXPORT.fps) * speed
        renderer.renderFixed(layersRef.current, frameTime, width, height)
        renderer.finish()
        const rgba = readCanvasPixels(canvas, width, height, readCanvas, readCtx)
        if (frame % paletteRefresh === 0) palette = quantize(rgba, 256)
        const index = applyPalette(rgba, palette)
        gif.writeFrame(index, width, height, {
          // first frame's palette becomes the global color table; later frames
          // carry it as a local table (768 bytes each — negligible)
          palette,
          delay,
          repeat: 0,
        })
        if (frame % 4 === 3) await waitForPaint()
      }

      gif.finish()
      const gifBytes = gif.bytes()
      const gifBuffer = new Uint8Array(gifBytes.length)
      gifBuffer.set(gifBytes)
      downloadBlob(new Blob([gifBuffer.buffer], { type: 'image/gif' }), `${filename}.gif`)
    } catch (e) {
      setError(`GIF export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExporting(null)
    }
  }

  const getMp4MimeType = () =>
    [
      'video/mp4;codecs="avc1.42E01E"',
      'video/mp4;codecs="avc1.640028"',
      'video/mp4',
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? null

  const exportMP4 = async (width: number, height: number) => {
    const name = `MP4 ${width}x${height}`
    const mimeType = getMp4MimeType()
    if (!mimeType) {
      setError('MP4 export is not supported by this browser.')
      return
    }

    const exportTarget = makeExportRenderer()
    if (!exportTarget) return
    setExporting(name)
    try {
      const { canvas, renderer } = exportTarget
      const stream = canvas.captureStream(MP4_EXPORT.fps)
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: width >= 3840 ? 24_000_000 : 10_000_000,
      })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve()
        recorder.onerror = () => reject(new Error('MP4 recorder failed'))
      })
      recorder.start()

      const frames = MP4_EXPORT.duration * MP4_EXPORT.fps
      const frameMs = 1000 / MP4_EXPORT.fps
      const start = timeRef.current
      const speed = speedRef.current

      for (let frame = 0; frame < frames; frame++) {
        const frameTime = start + (frame / MP4_EXPORT.fps) * speed
        renderer.renderFixed(layersRef.current, frameTime, width, height)
        renderer.finish()
        await new Promise<void>((resolve) => setTimeout(resolve, frameMs))
      }

      recorder.stop()
      stream.getTracks().forEach((track) => track.stop())
      await stopped
      downloadBlob(new Blob(chunks, { type: mimeType }), `shaderlab-${width}x${height}.mp4`)
    } catch (e) {
      setError(`MP4 export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExporting(null)
    }
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
  }

  const customSize = aspect === 'custom' ? { width: customW, height: customH } : null

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
                <div className="export-menu-label">PNG</div>
                {customSize && (
                  <button
                    disabled={exporting !== null}
                    onClick={() => {
                      exportPNG(customSize.width, customSize.height)
                      setExportOpen(false)
                    }}
                  >
                    Custom <em>{customSize.width}×{customSize.height}</em>
                  </button>
                )}
                {PNG_EXPORT_SIZES.map((size) => (
                  <button
                    key={size.label}
                    disabled={exporting !== null}
                    onClick={() => {
                      exportPNG(size.width, size.height)
                      setExportOpen(false)
                    }}
                  >
                    {size.label} <em>{size.width}×{size.height}</em>
                  </button>
                ))}
                <div className="export-menu-label">Discord <em>PNG / GIF</em></div>
                {DISCORD_EXPORTS.map((size) => (
                  <div className="export-menu-split" key={size.label}>
                    <button
                      disabled={exporting !== null}
                      onClick={() => {
                        exportPNG(size.width, size.height, `${size.filename}-${size.width}x${size.height}`)
                        setExportOpen(false)
                      }}
                    >
                      {size.label} PNG <em>{size.width}×{size.height}</em>
                    </button>
                    <button
                      disabled={exporting !== null}
                      onClick={() => {
                        void exportGIF(size.width, size.height, `${size.filename}-${size.width}x${size.height}`)
                        setExportOpen(false)
                      }}
                    >
                      GIF
                    </button>
                  </div>
                ))}
                <div className="export-menu-label">GIF <em>4s / 25fps</em></div>
                {customSize && (
                  <button
                    disabled={exporting !== null}
                    onClick={() => {
                      void exportGIF(customSize.width, customSize.height)
                      setExportOpen(false)
                    }}
                  >
                    Custom <em>{customSize.width}×{customSize.height}</em>
                  </button>
                )}
                {GIF_EXPORT_SIZES.map((size) => (
                  <button
                    key={size.label}
                    disabled={exporting !== null}
                    onClick={() => {
                      void exportGIF(size.width, size.height)
                      setExportOpen(false)
                    }}
                  >
                    {size.label} <em>{size.width}×{size.height}</em>
                  </button>
                ))}
                <div className="export-menu-label">MP4 <em>4s / 30fps</em></div>
                {customSize && (
                  <button
                    disabled={exporting !== null}
                    onClick={() => {
                      void exportMP4(customSize.width, customSize.height)
                      setExportOpen(false)
                    }}
                  >
                    Custom <em>{customSize.width}×{customSize.height}</em>
                  </button>
                )}
                {MP4_EXPORT_SIZES.map((size) => (
                  <button
                    key={size.label}
                    disabled={exporting !== null}
                    onClick={() => {
                      void exportMP4(size.width, size.height)
                      setExportOpen(false)
                    }}
                  >
                    {size.label} <em>{size.width}×{size.height}</em>
                  </button>
                ))}
                <div className="export-menu-label">Source</div>
                <button disabled={exporting !== null} onClick={() => { exportGLSL(); setExportOpen(false) }}>
                  GLSL <em>clipboard</em>
                </button>
                <button disabled={exporting !== null} onClick={() => { exportProject(); setExportOpen(false) }}>
                  Project <em>json</em>
                </button>
              </div>
            )}
          </div>
          <button onClick={() => fileInputRef.current?.click()}>Load</button>
          <a
            className="gh-link"
            href="https://github.com/Zckyy/BlazeShaderLab"
            target="_blank"
            rel="noreferrer"
            title="View source on GitHub"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
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
                    title={l.locked ? 'Locked' : 'Drag to reorder'}
                    draggable={!l.locked}
                    onDragStart={(e) => {
                      if (l.locked) return
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
                  <button
                    className={`eye lock ${l.locked ? 'on' : ''}`}
                    title={l.locked ? 'Unlock layer' : 'Lock layer'}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateLayer(l.uid, { locked: !l.locked })
                    }}
                  >
                    <LockIcon locked={!!l.locked} />
                  </button>
                  <em className={`kind-badge ${fx.kind}`}>
                    {fx.kind === 'generate' ? 'GEN' : 'FX'}
                  </em>
                  <span className="layer-name">{fx.name}</span>
                  <span className="layer-btns">
                    <button onClick={(e) => { e.stopPropagation(); duplicateLayer(l.uid) }} title="Duplicate">⧉</button>
                    <button disabled={l.locked} onClick={(e) => { e.stopPropagation(); moveLayer(l.uid, 1) }} title="Move up">↑</button>
                    <button disabled={l.locked} onClick={(e) => { e.stopPropagation(); moveLayer(l.uid, -1) }} title="Move down">↓</button>
                    <button disabled={l.locked} onClick={(e) => { e.stopPropagation(); removeLayer(l.uid) }} title="Delete">✕</button>
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
            {aspect === 'custom' ? (
              <span className="aspect-custom">
                <input
                  type="number"
                  min={1}
                  value={customW}
                  onChange={(e) => setCustomW(Math.max(1, Number(e.target.value) || 1))}
                />
                <span>×</span>
                <input
                  type="number"
                  min={1}
                  value={customH}
                  onChange={(e) => setCustomH(Math.max(1, Number(e.target.value) || 1))}
                />
              </span>
            ) : (
              <button onClick={() => setAspect('custom')}>Custom</button>
            )}
          </div>
          <button
            className="fullscreen-btn"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isFullscreen ? (
                <>
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </>
              ) : (
                <>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </>
              )}
            </svg>
          </button>
          {error && <pre className="shader-error">{error}</pre>}
          {exporting && <div className="export-status">Exporting {exporting}...</div>}
        </section>

        <aside className="panel props-panel">
          <div className="panel-head">
            <span>{selFx ? selFx.name : 'Properties'}</span>
          </div>
          {sel && selFx && sel.locked ? (
            <div className="empty">Layer locked — unlock to edit</div>
          ) : sel && selFx ? (
            <div className="props">
              {selFx.params.map((p) => {
                const v = sel.values[p.key]
                if (p.type === 'text') {
                  return (
                    <label key={p.key}>
                      <span>{p.label}</span>
                      <textarea
                        className="text-input"
                        rows={2}
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
                if (p.type === 'select') {
                  const cur = typeof v === 'string' ? v : p.def
                  const setSelectValue = (value: string) =>
                    updateLayer(sel.uid, {
                      values: { ...sel.values, [p.key]: value },
                    })
                  if (p.key === 'font') {
                    return (
                      <label key={p.key}>
                        <span>{p.label}</span>
                        <FontPreviewSelect
                          value={cur}
                          options={p.options}
                          onChange={setSelectValue}
                        />
                      </label>
                    )
                  }
                  return (
                    <label key={p.key}>
                      <span>{p.label}</span>
                      <select
                        value={cur}
                        onChange={(e) => setSelectValue(e.target.value)}
                      >
                        {p.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                }
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
                if (p.xy === 'y') return null
                if (p.xy === 'x') {
                  const partnerKey = p.key.slice(0, -1) + 'y'
                  const partner = selFx.params.find((q) => q.key === partnerKey)
                  const pyDef = partner && typeof partner.def === 'number' ? partner.def : 0
                  const px = typeof v === 'number' ? v : p.def
                  const pyRaw = sel.values[partnerKey]
                  const py = typeof pyRaw === 'number' ? pyRaw : pyDef
                  return (
                    <label key={p.key}>
                      <span>
                        {p.label}
                        <em className="xy-value">
                          {px.toFixed(2)}, {py.toFixed(2)}
                        </em>
                      </span>
                      <XYPad
                        x={px}
                        y={py}
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        onChange={(nx, ny) =>
                          updateLayer(sel.uid, {
                            values: { ...sel.values, [p.key]: nx, [partnerKey]: ny },
                          })
                        }
                      />
                    </label>
                  )
                }
                const num = typeof v === 'number' ? v : p.def
                const sliderStep = sliderStepFor(p.min, p.max, p.step)
                const setParamValue = (value: number) =>
                  updateLayer(sel.uid, {
                    values: { ...sel.values, [p.key]: clampNumber(value, p.min, p.max) },
                  })
                return (
                  <label key={p.key}>
                    <span>
                      {p.label}
                      <NumberValueInput
                        value={num}
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        onCommit={setParamValue}
                      />
                    </span>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={sliderStep}
                      value={num}
                      title={`Slider snaps by ${formatNumber(sliderStep, sliderStep)}. Type a value for finer control.`}
                      onChange={(e) => setParamValue(Number(e.target.value))}
                    />
                  </label>
                )
              })}
              <label>
                <span>
                  Opacity
                  <NumberValueInput
                    value={sel.opacity}
                    min={0}
                    max={1}
                    step={0.01}
                    onCommit={(value) => updateLayer(sel.uid, { opacity: clampNumber(value, 0, 1) })}
                  />
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sel.opacity}
                  onChange={(e) =>
                    updateLayer(sel.uid, { opacity: clampNumber(Number(e.target.value), 0, 1) })
                  }
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
        <TimelineClock timeRef={timeRef} onScrub={scrub} />
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
