---
name: verify
description: How to run and verify this app's stem player audio behaviour headlessly
---

# Verifying text-memorisation

## Build / launch

- `npm install` then `npm run build` (Vite). No unit tests in `src/`.
- Dev server needs Supabase env vars or `src/utils/supabase.js` throws:
  `VITE_SUPABASE_URL=https://example.invalid VITE_SUPABASE_ANON_KEY=dummy npx vite --port 5173 --strictPort`
- Supabase storage is unreachable offline; the stem player still works if you
  pass `stems` as props (any URL Vite can serve, e.g. a generated WAV).

## Driving the stem player headlessly

- Playwright: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] })`
  (installed playwright versions may not match the preinstalled browser build).
- Create a page under a temp dir inside the repo (Vite only serves under root)
  that imports `/src/stemplayer/index.js` and mounts `<stemplayer-js>` with a
  `<stemplayer-js-stem src="...">`, or mounts
  `src/components/StemPlayerWrapper.jsx` via React for the A-B loop UI.
- Wait for `document.querySelector('stemplayer-js-stem')?.isLoaded` — the
  `stem:load:end` event is stopPropagation'd by the player, so it never
  reaches the document.
- Buttons (Playwright CSS pierces shadow DOM): play/pause is the first
  `stemplayer-js-controls fc-player-button`; loop is
  `fc-player-button[type="loop"]`.

## Measuring audio output (gaps, continuity)

Before app code loads, patch `AudioNode.prototype.connect` in a classic
script: when anything connects to an `AudioDestinationNode`, also connect it
to a `ScriptProcessorNode(512)` that logs
`{ t: ctx.currentTime, w: performance.now(), rms }` into `window.__rms`.
Play a generated sine WAV; silence gaps show as low-RMS windows. Note:
`ctx.currentTime` freezes while the AudioContext is suspended — compare wall
time (`w`) deltas against `t` deltas to catch suspend/resume stalls.
