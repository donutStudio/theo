#  user text reponse to generated verbal response file

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from groq import Groq

# Load .env for groq key (create a .env file in the project root and paste your groq api key there)
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

_client: Optional[Groq] = None


def _get_client() -> Groq:
    global _client
    if _client is not None:
        return _client
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY not set. Add it to the .env file in the project root."
        )
    _client = Groq(api_key=api_key)
    return _client


def synthesize_tts(
    text: str,
    out_path: Optional[Path] = None,
    model: str = "canopylabs/orpheus-v1-english",
    voice: str = "troy",
) -> Path:
    """
    Generate a TTS WAV file for the given text and return the file path.
    """
    if not text or not isinstance(text, str):
        raise ValueError("Text must be a non-empty string")

    client = _get_client()
    if out_path is None:
        out_path = Path(__file__).parent / "theo_response.wav"

    response = client.audio.speech.create(
        model=model,
        voice=voice,
        response_format="wav",
        input=text,
    )
    response.write_to_file(out_path)
    return out_path
      
