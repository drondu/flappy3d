# Flappy Bird 3D

A zero-dependency WebGL 3D implementation of Flappy Bird with procedural 3D geometry, Blinn-Phong + hemisphere lighting, atmospheric fog, switchable 3D cameras, and Web Audio synthesized sound effects.

## Play Locally

Open `index.html` directly in your browser, or run a lightweight local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

- **Flap / Start / Restart**: `Space`, `ArrowUp`, `W`, or click/tap the canvas
- **Cycle 3D Camera** (`3/4 Chase` / `Side 3D` / `Behind`): `C`
- **Cycle Sky Theme** (`Auto` / `Golden` / `Day` / `Night`): `T`
- **Pause / Resume**: `P` or `Escape`
- **Mute / Unmute**: `M`

## Features

- Custom WebGL 3D renderer (`renderer3d.js`) with zero external libraries
- Procedural 3D bird with hierarchically articulated flapping wings, hollow-rimmed cylindrical pipes, glowing gap guide hoops, ground shadows, trees, distant skyscrapers, volumetric clouds, and 3D particles
- Smoothly interpolated camera transitions between `3/4 Chase`, `Side 3D`, and `Behind` views
- Crisp 2D Canvas HUD overlay for scores, projected `+1` popups, and Bronze/Silver/Gold/Platinum medals
- Web Audio retro sound synthesizer (`audio.js`) and `localStorage` high-score persistence

## Deploy with GitHub Pages

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **`main`** and folder **`/ (root)`**, then click **Save**.
4. Once published, play at `https://drondu.github.io/flappy3d/`.
