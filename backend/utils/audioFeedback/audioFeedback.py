"""
Backend-based fallback sounds. All verbal preset WAV playback for the backend
lives here (e.g. outerror.wav on image failure, warning.wav for warnings).
Uses winsound on Windows; no-op on other platforms.
"""
import logging
import sys
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# WAV files live in this package directory (same folder as this module)
_ASSETS_DIR = Path(__file__).resolve().parent


def _play_wav(filename: str) -> None:
    """Play a WAV from this package's directory in a background thread (non-blocking)."""
    def _play():
        try:
            path = _ASSETS_DIR / filename
            if not path.is_file():
                logger.warning("%s not found at %s", filename, path)
                return
            if sys.platform == "win32":
                import winsound
                winsound.PlaySound(str(path), winsound.SND_FILENAME | winsound.SND_ASYNC)
            else:
                logger.debug("Sound playback not implemented for %s", sys.platform)
        except Exception as e:
            logger.debug("Could not play %s: %s", filename, e)

    threading.Thread(target=_play, daemon=True).start()


def play_image_error_sound() -> None:
    """Play outerror.wav (e.g. when image processing fails)."""
    _play_wav("outerror.wav")


def play_warning_sound() -> None:
    """Play warning.wav for backend warning conditions."""
    _play_wav("warning.wav")
