import io
import logging
import threading
from datetime import datetime
import os
from pathlib import Path
import re

from dotenv import load_dotenv
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS

from services.aiService.aiService import (
    build_main_input,
    load_main_system_prompt,
    parse_main_output,
    run_main_llm,
)
from services.scriptClient.scriptClient import run_script, set_screen_origin
from services.TTS.ttsClient import speak_text, stop_playback, is_playback_active
from utils.audioFeedback.audioFeedback import play_image_error_sound
from utils.audioFeedback.audioFeedback import play_warning_sound
from utils.imageProcessor.imageProcessor import image_processor
from utils.llmclassifer.llmClassifier import llmclassifier

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load .env for keys
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = Flask(__name__)
CORS(app)

# single-session memory: last 6 turns. resets every run.
SESSION_MEMORY: list[dict] = []
MAX_MEMORY_TURNS = 12  # 6 turns = 6 user + 6 assistant messages combined together


def _is_datetime_query(user_input: str) -> bool:
    text = (user_input or "").strip().lower()
    patterns = (
        "what time",
        "current time",
        "time is it",
        "what date",
        "current date",
        "what day",
        "day is it",
        "day of the week",
        "today's date",
        "todays date",
    )
    return any(p in text for p in patterns)


def _build_datetime_response() -> str:
    now = datetime.now()
    return (
        f"Today is {now.strftime('%A')}, {now.strftime('%B %d, %Y')}. "
        f"The current time is {now.strftime('%I:%M %p').lstrip('0')}."
    )


def _normalize_classification(raw: str) -> str:
    """Extract classification from classifier output; tolerates extra text/whitespace."""
    s = (raw or "").strip().upper()
    for label in ("---UNSAFE---", "---AGENT---", "---CHAT---"):
        if label in s:
            return label
    return raw.strip() if raw else "---CHAT---"


def _trim_memory() -> None:
    """Keep only the last MAX_MEMORY_TURNS messages."""
    global SESSION_MEMORY
    if len(SESSION_MEMORY) > MAX_MEMORY_TURNS:
        SESSION_MEMORY[:] = SESSION_MEMORY[-MAX_MEMORY_TURNS:]


def _build_deterministic_agent_action(user_input: str, meta: dict) -> tuple[str, str] | None:
    """
    Deterministic handler for common shortcut-friendly actions.
    Returns (script_text, theo_response_text) or None if no rule matched.
    """
    text = (user_input or "").strip().lower()
    width = int(meta.get("width", 1920) or 1920)
    height = int(meta.get("height", 1080) or 1080)
    center_x = max(0, width // 2)
    center_y = max(0, height // 2)

    close_tab_phrases = (
        "close tab",
        "close this tab",
        "close current tab",
    )
    reopen_tab_phrases = (
        "reopen tab",
        "reopen last tab",
        "reopen closed tab",
        "open last closed tab",
        "restore tab",
    )
    new_tab_phrases = (
        "new tab",
        "open tab",
        "open a new tab",
    )

    if any(p in text for p in close_tab_phrases):
        x1 = max(0, width - 40)
        x2 = max(0, width - 90)
        x3 = max(0, width - 140)
        script = (
            "result = hotkey_and_verify(\n"
            "    keys=(\"ctrl\", \"w\"),\n"
            "    label=\"close current tab\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=1.2,\n"
            f"    fallback=lambda: click_candidates([({x1}, 18), ({x2}, 18), ({x3}, 18)], label=\"tab close button\")\n"
            ")\n"
        )
        return script, "I can close the current tab with a shortcut and verify it worked."

    if any(p in text for p in reopen_tab_phrases):
        script = (
            "result = hotkey_and_verify(\n"
            "    keys=(\"ctrl\", \"shift\", \"t\"),\n"
            "    label=\"reopen closed tab\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=1.2\n"
            ")\n"
        )
        return script, "I can reopen your last closed tab using a shortcut and verify the change."

    if any(p in text for p in new_tab_phrases) and "close" not in text:
        script = (
            "result = hotkey_and_verify(\n"
            "    keys=(\"ctrl\", \"t\"),\n"
            "    label=\"open new tab\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=1.2\n"
            ")\n"
        )
        return script, "I can open a new tab with a shortcut and verify it opened."

    if re.search(r"\b(go back|back page|previous page|navigate back)\b", text):
        script = (
            "result = hotkey_and_verify(\n"
            "    keys=(\"alt\", \"left\"),\n"
            "    label=\"navigate back\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=1.2\n"
            ")\n"
        )
        return script, "I can move back using a navigation shortcut and verify it worked."

    if re.search(r"\b(go forward|forward page|next page|navigate forward)\b", text):
        script = (
            "result = hotkey_and_verify(\n"
            "    keys=(\"alt\", \"right\"),\n"
            "    label=\"navigate forward\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=1.2\n"
            ")\n"
        )
        return script, "I can move forward using a navigation shortcut and verify it worked."

    if re.search(r"\b(bold|make.*bold)\b", text):
        script = (
            "result = ensure_focus_and_hotkey(\n"
            f"    x={center_x},\n"
            f"    y={center_y},\n"
            "    keys=(\"ctrl\", \"b\"),\n"
            "    label=\"apply bold\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=0.8\n"
            ")\n"
        )
        return script, "I can apply bold formatting with a verified shortcut."

    if re.search(r"\b(italic|make.*italic)\b", text):
        script = (
            "result = ensure_focus_and_hotkey(\n"
            f"    x={center_x},\n"
            f"    y={center_y},\n"
            "    keys=(\"ctrl\", \"i\"),\n"
            "    label=\"apply italic\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=0.8\n"
            ")\n"
        )
        return script, "I can apply italic formatting with a verified shortcut."

    if re.search(r"\b(underline|make.*underline)\b", text):
        script = (
            "result = ensure_focus_and_hotkey(\n"
            f"    x={center_x},\n"
            f"    y={center_y},\n"
            "    keys=(\"ctrl\", \"u\"),\n"
            "    label=\"apply underline\",\n"
            "    retries=1,\n"
            "    post_delay=0.35,\n"
            "    min_change=0.8\n"
            ")\n"
        )
        return script, "I can apply underline formatting with a verified shortcut."

    return None


def _run_agent_replan(user_input: str, script_error: str) -> tuple[str, str]:
    """
    One automatic replan pass with a fresh screenshot after script failure.
    """
    fresh = image_processor(with_grid=False, capture_all_monitors=True)
    fresh_buf = io.BytesIO()
    fresh["image"].save(fresh_buf, format="PNG", optimize=True)
    fresh_bytes = fresh_buf.getvalue()

    fresh_meta = {
        "width": fresh["width"],
        "height": fresh["height"],
        "grid": fresh["grid"],
        "origin_left": fresh.get("origin_left", 0),
        "origin_top": fresh.get("origin_top", 0),
        "capture_mode": fresh.get("capture_mode", "primary_monitor"),
        "scale": fresh["scale"],
    }
    set_screen_origin(fresh_meta["origin_left"], fresh_meta["origin_top"])

    replan_text = (
        f"{user_input}\n\n"
        "Previous automation attempt failed.\n"
        f"Runtime error: {script_error}\n"
        "Use the new screenshot state and generate a corrected script. "
        "Do not repeat the exact failing approach; prefer verified shortcuts and verified click fallbacks."
    )
    instructions = load_main_system_prompt()
    input_items = build_main_input(
        classification="---AGENT---",
        user_text=replan_text,
        image_bytes=fresh_bytes,
        meta=fresh_meta,
        memory_messages=SESSION_MEMORY,
    )
    replan_raw = run_main_llm(instructions=instructions, input_items=input_items)
    return parse_main_output(replan_raw, "---AGENT---")


def aiGO(user_input: str, classification: str) -> dict:
    """
    Orchestrate the full AI workflow: screenshot -> LLM -> parse -> script (if AGENT) -> TTS.
    Returns structured result dict for route response.
    """
    if classification not in ("---CHAT---", "---AGENT---"):
        return {"ok": False, "error": f"Invalid classification: {classification}"}

    # screenshot
    try:
        result = image_processor(with_grid=False, capture_all_monitors=True)
    except Exception as e:
        logger.exception("Screenshot capture failed")
        play_image_error_sound()
        return {"ok": False, "error": "Screenshot failed", "detail": str(e)}

    # convert PIL image to bytes
    img = result["image"]
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    image_bytes = buf.getvalue()

    meta = {
        "width": result["width"],
        "height": result["height"],
        "grid": result["grid"],
        "origin_left": result.get("origin_left", 0),
        "origin_top": result.get("origin_top", 0),
        "capture_mode": result.get("capture_mode", "primary_monitor"),
        "scale": result["scale"],
    }
    set_screen_origin(meta["origin_left"], meta["origin_top"])


    SESSION_MEMORY.append({"role": "user", "content": user_input})
    _trim_memory()

    try:
        # Determine script path (deterministic first for common intents, then LLM).
        script_text = ""
        theo_response_text = ""
        used_deterministic = False
        deterministic = None
        if classification == "---AGENT---":
            deterministic = _build_deterministic_agent_action(user_input, meta)
        if deterministic:
            script_text, theo_response_text = deterministic
            used_deterministic = True
            logger.info("Using deterministic agent handler for prompt: %s", user_input)
        else:
            instructions = load_main_system_prompt()
            input_items = build_main_input(
                classification=classification,
                user_text=user_input,
                image_bytes=image_bytes,
                meta=meta,
                memory_messages=SESSION_MEMORY[:-1],
            )
            raw_text = run_main_llm(instructions=instructions, input_items=input_items)
            script_text, theo_response_text = parse_main_output(raw_text, classification)

        # 7. If AGENT, run script
        script_result = None
        if classification == "---AGENT---" and script_text.strip():
            script_result = run_script(script_text)
            if not script_result.get("ok"):
                first_error = script_result.get("error", "unknown")
                logger.warning("Initial agent script failed (deterministic=%s): %s", used_deterministic, first_error)
                try:
                    repaired_script, repaired_response = _run_agent_replan(user_input, first_error)
                    repaired_result = run_script(repaired_script)
                    if repaired_result.get("ok"):
                        script_text = repaired_script
                        theo_response_text = repaired_response
                        script_result = repaired_result
                        logger.info("Automatic replan succeeded after initial failure.")
                    else:
                        second_error = repaired_result.get("error", "unknown")
                        fallback_msg = f"Script failed after automatic retry: {second_error}"
                        speak_text(fallback_msg, async_play=True)
                        return {
                            "ok": True,
                            "classification": classification,
                            "script_ok": False,
                            "script_error": second_error,
                            "theo_response": theo_response_text,
                        }
                except Exception as retry_error:
                    fallback_msg = f"Script failed and retry planning also failed: {retry_error}"
                    speak_text(fallback_msg, async_play=True)
                    return {
                        "ok": True,
                        "classification": classification,
                        "script_ok": False,
                        "script_error": str(retry_error),
                        "theo_response": theo_response_text,
                    }
        elif classification == "---AGENT---" and not script_text.strip():
            logger.warning("AGENT classification but empty script from model")

        # add assistant response to memory after final response is determined
        SESSION_MEMORY.append({"role": "assistant", "content": theo_response_text})
        _trim_memory()

        # 8. Speak Theo response in background so we return immediately after script.
        # Frontend gets response, disables click-through right away; TTS plays in background.
        def _speak_in_background():
            speak_text(theo_response_text, async_play=False)

        threading.Thread(target=_speak_in_background, daemon=True).start()

        return {
            "ok": True,
            "classification": classification,
            "script_ok": script_result.get("ok", True) if script_result else None,
            "theo_response": theo_response_text,
        }

    except ValueError as e:
        # Parse error
        logger.warning("Parse error: %s", e)
        SESSION_MEMORY.pop()  # remove the user entry we just added
        fallback_msg = f"I had trouble understanding the response. Please try again. {e}"
        speak_text(fallback_msg, async_play=True)
        return {"ok": False, "error": "Parse failed", "detail": str(e)}

    except Exception as e:
        logger.exception("aiGO failed")
        SESSION_MEMORY.pop()  # remove the user entry we just added
        fallback_msg = "Something went wrong. Please try again."
        speak_text(fallback_msg, async_play=True)
        return {"ok": False, "error": "AI workflow failed", "detail": str(e)}


@app.route("/ping", methods=["GET"])
def ping():
    return "hello from THEO BACKEND"


@app.route("/screenshot", methods=["GET"])
def screenshot():
    """Capture screen with grid overlay; return PIL Image + metadata in-process (no base64)."""
    try:
        result = image_processor(with_grid=True, capture_all_monitors=True)
        metadata = {
            "width": result["width"],
            "height": result["height"],
            "grid": result["grid"],
            "origin_left": result.get("origin_left", 0),
            "origin_top": result.get("origin_top", 0),
            "capture_mode": result.get("capture_mode", "primary_monitor"),
            "scale": result["scale"],
        }
        return jsonify(metadata)
    except Exception as e:
        logger.exception("Screenshot capture failed")
        play_image_error_sound()
        return jsonify({"error": "Failed to capture screenshot", "detail": str(e)}), 500


@app.route("/screenshot/preview", methods=["GET"])
def screenshot_preview():
    """Return the screenshot image as PNG for testing (view in browser)."""
    try:
        result = image_processor(with_grid=True, capture_all_monitors=True)
        buf = io.BytesIO()
        result["image"].save(buf, format="PNG", optimize=True)
        buf.seek(0)
        return send_file(buf, mimetype="image/png")
    except Exception as e:
        logger.exception("Screenshot preview failed")
        play_image_error_sound()
        return jsonify({"error": "Failed to capture screenshot", "detail": str(e)}), 500


@app.route("/ai/classify", methods=["GET"])
def ai_classify():
    """Lightweight classification only; used by frontend to decide click-through."""
    user_input = request.args.get("user_input")
    if not user_input or not str(user_input).strip():
        return jsonify({"ok": False, "error": "user_input required"}), 400
    user_input = str(user_input).strip()
    raw_classification = llmclassifier(user_input)
    classification = _normalize_classification(raw_classification)
    return jsonify({"ok": True, "classification": classification}), 200


@app.route("/ai", methods=["GET"])
def ai():
    user_input = request.args.get("user_input")
    if not user_input or not str(user_input).strip():
        return jsonify({"ok": False, "error": "user_input is required and must be non-empty"}), 400

    user_input = str(user_input).strip()

    # Fast path for day/date/time requests (no classifier/main model round-trip).
    if _is_datetime_query(user_input):
        theo_response = _build_datetime_response()
        speak_text(theo_response, async_play=False)
        return jsonify({
            "ok": True,
            "classification": "---CHAT---",
            "script_ok": None,
            "theo_response": theo_response,
        }), 200

    classification_param = request.args.get("classification")
    if classification_param and classification_param.strip() in ("---CHAT---", "---AGENT---", "---UNSAFE---"):
        classification = classification_param.strip()
    else:
        raw_classification = llmclassifier(user_input)
        classification = _normalize_classification(raw_classification)

    if classification == "---UNSAFE---":
        play_warning_sound(blocking=True)
        return jsonify({"ok": False, "classification": classification}), 400

    if classification in ("---CHAT---", "---AGENT---"):
        result = aiGO(user_input, classification)
        if result.get("ok"):
            return jsonify({
                "ok": True,
                "classification": result.get("classification", classification),
                "script_ok": result.get("script_ok"),
                "theo_response": result.get("theo_response"),
            }), 200
        else:
            return jsonify({
                "ok": False,
                "classification": classification,
                "error": result.get("error"),
                "detail": result.get("detail"),
            }), 500

    # Fallback: unknown classification
    return jsonify({"ok": False, "error": "Unknown classification", "classification": classification}), 400


@app.route("/stop-tts", methods=["POST"])
def stop_tts():
    """Stop current TTS playback (called when user interrupts with Ctrl+Win)."""
    stop_playback()
    return jsonify({"ok": True}), 200


@app.route("/tts/status", methods=["GET"])
def tts_status():
    """Return whether TTS audio is actively playing right now."""
    return jsonify({"ok": True, "playing": is_playback_active()}), 200


@app.route("/shutdown", methods=["POST"])
def shutdown():
    """Shutdown the Flask server (called by Electron on quit)."""
    logger.info("Shutdown requested by Electron")
    os._exit(0)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
