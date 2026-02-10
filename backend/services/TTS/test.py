import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.TTS.ttsClient import speak_text


speak_text("Alright, let me get that for you!")
