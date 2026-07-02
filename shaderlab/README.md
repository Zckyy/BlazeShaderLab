# Blaze ShaderLab

A lightweight browser-based visual shader editor, inspired by Basement Studio's Shader Lab. Build GPU effects by stacking layers and tweaking sliders — no GLSL required.

## Stack

- Vite + React + TypeScript
- Raw WebGL2 (no three.js — the whole app is one fullscreen fragment shader generated from your layer stack)
- Fully static — deploys to Vercel's free tier with zero config

## Features

- **Layer stack**: 6 generators (Plasma, FBM Noise, Voronoi, Rings, Waves, Cosine Gradient) and 7 modifiers (Noise Warp, Kaleidoscope, Pixelate, Hue Shift, Posterize, Vignette, Film Grain)
- Per-layer parameters, opacity, and blend modes (normal / add / multiply)
- Reorder, toggle, and delete layers
- Timeline with play/pause, scrubbing, and speed control
- Randomize all parameters
- Export the generated GLSL fragment shader to clipboard

## Run locally

```sh
npm install
npm run dev
```

## Deploy to Vercel

```sh
npx vercel
```

Vercel auto-detects Vite: build command `npm run build`, output `dist`. Nothing else needed.
