import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Load .env for openai api key (create a .env file in the project root and paste your openai api key there)
load_dotenv(Path(__file__).resolve().parents[3] / ".env")
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY not set. Add it to the .env file in the project root.")

client = OpenAI(api_key=api_key)

response = client.responses.create(
    model="gpt-5.2",
    input="Write a short bedtime story about a unicorn."
)

print(response.output_text)
