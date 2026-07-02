// Display fonts for the Text layer, served from the Google Fonts CDN
// (stylesheet linked in index.html). Fonts download lazily on first use;
// until a font arrives the text texture renders with a fallback and is
// re-rendered once the real font is available.

export interface FontDef {
  family: string
  weight: number
}

export const FONTS: FontDef[] = [
  // self-hosted, see /public/fonts and the @font-face rules in index.html
  { family: 'Array', weight: 400 },
  { family: 'Basement Grotesque', weight: 700 },
  { family: 'Satoshi', weight: 900 },
  { family: 'Bungee', weight: 400 },
  { family: 'Bungee Shade', weight: 400 },
  { family: 'Monoton', weight: 400 },
  { family: 'Rubik Glitch', weight: 400 },
  { family: 'Orbitron', weight: 800 },
  { family: 'Audiowide', weight: 400 },
  { family: 'Zen Dots', weight: 400 },
  { family: 'Wallpoet', weight: 400 },
  { family: 'Major Mono Display', weight: 400 },
  { family: 'Press Start 2P', weight: 400 },
  { family: 'Unbounded', weight: 900 },
  { family: 'Syne', weight: 800 },
  { family: 'Archivo Black', weight: 400 },
  { family: 'Anton', weight: 400 },
  { family: 'Bebas Neue', weight: 400 },
  { family: 'Black Ops One', weight: 400 },
  { family: 'Chakra Petch', weight: 700 },
  { family: 'Creepster', weight: 400 },
  { family: 'Faster One', weight: 400 },
  { family: 'Michroma', weight: 400 },
  { family: 'Permanent Marker', weight: 400 },
  { family: 'Righteous', weight: 400 },
  { family: 'Rubik Mono One', weight: 400 },
  { family: 'Silkscreen', weight: 400 },
  { family: 'Tourney', weight: 900 },
]

export const FONT_MAP = new Map(FONTS.map((f) => [f.family, f]))
export const DEFAULT_FONT = FONTS[0]

const requested = new Set<string>()

export function ensureFontLoaded(font: FontDef) {
  if (requested.has(font.family)) return
  requested.add(font.family)
  void document.fonts.load(`${font.weight} 100px "${font.family}"`)
}

export function fontLoaded(font: FontDef): boolean {
  return document.fonts.check(`${font.weight} 100px "${font.family}"`)
}

export type TextStyle = 'Fill' | 'Outline' | 'Fill + Outline'
export const TEXT_STYLES: TextStyle[] = ['Fill', 'Outline', 'Fill + Outline']

// Draws white text (alpha mask) centered on a square transparent canvas.
// Supports multi-line via \n; font size auto-fits with padding.
export function drawTextToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  font: FontDef,
  style: TextStyle = 'Fill'
) {
  const S = 1024
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  const lines = text.split('\n')
  if (lines.every((l) => l.trim() === '')) return
  const lineHeight = 1.15
  const basePx = 200
  ctx.font = `${font.weight} ${basePx}px "${font.family}", sans-serif`
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
  const fitW = (S * 0.9) / widest
  const fitH = (S * 0.86) / (lines.length * lineHeight * basePx)
  const px = Math.max(8, Math.floor(basePx * Math.min(fitW, fitH)))
  ctx.font = `${font.weight} ${px}px "${font.family}", sans-serif`
  // fill mask lives in the red channel, outline mask in green — the shader
  // colors each independently (alpha = combined coverage, used for shadows)
  ctx.fillStyle = '#ff0000'
  ctx.strokeStyle = '#00ff00'
  ctx.lineWidth = Math.max(2, px * 0.045)
  ctx.lineJoin = 'round'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const total = lines.length * lineHeight * px
  const startY = S / 2 - total / 2 + (lineHeight * px) / 2
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight * px
    if (style !== 'Outline') ctx.fillText(line, S / 2, y)
    if (style !== 'Fill') ctx.strokeText(line, S / 2, y)
  })
}
