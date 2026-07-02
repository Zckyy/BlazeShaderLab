# BlazeShaderLab

BlazeShaderLab is a browser-based shader art tool for building animated visuals from a stack of generator and effect layers. It is designed for quick experimentation: add layers, tweak parameters, preview motion in real time, and export stills or short animations without writing GLSL by hand.

The app lives in the `shaderlab/` directory and is built with React, TypeScript, Vite, and raw WebGL2.

## Features

- Layer-based shader editor with reorderable, toggleable, duplicatable, and lockable layers.
- Generator layers for creating base visuals, including gradients, noise, plasma, Voronoi, rings, waves, patterns, metaballs, starfields, caustics, aurora, truchet patterns, and text.
- FX layers for modifying visuals, including warp, kaleidoscope, pixelate, fluted glass, magnify lens, slice, halftone, ASCII, threshold, edge detect, bloom, chromatic aberration, hue shift, posterize, dithering, CRT, vignette, and film grain.
- Text layers with editable copy, font selection, fill/outline styling, gradients, shadow controls, transform controls, wobble, spin, and glitch settings.
- Font preview picker that updates text immediately when hovering fonts or moving through them with arrow keys.
- Editable numeric inputs for exact parameter values, plus slider snapping for broader ranges.
- Timeline controls for play/pause, scrubbing, and animation speed.
- Aspect controls for fill, square, landscape, and portrait preview modes.
- Built-in presets, including Cyberpunk, Waveform, Dot Matrix, Dot Wave, Terminal Green CRT, Molten Kaleido, Warning Tape, Silver Surfer, Wavy Dots, Pink Void, Aurora Haze, and Dystopia.
- Project import/export as JSON.
- Shareable URL hashes for layer stacks.
- GLSL export to clipboard.
- Fixed-resolution PNG exports.
- GIF and MP4 animation exports.
- Discord-focused PFP and banner exports.

## Export Options

### PNG

Fixed PNG exports are rendered offscreen, so they are not tied to the current preview canvas size.

- 1080p: `1920x1080`
- 1440p: `2560x1440`
- 4K: `3840x2160`

### GIF

GIF exports render deterministic offscreen frames with steady timing for smoother playback.

- 720p: `1280x720`
- 1080p: `1920x1080`
- 4 seconds at 25fps

### MP4

MP4 exports use browser `MediaRecorder` support.

- 1080p: `1920x1080`
- 4K: `3840x2160`
- 4 seconds at 30fps

### Discord

Discord exports are sized for common profile use cases.

- PFP PNG/GIF: `512x512`
- Banner PNG/GIF: `680x240`

## GEN vs FX Layers

`GEN` layers create pixels from scratch. Use these as the foundation of a shader stack.

Examples:

- Plasma
- Waves
- Noise
- Text
- Aurora
- Starfield

`FX` layers modify pixels that already exist. Use these after a generator to shape, distort, color, or stylize the result.

Examples:

- Bloom Glow
- CRT
- Dithering
- Pixelate
- Kaleidoscope
- Edge Detect

A typical stack starts with one or more `GEN` layers, then adds `FX` layers above them.

## Getting Started

Requirements:

- Node.js
- npm
- A browser with WebGL2 support

Install dependencies:

```sh
cd shaderlab
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Project Structure

```txt
.
├── README.md
├── vercel.json
└── shaderlab
    ├── public
    │   └── fonts
    ├── src
    │   ├── App.tsx
    │   ├── effects.ts
    │   ├── fonts.ts
    │   ├── main.tsx
    │   ├── presets.ts
    │   ├── renderer.ts
    │   ├── style.css
    │   └── types.ts
    ├── index.html
    ├── package.json
    └── vite.config.ts
```

Key files:

- `shaderlab/src/App.tsx`: main React app, layer UI, project import/export, and media exports.
- `shaderlab/src/effects.ts`: effect definitions, parameter schemas, and GLSL snippets.
- `shaderlab/src/renderer.ts`: WebGL2 renderer and shader compilation.
- `shaderlab/src/presets.ts`: built-in preset layer stacks.
- `shaderlab/src/fonts.ts`: text layer font metadata and canvas text rendering.
- `shaderlab/src/style.css`: app styling.
- `vercel.json`: Vercel build configuration for the nested `shaderlab/` app.

## Deployment

This repo is configured for Vercel with the app inside `shaderlab/`.

Vercel commands are defined in `vercel.json`:

- Install: `npm --prefix shaderlab ci`
- Build: `npm --prefix shaderlab run build`
- Output directory: `shaderlab/dist`

## Notes

- The first fresh visit loads the Cyberpunk text preset by default.
- If a browser already has a saved project in local storage, the saved project is restored instead of the default preset.
- WebGL2 is required.
- MP4 export depends on the browser's `MediaRecorder` MP4 support.
