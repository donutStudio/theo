"""
Backend-based fallback sounds. All verbal preset WAV playback for the backend
lives here (e.g. outerror.wav on image failure, warning.wav for warnings).
Uses sounddevice + soundfile for playback (supports many WAV formats).
"""
import logging
import sys
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# WAV files live in this package directory (same folder as this module)
_ASSETS_DIR = Path(__file__).resolve().parent


def _play_wav(filename: str) -> None:
    """Play a WAV from this package's directory in a background thread.
    Uses sounddevice + soundfile so many WAV formats are supported."""
    def _play():
        try:
            path = (_ASSETS_DIR / filename).resolve()
            if not path.is_file():
                logger.warning("%s not found at %s", filename, path)
                return
            import sounddevice as sd
            import soundfile as sf
            data, sample_rate = sf.read(path)
            # Normalize to float32 for sounddevice (handles int16/int32 WAVs from any encoder)
            if data.dtype.kind == "i":
                data = data.astype("float32") / (2 ** (data.dtype.itemsize * 8 - 1))
            elif data.dtype != "float32":
                data = data.astype("float32")
            if data.ndim == 1:
                data = data.reshape(-1, 1)
            logger.info("Playing %s from %s", filename, path)
            sd.play(data, sample_rate)
            sd.wait()
        except Exception as e:
            logger.warning("Could not play %s: %s", filename, e)

    threading.Thread(target=_play, daemon=True).start()


def play_image_error_sound() -> None:
    """Play outerror.wav (e.g. when image processing fails)."""
    _play_wav("outerror.wav")


def play_warning_sound() -> None:
    """Play warning.wav for backend warning conditions."""
    _play_wav("warning.wav")
