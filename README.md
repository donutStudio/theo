# Theo.ai: Partial Blindness Accessibility Agent

[Official Documentation](https://theodocs.super.site)

_Note that Theo currently only has support for Windows operating systems._

**Theo** is a desktop accessibility assistant that lets users perform tasks through
natural language commands. Hold **Ctrl + Win** to speak: Theo transcribes your
request, interprets the screen, generates automation commands, executes them, and
confirms actions via text-to-speech.

## Project Layout

- `frontend/`: Electron UI + STT (push-to-talk) and fallback UX.
- `backend/`: Flask server, LLM classifier, main LLM orchestration, PyAutoGUI automation, TTS, and
  screenshot pipeline.

## Requirements

- Python
- pip
- Node.js and npm (for the Electron frontend)
  \*Assume latest versions for all dependencies
- Your own OpenAI and Groq api keys

## Environment Variables

Create a `.env` file in the repo root:

```
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
```

## Backend Setup

From `backend/`:

```
pip install -r requirements.txt
python app.py
```

## Frontend Setup

From `frontend/`:

```
npm install
npm start
```


## First Launch Experience

When Theo starts for the first time, it now opens a required setup dialog that asks the user to:

1. Paste a `GROQ_API_KEY`
2. Paste an `OPENAI_API_KEY`
3. Choose whether Theo should launch automatically on system startup

These settings can also be changed later from Theo's **Settings** panel.

## Build a Windows `.exe` Installer (Wizard-style NSIS)

From `frontend/`:

```
npm install
npm run dist:win
```

This produces an NSIS `.exe` installer with normal wizard pages (license, install path, progress, finish).

Behavior:
- Running `Theo Setup *.exe` installs Theo and creates a runnable `Theo.exe`.
- Installation includes an uninstaller binary in the install directory (e.g. `Uninstall Theo.exe`) plus an uninstall entry in Windows app management.
- If Theo is already installed, running the installer again prompts to uninstall/reinstall cleanly through the NSIS flow.
- `npm run dist:win` now writes to a timestamped output folder each run and attempts to close any running `Theo.exe` before packaging, avoiding Windows file-lock failures from prior builds.

Output path:

- `frontend/out-builder/<timestamp>/`


### Runtime notes for packaged app

Theo now starts the Flask backend automatically when `Theo.exe` launches (same behavior as running `python backend/app.py` + `npm start` during development).

`npm run dist:win` now bundles a Python runtime + backend dependencies into the installer, so end users only need to run the setup wizard and launch Theo.

## Notes

- The backend runs locally at `http://127.0.0.1:5000`.
- The `/ai` route currently expects `GET` requests with `?user_input=...`.
- Theo is a moderately sandboxed AI agent that controls PyAutoGUI automation clients. Ensure complete device safety when running tasks. Theo is not designed for system level tasks. Theo is designed for UX automation.

## License

© 2025 Theo.ai All rights reserved.  
This project is licensed under the MIT License. See the LICENSE file for details.
