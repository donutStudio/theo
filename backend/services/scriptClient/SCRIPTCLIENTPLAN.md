# PyAutoGUI Script Client Plan (Allowlist, In-Process)

## Summary
Implement a backend script runner that safely executes LLM-generated PyAutoGUI
Python snippets in-process using a strict allowlist. The runner will be used by
`aiGO()` after parsing the LLM output. It will reject any code that uses
disallowed imports/APIs, then execute only the safe subset (PyAutoGUI +
time.sleep + basic control flow).

## Goals and Success Criteria
- Execute LLM-provided PyAutoGUI scripts reliably.
- Prevent unsafe operations (file I/O, network, subprocess, eval/exec injection).
- Fail fast with clear error messages when a script is unsafe.
- Keep the runner simple and local for POC speed.

## Scope
In scope:
- Script validation (allowlist enforcement).
- Script execution in-process via `exec`.
- Integration point for `aiGO()` to call `run_automation_script(script)`.

Out of scope:
- Click-through IPC, LLM orchestration, or memory (handled later).
- Persistent logging or telemetry.

## Design Decisions (Locked)
- Script format: Raw PyAutoGUI Python text from the LLM.
- Safety model: Allowlist only.
- Execution mode: In-process `exec` with restricted globals/locals.

## Implementation Details

### 1) New Module
Create `backend/services/automation_runner.py` with:
- `validate_script(script: str) -> None | raises`
- `run_automation_script(script: str) -> dict`
  (returns `{"status": "ok"|"error", "detail": "..."}`)

### 2) Allowlist Rules
Allow:
- `pyautogui` function calls (e.g., `click`, `moveTo`, `typewrite`, `hotkey`,
  `press`, `scroll`, `dragTo`).
- `time.sleep`.
- Basic control flow: `if`, `for`, `while`, `range`.
- Numeric literals, strings, tuples/lists/dicts.

Disallow:
- `import` (any).
- File/network access: `open`, `socket`, `requests`, `urllib`, etc.
- Process execution: `os`, `subprocess`, `sys`, `eval`, `exec`.
- Attribute access outside allowed modules.

### 3) Validation Approach (AST)
Use Python `ast` to parse the script:
- Reject `Import` and `ImportFrom`.
- Reject `Call` nodes to anything not in allowed symbols.
- Reject `Attribute` access not under `pyautogui` or `time`.
- Reject `Name` usage for banned builtins.

### 4) Execution Context
Run `exec` with:
- `globals = {"pyautogui": pyautogui, "time": time}`
- `locals = {}`
- No builtins (or a tiny safe set if needed).

### 5) Error Handling
- On validation failure: return `{"status": "error", "detail": "reason"}`.
- On runtime exception: capture and return error (don’t crash Flask).

## Public Interfaces
- `run_automation_script(script: str) -> dict`
- Later: `aiGO()` will call this after parsing LLM output.

## Tests / Verification
- Manual tests:
  1. Script: `pyautogui.moveTo(100, 100); pyautogui.click()` -> ok
  2. Script: `import os` -> rejected
  3. Script: `open("x.txt","w")` -> rejected
  4. Script: `time.sleep(0.5)` -> ok
- Unit tests (optional, but small):
  - AST validator accepts known good snippet, rejects banned calls.

## Assumptions and Defaults
- PyAutoGUI is installed and works locally.
- LLM outputs are split by `---DELIMITER---` before reaching this runner.
- This runner is used only in local, trusted environment (but still validated).
