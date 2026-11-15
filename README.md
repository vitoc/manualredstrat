# Running Root scan-and-chase strategy

Uses [runningroot.js](https://github.com/vitoc/runningroot.js) to play in a visible Microsoft Edge window.

```powershell
npm install
npm start
```

The strategy looks **up, right, down, left, up**, remembers chickens seen during
the scan, then approaches and presses catch when close. It refreshes its target
from live sightings and scans again if the target disappears or pursuit stalls.
With no chicken visible, it moves an estimated **60 px right** and repeats.
At a configured horizontal boundary it reverses, patrolling back and forth.
Chickens spotted during patrol are pursued immediately.

## Movement calibration

The current live game reports facing and visible targets, but no player position
or map boundaries. As selected, movement and boundary detection therefore use
dead reckoning, **not exact measured coordinates**. Scan taps also move the
player slightly. Chicken bearings are interpreted relative to reported facing.

Set these values to match your map and spawn position:

```powershell
$env:MAP_WIDTH = '1280'       # Estimated playable width in pixels
$env:PLAYER_START_X = '640'   # Estimated initial X from the left boundary
$env:PLAYER_SPEED = '300'     # Estimated movement speed in pixels per second
npm start
```

Defaults are 1280 px width, a centered starting X, and 300 px/s.
These are calibration assumptions, not verified map dimensions. Collisions,
acceleration, or frame timing can cause drift; accurate physical edge detection
requires the game to expose position and boundary telemetry.

The strategy repeats until the module reports game completion or the browser is
closed. Runs save video and traces under `recordings`.

```powershell
npm test
```
