# AI Service Pipeline Plan (Classifier -> Main LLM -> Execute + TTS)

## Summary
Implement an AI service that first classifies user intent using a cheap Groq model
(llama-3.1-8b-instant), then routes chat/agent requests to the main GPT-5.2 model
with the screenshot and system prompt. Unsafe requests go to a fallback path.
The main model returns a PyAutoGUI script and a Theo response separated by
`---DELIMITER---`, which are executed and spoken back to the user.

## Environment and Config
- Add `OPENAI_KEY` to `.env` (repo root).
- Ensure `GROQ_API_KEY` is present for the classifier.
- Centralize config loading to avoid repeated `dotenv` calls.

## Core Interfaces
- `classify_intent(text) -> {"label": "chat|agent|unsafe", "reason": "..."}`
- `build_main_prompt(system_prompt_path, user_text, image, metadata) -> messages`
- `run_main_llm(messages, model="gpt-5.2") -> raw_output`
- `parse_llm_output(raw_output) -> { "script": "...", "response": "..." }`
- `execute_pyautogui(script) -> status`
- `speak_text(response) -> status`

## Classifier Integration (Groq)
- Use `backend/utils/llmclassifer/llmclassifer.py`.
- Route:
  - `chat` -> main LLM (no automation).
  - `agent` -> main LLM (automation + TTS).
  - `unsafe` -> fallback response + TTS.
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
- `agent`:
  - Execute script.
  - Speak Theo response.
- `chat`:
  - Skip script.
  - Speak Theo response.
- `unsafe`:
  - Fallback response + TTS only.

## Flask Endpoint
- Add `/agent` route that accepts:
  - User text (STT).
  - Screenshot image or in-process screenshot pipeline.
- Returns:
  - Status and error info.
  - Theo response.

## Safety Controls
- LLM call timeouts.
- Output token caps.
- Script sandboxing and allowlist of PyAutoGUI calls.
- Logging of classifier label and LLM output.

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
