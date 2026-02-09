# AI Service Pipeline Plan (Classifier -> Main LLM -> Execute + TTS)

## Summary
Implement an AI service where the `/ai` route only classifies user intent using a
cheap Groq model (llama-3.1-8b-instant) and either triggers fallback or hands off
to `aiGO()`. The `aiGO()` function orchestrates the full loop: notify Electron to
enable click-through and disable input, capture a screenshot, call the main GPT-5.2
model with system prompt + user text + image metadata, parse the result into a
PyAutoGUI script and a Theo response (split by `---DELIMITER---`), execute the
script, speak the response, then notify Electron to restore input and disable
click-through.

## Environment and Config
- Add `OPENAI_KEY` to `.env` (repo root).
- Ensure `GROQ_API_KEY` is present for the classifier.
- Centralize config loading to avoid repeated `dotenv` calls.

## Core Interfaces
- `classify_intent(text) -> {"label": "chat|agent|unsafe", "reason": "..."}`
- `aiGO(user_text, classification) -> status`
- `build_main_prompt(system_prompt_path, user_text, image, metadata) -> messages`
- `run_main_llm(messages, model="gpt-5.2") -> raw_output`
- `parse_llm_output(raw_output) -> { "script": "...", "response": "..." }`
- `execute_pyautogui(script) -> status`
- `speak_text(response) -> status`
- `notify_electron_clickthrough(enabled: bool) -> status`

## Classifier Integration (Groq)
- Use `backend/utils/llmclassifer/llmclassifer.py`.
- `/ai` route logic:
  - If classifier returns `unsafe` -> fallback response + TTS, then stop.
  - Otherwise -> call `aiGO(user_text, classification)`.
- On classifier failure, default to `unsafe`.

## Main LLM Call (OpenAI GPT-5.2)
- Load system prompt from `backend/MAINSYSTEMPROMPT.MD`.
- Include:
  - User STT text.
  - Screenshot image (PIL Image or bytes).
  - Metadata: width, height, grid spacing, scale factor.
- Enforce output format with delimiter `---DELIMITER---`.

## Output Parsing
- Split on `---DELIMITER---` into:
  - Script section (PyAutoGUI).
  - Theo response (natural language).
- Validate script:
  - Allow only PyAutoGUI and safe control flow.
  - Disallow imports, file I/O, network, subprocesses.

## Execution + TTS
- `aiGO()` handles the full flow:
  - Notify Electron to enable click-through and disable input.
  - Capture screenshot.
  - Call main LLM with prompt + image + metadata.
  - Parse output into script + response.
  - If classification is `agent`, execute script.
  - Speak Theo response.
  - Notify Electron to disable click-through and re-enable input.

## Flask Endpoint
- `/ai` route:
  - Accepts user STT text.
  - Runs classifier and routes to fallback or `aiGO()`.
  - Returns status and Theo response.

## Safety Controls
- LLM call timeouts.
- Output token caps.
- Script sandboxing and allowlist of PyAutoGUI calls.
- Logging of classifier label and LLM output.
- Ensure Electron click-through toggles are always reverted (use try/finally).

## Tests
- Unit tests:
  - Classifier routing logic.
  - Delimiter parsing.
  - Unsafe fallback path.
- Manual tests:
  - Chat request (e.g., "hello").
  - Agent request (e.g., "open teams").
  - Unsafe request (e.g., "hide a body").
  - Verify script execution + TTS.
