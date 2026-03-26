# Video Background Refactor Map

Branch: `video-background-spike`

## Goal

Replace the current `react-three-fiber` background scene with a pre-rendered looping video so the app:

- starts faster
- does less GPU/CPU work on tablets and kiosk hardware
- behaves more predictably across browsers

The chat and audio experience should remain unchanged.

## Current State

The current background stack is spread across these files:

- `src/pages/Home.tsx`
- `src/map/Canvas.tsx`
- `src/map/ObjectMesh.tsx`
- `src/map/PlaneMesh.tsx`
- `src/context/AppContext.ts`
- `src/main.tsx`

The current scene uses:

- `@react-three/fiber`
- `@react-three/drei`
- `three`
- `public/models/hippocampus.optimized.glb`
- `public/layers/carte.jpg`
- `public/layers/white-px.jpg`

## Target State

Use a background video element instead of `MapCanvas`.

### Visual Structure

`Home.tsx` should render:

1. A full-screen background video
2. An optional static poster/fallback image
3. The existing gradient overlay
4. The existing language picker / header / chat UI

### Behavior

- Video should autoplay
- Video should be muted
- Video should loop
- Video should use `playsInline`
- Video should not block chat startup
- On low-capability devices, a poster image should still look acceptable

## Refactor Steps

### 1. Add video assets

Add at least:

- `public/video/background-loop.mp4`
- optionally `public/video/background-loop.webm`
- `public/video/background-poster.jpg`

Encoding targets:

- short seamless loop
- 720p or 1080p depending on kiosk screen quality
- H.264 MP4 as baseline
- muted, no audio track

### 2. Replace `MapCanvas` in `Home.tsx`

In `src/pages/Home.tsx`:

- remove lazy import of `../map/Canvas`
- remove `shouldRenderScene` logic
- replace the background `div` contents with a `<video>` element
- keep the existing overlay gradient and z-index layering

Suggested structure:

```tsx
<div className='absolute inset-0 -z-10 overflow-hidden'>
  <video
    className='h-full w-full object-cover'
    autoPlay
    muted
    loop
    playsInline
    preload='metadata'
    poster='/video/background-poster.jpg'
  >
    <source src='/video/background-loop.mp4' type='video/mp4' />
    <source src='/video/background-loop.webm' type='video/webm' />
  </video>
</div>
```

### 3. Remove no-longer-needed app state

The context is currently mostly there to support the 3D scene.

In:

- `src/context/AppContext.ts`
- `src/main.tsx`
- `src/pages/Home.tsx`

review and remove:

- `viewMode`
- `zoomIn`
- `headerVisible`

If no other component needs global state afterward, remove the context entirely.

### 4. Delete the Three scene code

After `Home.tsx` is stable with video, remove:

- `src/map/Canvas.tsx`
- `src/map/ObjectMesh.tsx`
- `src/map/PlaneMesh.tsx`

Then remove related dependencies from `package.json`:

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@types/three`

Also simplify `vite.config.ts` by deleting:

- Three dedupe rules
- Three aliases
- `stats-gl` shims
- manual chunking dedicated to Three

### 5. Revisit background music loading

This is independent of the 3D removal and still worth doing.

In `src/lib/music.ts`:

- keep deferred loading
- consider replacing `backgroundmusic.mp3` with a smaller encode

The current music file is still a larger payload risk than the optimized model.

### 6. Keep chat behavior intact

No intended behavioral changes in:

- `src/components/ChatPanel.tsx`
- backend chat routes/services

This refactor should be visual/runtime only unless later work explicitly addresses TTS or request flow.

## Nice-to-Have Follow-ups

### A. Device-aware fallback

If the video still feels heavy on older hardware:

- serve a static image on coarse/low-memory devices
- or skip autoplay until language selection

### B. Reduced motion support

Respect `prefers-reduced-motion` by switching to poster image only.

### C. Asset delivery

If deployed behind a CDN or static host:

- cache video aggressively
- keep poster tiny
- verify range requests work for MP4

## Expected Impact

Most likely improvements:

- faster perceived startup
- less jank during chat
- fewer GPU spikes
- simpler codebase

Most likely non-improvements:

- backend answer latency
- TTS generation latency
- large background music download unless re-encoded separately

## Recommended Order

1. Add video assets
2. Swap `Home.tsx` from Three to video
3. Test on target devices
4. Remove dead Three/state code
5. Remove Three dependencies and simplify build config
