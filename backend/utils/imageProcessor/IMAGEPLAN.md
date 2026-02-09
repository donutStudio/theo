# Screenshot Grid + Screen Size Metadata (Label-Free)

## Summary
Implement a Flask endpoint `/screenshot` that captures the local screen in Python,
overlays a label-free coordinate grid (minor lines every 10px, major lines every
100px), then downsizes the image to reduce vision token usage and finally keeps
the result as a PIL Image for in-process LLM usage. The metadata includes the
original screen size, grid spacing, and a scale factor so the agent can infer
absolute coordinates without numeric labels on the grid.

## Goals and Success Criteria
- Screenshot image includes a readable grid without clutter from labels.
- Screen width/height are provided so the agent can infer coordinates.
- Grid spacing supports plus or minus 10-20px accuracy.
- Processing is fast enough for interactive use.
- Vision token usage is reduced by downscaling the image.

## Scope
In scope:
- Screenshot capture in backend Python.
- Grid overlay lines only.
- Downscale after grid overlay to reduce tokens.
- PNG output with Pillow `optimize=True`.
- In-process return of PIL Image + metadata (no base64).

Out of scope:
- OCR, semantic UI detection, PyAutoGUI execution (future).

## API Design
Endpoint: `GET /screenshot`

Response:
- A PIL Image plus metadata object:
  - `width`, `height`, `grid.minor`, `grid.major`, `scale`

Failure:
- `500` with `{ "error": "Failed to capture screenshot" }`

## Implementation Details

### 1) Capture + Grid Overlay (`backend/utils/imageProcessor/imageProcessor.py`)
- Capture using `mss` for speed and reliability.
- Draw grid lines only:
  - Minor every 10px (light, thin).
  - Major every 100px (slightly darker/thicker).
- No numeric labels.

### 2) Downscale + Keep as PIL
- Downscale after grid overlay (e.g., `scale = 0.75`) to reduce vision tokens.
- Keep as a PIL Image for direct handoff to the LLM service.

### 3) Route Integration (`backend/app.py`)
- Add `/screenshot` route to call processing function.
- Return a PIL Image + metadata to the LLM service internally (no base64).

### 4) Dependencies
- Add `mss` and `pillow` to `backend/requirements.txt` if missing.

## Edge Cases
- Multi-monitor: capture Windows primary display only.
- Permissions: return clear error on failure.

## Tests / Manual Verification
- Call `/screenshot` and verify:
  - JSON fields present.
  - Base64 decodes to PNG.
  - `scale` matches the actual output dimensions.
  - Grid visible at 10px/100px spacing.
  - Width/height match screen.

## Public Interface Changes
- New endpoint: `GET /screenshot`
- In-process return of PIL Image + metadata to the LLM service (no base64).

## Assumptions and Defaults
- Label-free grid.
- Spacing: 10px minor, 100px major.
- Backend Python capture.
- Downscale after grid overlay for token reduction.
- PIL Image returned in-process (no base64).
