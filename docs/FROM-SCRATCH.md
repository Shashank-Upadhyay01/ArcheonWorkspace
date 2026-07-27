# From-scratch policy

**Date:** 2026-07-27  
**Product:** Archeon Workspace  

## What you asked for

> Everything should be made from scratch; remake anything that was not.

That goal is taken seriously. It is also constrained by physics and time:

| Layer | “From scratch” reality |
|-------|-------------------------|
| Window / GPU / HTML | Replacing Chromium ≈ multi-year browser project |
| OS PTY / process | Replacing node-pty ≈ reimplementing ConPTY + Unix PTY |
| Full VT terminal | Replacing xterm.js ≈ years of edge cases |
| Trained ASR models | Building Whisper-class models ≈ research org + GPU farm |

We **will not** fake “from scratch” by rewriting Chromium. We **will** own every line of *product* logic and rebuild soft dependencies.

## Two tiers

### Tier 0 — Platform engines (allowed; not rewritten)

Treated like the OS kernel or GPU driver: we *use* them, we don’t reimplement them.

- **Electron / Chromium** — process model, window, sandbox, Web APIs  
- **node-pty** — host PTY (ConPTY / Unix)  
- **xterm.js** — VT paint (until a custom terminal renderer is scheduled)  
- **React** — view tree (UI *components* and state are ours)  
- **Zod** — schema parse (could be swapped for hand parsers later)  
- **electron-builder** — packaging  

### Tier 1 — Must be ours (from scratch / remade)

| Area | Status |
|------|--------|
| Layout tree, presets, dock | Custom |
| Workspace persistence, recovery | Custom |
| CLI agent profiles, PATH resolve | Custom |
| OAuth URL detect + browser open | Custom |
| Auto-updater (GitHub Releases) | Custom (no electron-updater) |
| Token budget, session memory, tasks | Custom |
| **App state store** | **Remade** — no Zustand |
| **Voice pipeline** | **Remade** — Web Audio DSP + VAD + capture; STT via pluggable backend |
| Semver, login-url, shell-args | Custom |

### Tier 2 — Hard research (roadmapped, not claimed done)

| Area | Approach |
|------|----------|
| Local ASR / “voice agent” without OS speech | **Done (v0.4):** on-device Whisper-tiny.en via ONNX (`@xenova/transformers`); our VAD/PCM/resample; first-run download into browser cache |
| Custom terminal renderer | Canvas/WebGL VT emulator replacing xterm |
| Native shell without Electron | Tauri or pure Win32/Linux GUI (new product line) |

## Voice design (from scratch where it matters)

```
Mic → getUserMedia
    → AudioContext (ours)
    → AnalyserNode FFT/RMS → real waveform bars
    → Energy VAD (ours) → speech segments
    → MediaRecorder / PCM buffer (ours)
    → SpeechBackend.transcribe(segment)
         ├─ SystemSpeechBackend  (Chromium OS speech — temporary default)
         └─ LocalModelBackend    (future: our model weights)
    → insertTextAtFocus (ours)
```

Waveform is **not** a fake sine animation; it is driven by live mic energy.

## Dependency rule going forward

1. No new UI kit, dock library, or updater library.  
2. Prefer 50 lines of our code over a dependency.  
3. Every remaining Tier 0 package must stay listed in this file with a reason.  
4. When a Tier 2 item lands, delete the corresponding Tier 0 usage.

## Honest timeline

- **Now:** product fully owned; soft deps removed where practical (Zustand, electron-updater, uuid).  
- **Next quarters:** local ASR model, optional custom terminal.  
- **Never promised as “weekend from scratch”:** Chromium, ConPTY, full ASR training stack.

---

*This file is the contract for “from scratch.”*
