import type { BlendMode, ParamValue } from './types.ts'

export interface PresetLayer {
  effectId: string
  values?: Record<string, ParamValue>
  opacity?: number
  blend?: BlendMode
}

export interface Preset {
  name: string
  layers: PresetLayer[]
}

export const PRESETS: Preset[] = [
  {
    name: 'Lava Lamp',
    layers: [
      {
        effectId: 'meshgradient',
        values: {
          colA: '#ff3300', colB: '#ff9500', colC: '#8a0f4a', colD: '#2b0233',
          falloff: 2.4, speedM: 0.35, motion: 0.35, warpAmt: 0.32, vortex: 0.3,
        },
      },
      { effectId: 'warp', values: { amount: 0.12, scale: 2.5, speed: 0.3 } },
      { effectId: 'bloom', values: { strength: 0.6, cutoff: 0.55, tint: '#ffb46b' } },
      { effectId: 'vignette', values: { strength: 0.7, radius: 0.9, softness: 0.6, tint: '#12000a' } },
    ],
  },
  {
    name: 'Terminal Green CRT',
    layers: [
      {
        effectId: 'noise',
        values: { colA: '#001604', colB: '#2bff71', scale: 7, speed: 0.5, contrast: 1.6 },
      },
      { effectId: 'slice', values: { bands: 40, offset: 0.015, rate: 6 }, opacity: 0.7 },
      { effectId: 'dither', values: { pxSize: 2, levels: 3, spread: 0.8 }, opacity: 0.8 },
      { effectId: 'crt', values: { curvature: 0.7, scanlines: 0.5, rgbMask: 0.15, flicker: 0.06 } },
    ],
  },
  {
    name: 'Risograph',
    layers: [
      {
        effectId: 'meshgradient',
        values: {
          colA: '#ff3d5a', colB: '#ffd23d', colC: '#ff7a2d', colD: '#c22d5c',
          falloff: 1.6, speedM: 0.15, motion: 0.2, warpAmt: 0.25, vortex: -0.2,
        },
      },
      { effectId: 'halftone', values: { dotSize: 7, colorize: 0, angle: 0.5, ink: '#e8341c', paper: '#f7ecdd' } },
      { effectId: 'grain', values: { amount: 0.12, gsize: 1.5 } },
    ],
  },
  {
    name: 'VHS Nightmare',
    layers: [
      { effectId: 'plasma', values: { scale: 5, speed: 0.6, shift: 0.55 } },
      { effectId: 'warp', values: { amount: 0.1, scale: 4, speed: 0.8 } },
      { effectId: 'slice', values: { bands: 18, offset: 0.06, rate: 3.5 }, opacity: 0.85 },
      { effectId: 'chromab', values: { amount: 2, radial: 0.4 } },
      { effectId: 'crt', values: { curvature: 0.4, scanlines: 0.45, rgbMask: 0.3, flicker: 0.1 } },
      { effectId: 'grain', values: { amount: 0.15, gsize: 2 } },
    ],
  },
  {
    name: 'Neon Kaleidoscope',
    layers: [
      { effectId: 'cosine', values: { scale: 2.2, speed: 0.5, shift: 0.6 } },
      { effectId: 'kaleido', values: { segments: 8, rotation: 0.25, zoomAmt: 1.4 } },
      { effectId: 'warp', values: { amount: 0.08, scale: 5, speed: 0.6 } },
      { effectId: 'bloom', values: { strength: 0.8, cutoff: 0.5, tint: '#7c5cff' } },
      { effectId: 'vignette', values: { strength: 0.9, radius: 0.85, softness: 0.5, tint: '#000000' } },
    ],
  },
  {
    name: 'Ocean Glass',
    layers: [
      {
        effectId: 'meshgradient',
        values: {
          colA: '#003a5c', colB: '#00d5ff', colC: '#0b7a6e', colD: '#c2f5ff',
          falloff: 1.7, speedM: 0.25, motion: 0.25, warpAmt: 0.2, vortex: 0.1,
        },
      },
      { effectId: 'waves', values: { colA: '#001028', colB: '#3dd5ff', freq: 14, speed: 0.6, wobble: 1.2 }, opacity: 0.25, blend: 'add' },
      { effectId: 'flutedglass', values: { ribs: 36, refraction: 0.6, curve: 0.03 } },
      { effectId: 'vignette', values: { strength: 0.5, radius: 0.95, softness: 0.55, tint: '#001020' } },
    ],
  },
  {
    name: 'Aurora',
    layers: [
      {
        effectId: 'meshgradient',
        values: {
          colA: '#00ff9d', colB: '#0b1f4d', colC: '#7c5cff', colD: '#001a10',
          falloff: 1.4, speedM: 0.3, motion: 0.4, warpAmt: 0.45, vortex: 0.2,
        },
      },
      { effectId: 'warp', values: { amount: 0.2, scale: 1.8, speed: 0.25 } },
      { effectId: 'bloom', values: { strength: 0.7, cutoff: 0.45, tint: '#8fffd9' } },
      { effectId: 'grain', values: { amount: 0.05, gsize: 1 } },
      { effectId: 'vignette', values: { strength: 0.85, radius: 1, softness: 0.7, tint: '#000208' } },
    ],
  },
  {
    name: 'Retro Sunset',
    layers: [
      { effectId: 'gradient', values: { colA: '#2b0a4d', colB: '#ff6b35', angle: 1.57, scale: 0.5, speed: 0 } },
      { effectId: 'rings', values: { colA: '#000000', colB: '#ffd23d', count: 3, speed: 0.3, softness: 0.8 }, opacity: 0.5, blend: 'add' },
      { effectId: 'waves', values: { colA: '#000000', colB: '#ff2d96', freq: 30, speed: 0.5, wobble: 0.2 }, opacity: 0.25, blend: 'add' },
      { effectId: 'posterize', values: { levels: 8, gam: 1.1 } },
      { effectId: 'grain', values: { amount: 0.07, gsize: 1.5 } },
    ],
  },
  {
    name: 'Ink Marble',
    layers: [
      { effectId: 'noise', values: { colA: '#0d0d0f', colB: '#f5f2ea', scale: 3, speed: 0.25, contrast: 1.3 } },
      { effectId: 'warp', values: { amount: 0.35, scale: 4, speed: 0.2 } },
      { effectId: 'threshold', values: { cutoff: 0.5, softness: 0.18, dark: '#101012', light: '#f5f2ea' } },
      { effectId: 'grain', values: { amount: 0.06, gsize: 1 } },
    ],
  },
  {
    name: 'Disco Cells',
    layers: [
      { effectId: 'voronoi', values: { colA: '#1a0533', colB: '#ff5ce1', scale: 6, speed: 1, edge: 0.2 } },
      { effectId: 'kaleido', values: { segments: 10, rotation: 0.35, zoomAmt: 1.2 } },
      { effectId: 'hueshift', values: { shift: 0, animate: 0.25, saturation: 1.4 } },
      { effectId: 'bloom', values: { strength: 0.9, cutoff: 0.5, tint: '#ff9dfb' } },
      { effectId: 'vignette', values: { strength: 0.8, radius: 0.9, softness: 0.5, tint: '#08001a' } },
    ],
  },
  {
    name: 'Candy Dither',
    layers: [
      {
        effectId: 'meshgradient',
        values: {
          colA: '#ff9ad5', colB: '#9dfff0', colC: '#fff59d', colD: '#c99dff',
          falloff: 1.9, speedM: 0.3, motion: 0.3, warpAmt: 0.2, vortex: -0.15,
        },
      },
      { effectId: 'pixelate', values: { cells: 90, aspectR: 1 } },
      { effectId: 'dither', values: { pxSize: 4, levels: 5, spread: 1.2 } },
    ],
  },
  {
    name: 'Blueprint',
    layers: [
      { effectId: 'gradient', values: { colA: '#0a2a66', colB: '#0d3d99', angle: 0.8, scale: 0.6, speed: 0.1 } },
      { effectId: 'pattern', values: { colA: '#000000', colB: '#dbe9ff', scale: 24, speed: 0, style: 1, rotation: 0 }, opacity: 0.12, blend: 'add' },
      { effectId: 'pattern', values: { colA: '#000000', colB: '#dbe9ff', scale: 24, speed: 0, style: 1, rotation: 1.5708 }, opacity: 0.12, blend: 'add' },
      { effectId: 'noise', values: { colA: '#000000', colB: '#ffffff', scale: 2, speed: 0.15, contrast: 1 }, opacity: 0.12, blend: 'multiply' },
      { effectId: 'vignette', values: { strength: 0.6, radius: 1.05, softness: 0.6, tint: '#04122e' } },
    ],
  },
  {
    name: 'Hypno Rings',
    layers: [
      { effectId: 'rings', values: { colA: '#0b0b0c', colB: '#e8e8ec', count: 18, speed: 1.4, softness: 0.35 } },
      { effectId: 'warp', values: { amount: 0.08, scale: 3, speed: 0.5 } },
      { effectId: 'chromab', values: { amount: 1.6, radial: 1 } },
      { effectId: 'vignette', values: { strength: 0.9, radius: 0.85, softness: 0.5, tint: '#000000' } },
    ],
  },
  {
    name: 'Molten Kaleido',
    layers: [
      { effectId: 'plasma', values: { scale: 4, speed: 0.4, shift: 0.05 } },
      { effectId: 'kaleido', values: { segments: 6, rotation: -0.15, zoomAmt: 0.9 } },
      { effectId: 'warp', values: { amount: 0.15, scale: 2.5, speed: 0.4 } },
      { effectId: 'posterize', values: { levels: 6, gam: 1.2 } },
      { effectId: 'bloom', values: { strength: 0.5, cutoff: 0.6, tint: '#ffae5c' } },
    ],
  },
  {
    name: 'Newsprint',
    layers: [
      { effectId: 'meshgradient', values: {
        colA: '#222222', colB: '#eeeeee', colC: '#555555', colD: '#bbbbbb',
        falloff: 2, speedM: 0.25, motion: 0.3, warpAmt: 0.3, vortex: 0.4,
      } },
      { effectId: 'ascii', values: { cellSize: 10, colorize: 0, ink: '#1a1a1a' } },
      { effectId: 'threshold', values: { cutoff: 0.4, softness: 0.3, dark: '#f4efe6', light: '#1a1a1a' } },
      { effectId: 'grain', values: { amount: 0.08, gsize: 1 } },
    ],
  },
]
