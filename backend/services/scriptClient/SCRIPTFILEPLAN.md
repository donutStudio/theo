# PyAutoGUI Script File Execution Plan

## Summary
Execute full, standalone PyAutoGUI scripts returned by the LLM by running the
script content directly in-process (no temp files) after moderate safety checks.

## Goals
- Run complete LLM-generated `.py` scripts that use PyAutoGUI.
- Keep execution fast and local for a POC.
- Avoid dangerous system-level operations.

## Design Decisions
- **Execution**: In-process `exec` (no temp file).
- **Safety**: Moderate inspection with allow/deny import lists.
- **Format**: Full script text (as if pasted into a `.py` file).

## Safety Rules (Moderate)
Allow imports:
- `pyautogui`, `time`, `random`, `math`, `PIL`

Block imports:
- `os`, `sys`, `subprocess`, `socket`, `requests`, `urllib`, `pathlib`, `shutil`

Block builtins:
- `open`, `eval`, `exec`

## Execution Flow
1. Receive script text from LLM.
2. Validate using AST:
   - Allowlisted imports only.
   - Reject blocked modules and builtins.
3. Execute with restricted globals:
   - `{"pyautogui": pyautogui, "time": time, "random": random, "math": math, "PIL": PIL}`
4. Return success or error to `aiGO()`.

## Integration Point
- `aiGO()` calls `run_script(script_text)` from the script client module.

## Tests
- Script with `pyautogui.moveTo` and `click` -> OK
- Script with `import os` -> Rejected
- Script with `open(...)` -> Rejected
