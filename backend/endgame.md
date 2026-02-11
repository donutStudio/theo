# Final Phase Plan: Single-Session Memory + Main GPT-5.2 Loop + aiGO/aiDone Integration

## Summary
Yes, this is the home stretch. The remaining work is integration-heavy rather than greenfield: wire classifier -> aiGO backend orchestration -> GPT-5.2 main prompt + screenshot -> parse script/response -> execute script + speak response, while frontend aiGO/aiDone controls click-through and input lock correctly.

This plan is decision-complete with these locked choices:
- Session model: single global in-memory session.
- Memory window: last 6 turns.
- `/ai` transport: keep `GET` query for now.

## Current State (Grounded)
- `frontend/src/utils/workflow.js` has `aiGO`/`aiDone` and input lock wiring.
- `frontend/src/main.js` supports input lock and click-through IPC.
- `backend/app.py` has `/ai` with classifier + unsafe fallback only.
- `backend/services/aiService/aiService.py` currently does a one-off test call, not a reusable service.
- `backend/services/scriptClient/scriptClient.py` exists and runs validated script strings.
- TTS client exists and can synthesize/play response audio.

## Implementation Plan

## 1) Convert `aiService.py` into a reusable service layer
Create callable functions in `backend/services/aiService/aiService.py`:

- `load_main_system_prompt() -> str`
- `build_main_input(classification: str, user_text: str, image_bytes: bytes, meta: dict, memory_messages: list[dict]) -> list[dict] | input payload`
- `run_main_llm(...) -> str`  
  Returns raw text in required format with `---DELIMITER---`.
- `parse_main_output(raw_text: str) -> tuple[str, str]`  
  Returns `(script_text, theo_response_text)` and raises if delimiter missing.

Key rules:
- Use `OPENAI_API_KEY` consistently (fix current mismatch if needed).
- Use `model="gpt-5.2"`.
- Include classification marker exactly (`---CHAT---` or `---AGENT---`) in the prompt payload.
- Pass screenshot plus metadata (`width`, `height`, `grid`, `scale`) each turn.

## 2) Add single-session memory manager (in backend)
Add module-level memory store (non-persistent):
- `SESSION_MEMORY: list[dict]` for one local user.
- Keep only last 6 turns (user+assistant entries).
- Memory format:
  - `{"role": "user", "content": "..."}`
  - `{"role": "assistant", "content": "..."}`
- Update sequence:
  1. Append current user text before main GPT call.
  2. Append Theo response after successful parse.
  3. Trim to last 6 turns.

Memory policy:
- Unsafe requests do not pollute assistant task memory (optional user entry may remain; default: do not append unsafe turn).
- If parser/LLM fails, do not append assistant response.

## 3) Implement backend `aiGO()` orchestration in `backend/app.py`
Add internal function in `backend/app.py`:

- `def aiGO(user_input: str, classification: str):`
  1. Capture screenshot via `image_processor()` (image + metadata).
  2. Convert PIL image to bytes for GPT input.
  3. Call ai service with memory + prompt.
  4. Parse into `script_text`, `theo_response_text`.
  5. If `classification == "---AGENT---"` run `run_script(script_text)`.
  6. Speak Theo response via TTS client.
  7. Return structured result dict for route response.

Error handling:
- Any failure returns safe error JSON and logs exception.
- For agent mode script failure, still speak a fallback Theo message describing failure.
- Maintain blocking behavior for warning fallback path.

## 4) Finalize `/ai` route behavior
In `backend/app.py`:
- Keep `GET /ai?user_input=...`.
- Validate `user_input` present and non-empty.
- Run classifier:
  - `---UNSAFE---`: play warning sound blocking and return 400.
  - `---CHAT---` or `---AGENT---`: call backend `aiGO()`.
- Return concise JSON:
  - `{"ok": true, "classification": "..."}`
  - Include failure detail when `ok: false`.

## 5) Frontend aiGO/aiDone: include click-through + input toggles
In `frontend/src/utils/workflow.js`, ensure this sequence:

- `aiGO(text)`:
  1. `setInputLock(true)`
  2. `set-click-through(true)` via IPC
  3. call backend `/ai`
  4. `finally -> aiDone()`

- `aiDone()`:
  1. `set-click-through(false)`
  2. `setInputLock(false)`

Behavioral requirement:
- Input and click-through must always unwind in `finally`, even on fetch errors/timeouts.
- Existing startup/fallback WAV lock behavior remains as-is.

## 6) Prompt and output contract hardening
Prompt contract additions in `MAINSYSTEMPROMPT.md` usage:
- Require exactly one delimiter `---DELIMITER---`.
- Top half: executable full Python script.
- Bottom half: Theo response text only.
- Explicitly state: no markdown fences in script section.

Parser contract:
- Reject malformed output early.
- Emit structured parse error for fallback TTS.

## Important API/Interface Changes
- Backend internal API additions:
  - `aiGO(user_input, classification)` in `backend/app.py`.
  - reusable functions in `backend/services/aiService/aiService.py`.
- Frontend workflow behavior:
  - `aiGO` and `aiDone` also manage click-through, not only input lock.
- `/ai` stays `GET` in this phase (no contract change for caller).

## Test Cases and Scenarios

## 1) Classifier routing
- Input: unsafe text -> warning WAV plays, HTTP 400, no script run.
- Input: chat text -> no script execution, Theo TTS response plays.
- Input: agent text -> script executes then Theo TTS plays.

## 2) Memory behavior
- Send 7+ sequential chat turns.
- Verify only last 6 turns are included in GPT call context.
- Verify unsafe turn does not append assistant memory.

## 3) aiGO/aiDone lock behavior
- During `/ai` request: input locked and click-through enabled.
- On success/failure: click-through disabled and input unlocked.
- No stuck lock on exceptions (verify finally path).

## 4) Output parsing robustness
- Valid delimiter output parses and executes.
- Missing delimiter triggers safe error handling and fallback speech.
- Script failure returns controlled error without crashing Flask.

## 5) End-to-end smoke
- Hold Ctrl+Win, speak request, see `/ai` call, classification, AI response, script action, spoken response, lock release.

## Assumptions and Defaults
- Single-user local runtime; one global in-memory session is acceptable.
- `/ai` remains GET for this phase.
- Model remains `gpt-5.2`.
- Script format remains full Python text and is executed through existing `run_script`.
- Cooldown/input-lock foundation already implemented and retained.
