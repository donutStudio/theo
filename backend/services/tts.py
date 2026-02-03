import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

# Load .env from project root (theo/.env)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise RuntimeError("GROQ_API_KEY not set. Add it to the .env file in the project root.")
client = Groq(api_key=api_key)
speech_file_path = Path(__file__).parent / "startup2.wav"
response = client.audio.speech.create(
  model="canopylabs/orpheus-v1-english",
  voice="troy",
  response_format="wav",
  input="Hey, I'm Theo! Hold down control and windows, and start speaking after the beep. Im so excited to work with you!",
)
response.write_to_file(speech_file_path)
      