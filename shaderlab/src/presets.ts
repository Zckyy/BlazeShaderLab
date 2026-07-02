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
    name: 'Cyberpunk',
    layers: [
      { effectId: 'plasma', values: { scale: 8.5, speed: 0.56, shift: 0.95 } },
      { effectId: 'ascii', values: { cellSize: 34, colorize: 0.69, ink: '#90601c' } },
      {
        effectId: 'text',
        values: {
          txt: 'SHADERLAB',
          font: 'Basement Grotesque',
          style: 'Fill + Outline',
          fill: '#ffffff',
          fill2: '#dbdb00',
          grad: 0,
          outCol: '#c712ca',
          size: 0.35,
          posX: 0,
          posY: -0.1,
          rot: 0,
          spin: 0,
          wobble: 0,
          wspeed: 2,
          glitch: 0,
          shadowX: 0.01,
          shadowY: -0.02,
          shadowCol: '#000000',
        },
      },
      {
        effectId: 'text',
        values: {
          txt: 'BLAZE',
          font: 'Zen Dots',
          style: 'Fill',
          fill: '#ffffff',
          fill2: '#ff2d96',
          grad: 0,
          outCol: '#00d5ff',
          size: 0.7,
          posX: 0,
          posY: 0.1,
          rot: 0,
          spin: 0,
          wobble: 0,
          wspeed: 2,
          glitch: 0,
          shadowX: 0.01,
          shadowY: -0.02,
          shadowCol: '#000000',
        },
      },
      { effectId: 'dither', values: { pxSize: 3, levels: 8, spread: 1.94 } },
    ],
  },
  {
    name: 'Waveform',
    layers: [
      {
        effectId: 'flutedglass',
        values: { ribs: 120, refraction: 0.84, curve: 0.056 },
        opacity: 0.03,
      },
      {
        effectId: 'aurora',
        values: {
          colA: '#364695',
          colB: '#442766',
          colC: '#8a1930',
          speed: 1.35,
          intensity: 0.65,
        },
      },
      { effectId: 'bloom', values: { strength: 1.71, cutoff: 0.33, tint: '#15ec8b' } },
      { effectId: 'grain', values: { amount: 0.05, gsize: 1.6 }, opacity: 0.43 },
      { effectId: 'chromab', values: { amount: 2.16, radial: 0.92 } },
    ],
  },
  {
    name: 'Dot Matrix',
    layers: [
      {
        effectId: 'waves',
        values: { colA: '#a14730', colB: '#25caa1', freq: 10, speed: 2, wobble: 2.5 },
        opacity: 0.8,
      },
      {
        effectId: 'halftone',
        values: {
          dotSize: 35,
          colorize: 0.57,
          angle: 0.6,
          ink: '#758336',
          paper: '#fd8937',
        },
      },
      {
        effectId: 'text',
        values: {
          txt: 'BLAZE SHADERLAB',
          font: 'Permanent Marker',
          style: 'Fill',
          fill: '#000000',
          fill2: '#ff2d96',
          grad: 0,
          outCol: '#00d5ff',
          size: 0.8,
          posX: 0,
          posY: 0,
          rot: 0,
          spin: 0,
          wobble: 0.005,
          wspeed: 1.1,
          glitch: 0,
          shadowX: 0.01,
          shadowY: -0.01,
          shadowCol: '#f2f2f2',
        },
      },
      {
        effectId: 'edges',
        values: { strength: 6.5, colorize: 0.28, invert: 0, ink: '#45e9a3' },
      },
    ],
  },
  {
    name: 'Dot Wave',
    layers: [
      {
        effectId: 'waves',
        values: { colA: '#ff3800', colB: '#000000', freq: 10, speed: 1, wobble: 0.75 },
        opacity: 0.8,
      },
      {
        effectId: 'halftone',
        values: {
          dotSize: 35,
          colorize: 0.7,
          angle: 0.4,
          ink: '#ff2f00',
          paper: '#ff4d00',
        },
      },
      {
        effectId: 'text',
        values: {
          txt: 'BLAZE SHADERLAB',
          font: 'Permanent Marker',
          style: 'Fill',
          fill: '#000000',
          fill2: '#ff2d96',
          grad: 0,
          outCol: '#00d5ff',
          size: 0.8,
          posX: 0,
          posY: 0,
          rot: 0,
          spin: 0,
          wobble: 0.005,
          wspeed: 1.1,
          glitch: 0,
          shadowX: 0.01,
          shadowY: -0.01,
          shadowCol: '#8d8b8b',
        },
      },
      {
        effectId: 'edges',
        values: { strength: 20, colorize: 0.8, invert: 0, ink: '#45e9a3' },
      },
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
    name: 'Warning Tape',
    layers: [
      {
        effectId: 'gradient',
        values: { colA: '#652035', colB: '#a8bd0a', angle: 2.5, scale: 2, speed: 0.5 },
      },
      { effectId: 'ascii', values: { cellSize: 26, colorize: 0.81, ink: '#d7e605' }, opacity: 0.71 },
    ],
  },
  {
    name: 'Silver Surfer',
    layers: [
      { effectId: 'plasma', values: { scale: 4, speed: 2.04, shift: 0.67 } },
      { effectId: 'hueshift', values: { shift: 0.99, animate: 0.74, saturation: 0.03 } },
    ],
  },
  {
    name: 'Wavy Dots',
    layers: [
      {
        effectId: 'waves',
        values: { colA: '#634caa', colB: '#96b128', freq: 32, speed: -1.01, wobble: 1.93 },
      },
      { effectId: 'grain', values: { amount: 0.055, gsize: 1.8 } },
      {
        effectId: 'halftone',
        values: { dotSize: 28, colorize: 0.45, angle: 2.24, ink: '#113d9a', paper: '#1d2431' },
      },
      { effectId: 'grain', values: { amount: 0.02, gsize: 4 } },
    ],
  },
  {
    name: 'Pink Void',
    layers: [
      { effectId: 'plasma', values: { scale: 16.2, speed: 0.7, shift: 0.16 } },
      { effectId: 'grain', values: { amount: 0.115, gsize: 4.4 } },
      {
        effectId: 'threshold',
        values: { cutoff: 0.35, softness: 0.48, dark: '#644984', light: '#ef34fd' },
      },
      { effectId: 'slice', values: { bands: 4, offset: 0.03, rate: 9.6 } },
    ],
  },
  {
    name: 'Aurora Haze',
    layers: [
      {
        effectId: 'waves',
        values: { colA: '#f49df2', colB: '#19c32e', freq: 8.5, speed: -0.49, wobble: 0.02 },
      },
      {
        effectId: 'gradient',
        values: { colA: '#606238', colB: '#6e2c87', angle: 3.71, scale: 0.46, speed: 0.46 },
        opacity: 0.54,
        blend: 'add',
      },
      {
        effectId: 'cosine',
        values: { scale: 1.12, speed: 0.51, shift: 0.52 },
        opacity: 0.57,
        blend: 'multiply',
      },
      { effectId: 'hueshift', values: { shift: 0.06, animate: 0.97, saturation: 0.17 } },
    ],
  },
  {
    name: 'Dystopia',
    layers: [
      {
        effectId: 'truchet',
        values: { colA: '#dffd15', colB: '#0e657f', scale: 5, width: 0.085, rate: 3.7 },
      },
      { effectId: 'ascii', values: { cellSize: 14, colorize: 0.52, ink: '#849f60' } },
      { effectId: 'grain', values: { amount: 0.21, gsize: 2.4 } },
    ],
  },
]
