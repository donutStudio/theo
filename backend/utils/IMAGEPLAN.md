# Screenshot Grid + Screen Size Metadata (Label-Free)

## Summary
Implement a Flask endpoint `/screenshot` that captures the local screen in Python,
overlays a label-free coordinate grid (minor lines every 10px, major lines every
100px), losslessly compresses to PNG (best-effort, variable size), and returns
the image plus screen size metadata so the agent can infer absolute coordinates
without numeric labels on the grid.

## Goals and Success Criteria
- Screenshot image includes a readable grid without clutter from labels.
- Screen width/height are provided so the agent can infer coordinates.
- Grid spacing supports plus or minus 10-20px accuracy.
- Processing is fast enough for interactive use.

## Scope
In scope:
- Screenshot capture in backend Python.
- Grid overlay lines only.
- PNG lossless compression (best effort).
- JSON response including screen size metadata.

Out of scope:
- OCR, semantic UI detection, PyAutoGUI execution (future).

## API Design
Endpoint: `GET /screenshot`

Response:
```json
{
  "format": "png",
  "width": 1920,
  "height": 1080,
  "grid": { "minor": 10, "major": 100 },
  "image_base64": "<base64_png>"
}
```

Failure:
- `500` with `{ "error": "Failed to capture screenshot" }`

## Implementation Details

### 1) Capture + Grid Overlay (`backend/utils/imageProcessor.py`)
- Capture using `pyautogui.screenshot()` or `PIL.ImageGrab.grab()`.
- Draw grid lines only:
  - Minor every 10px (light, thin).
  - Major every 100px (slightly darker/thicker).
- No numeric labels.

### 2) Compression
- Save to PNG with `optimize=True`.
- Accept variable output size for best-effort lossless compression.

### 3) Route Integration (`backend/app.py`)
- Add `/screenshot` route to call processing function.
- Return JSON with base64 image + metadata.

### 4) Dependencies
- Add `pillow` and `pyautogui` to `backend/requirements.txt` if missing.

## Edge Cases
- Multi-monitor: capture primary display only for now.
- Permissions: return clear error on failure.

## Tests / Manual Verification
- Call `/screenshot` and verify:
  - JSON fields present.
  - Base64 decodes to PNG.
  - Grid visible at 10px/100px spacing.
  - Width/height match screen.

## Public Interface Changes
- New endpoint: `GET /screenshot`
- JSON response includes screen size metadata.

## Assumptions and Defaults
- Label-free grid.
- Spacing: 10px minor, 100px major.
- Backend Python capture.
- PNG lossless, best-effort compression.
- Base64 in JSON response.
