

import ast
import builtins
import logging
from typing import Any

import math
import pyautogui
import random
import time

try:
    import PIL
    from PIL import ImageChops, ImageStat
except ImportError:
    PIL = None
    ImageChops = None
    ImageStat = None

logger = logging.getLogger(__name__)
_SCREEN_ORIGIN_X = 0
_SCREEN_ORIGIN_Y = 0


def set_screen_origin(x: int, y: int) -> None:
    """Set the top-left origin of the screenshot within the virtual desktop."""
    global _SCREEN_ORIGIN_X, _SCREEN_ORIGIN_Y
    _SCREEN_ORIGIN_X = int(x)
    _SCREEN_ORIGIN_Y = int(y)


def _to_screen_xy(x: float, y: float) -> tuple[int, int]:
    sx = int(round(float(x))) + _SCREEN_ORIGIN_X
    sy = int(round(float(y))) + _SCREEN_ORIGIN_Y
    return sx, sy


def _snapshot_gray():
    """Capture a grayscale screenshot for lightweight visual-diff verification."""
    return pyautogui.screenshot().convert("L")


def _mean_abs_diff(before, after) -> float:
    diff = ImageChops.difference(before, after)
    return float(ImageStat.Stat(diff).mean[0])


def click_and_verify(
    x: float,
    y: float,
    label: str = "target",
    retries: int = 2,
    post_delay: float = 0.8,
    min_change: float = 1.5,
    move_duration: float = 0.15,
) -> dict[str, Any]:
    """
    Click screenshot-local coordinates and verify that the screen changed.
    Raises RuntimeError after retries if no visible UI change is detected.
    """
    if PIL is None:
        sx, sy = _to_screen_xy(x, y)
        pyautogui.moveTo(sx, sy, duration=move_duration)
        pyautogui.click(sx, sy)
        time.sleep(post_delay)
        return {"ok": True, "x": sx, "y": sy, "verified": False}

    last_diff = 0.0
    for attempt in range(int(retries) + 1):
        before = _snapshot_gray()
        sx, sy = _to_screen_xy(x, y)
        pyautogui.moveTo(sx, sy, duration=move_duration)
        pyautogui.click(sx, sy)
        time.sleep(post_delay)
        after = _snapshot_gray()
        change = _mean_abs_diff(before, after)
        last_diff = change
        if change >= float(min_change):
            return {
                "ok": True,
                "x": sx,
                "y": sy,
                "verified": True,
                "attempt": attempt + 1,
                "change": change,
                "label": label,
            }
        logger.warning(
            "click_and_verify: no visible change for '%s' at (%s, %s), attempt %s/%s (change=%.3f)",
            label,
            sx,
            sy,
            attempt + 1,
            int(retries) + 1,
            change,
        )

    raise RuntimeError(
        f"click_and_verify failed for '{label}' after {int(retries) + 1} attempts "
        f"(last_change={last_diff:.3f}, required={float(min_change):.3f})"
    )


def click_candidates(
    points: list[tuple[float, float]],
    label: str = "target",
    retries_per_point: int = 1,
    post_delay: float = 0.8,
    min_change: float = 1.5,
) -> dict[str, Any]:
    """
    Try multiple candidate screenshot-local points until one click verifies.
    """
    if not points:
        raise ValueError("click_candidates requires at least one point")

    errors: list[str] = []
    for idx, point in enumerate(points, start=1):
        x, y = point
        try:
            result = click_and_verify(
                x=x,
                y=y,
                label=f"{label} candidate {idx}",
                retries=retries_per_point,
                post_delay=post_delay,
                min_change=min_change,
            )
            result["candidate_index"] = idx
            return result
        except Exception as e:
            errors.append(str(e))

    raise RuntimeError(f"click_candidates failed for '{label}': {' | '.join(errors)}")


def _validate_script(script_text: str) -> None:
    """Validate Python syntax only. No import restrictions (dev mode)."""
    try:
        ast.parse(script_text)
    except SyntaxError as e:
        raise ValueError(f"Invalid Python syntax: {e}") from e


def run_script(script_text: str) -> dict[str, Any]:
    """
    Validate and execute the script text in-process.
    All imports allowed (dev mode); use standard __builtins__.

    Returns:
        {"ok": True} on success, {"ok": False, "error": "..."} on validation or runtime error.
    """
    script_text = (script_text or "").strip()
    if not script_text:
        return {"ok": False, "error": "Empty script"}

    try:
        _validate_script(script_text)
    except ValueError as e:
        logger.warning("Script validation failed: %s", e)
        return {"ok": False, "error": str(e)}


    script_globals: dict[str, Any] = {
        "pyautogui": pyautogui,
        "time": time,
        "random": random,
        "math": math,
        "SCREEN_ORIGIN_X": _SCREEN_ORIGIN_X,
        "SCREEN_ORIGIN_Y": _SCREEN_ORIGIN_Y,
        "to_screen_xy": _to_screen_xy,
        "click_and_verify": click_and_verify,
        "click_candidates": click_candidates,
        "__builtins__": builtins.__dict__,
    }
    if PIL is not None:
        script_globals["PIL"] = PIL

    try:
        exec(compile(script_text, "<script>", "exec"), script_globals)
        return {"ok": True}
    except Exception as e:
        logger.exception("Script execution failed")
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
