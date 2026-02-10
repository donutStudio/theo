import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.TTS.ttsClient import speak_text


speak_text("I’m opening the system clock in the bottom-right corner of your screen so the date information appears. If you’d like, I can read out the day of the week for you as well.")
