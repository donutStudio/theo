# main ai service for theo

import base64
import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
logger = logging.getLogger(__name__)

DELIMITER = "---DELIMITER---"
MODEL = "gpt-5.2"

_client: OpenAI | None = None
_client_api_key: str | None = None


def _get_client() -> OpenAI:
    global _client, _client_api_key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set. Add it in Theo settings.")

    if _client is None or _client_api_key != api_key:
        _client = OpenAI(api_key=api_key)
        _client_api_key = api_key
    return _client


def load_main_system_prompt() -> str:
    """Load the main system prompt from MAINSYSTEMPROMPT.md."""
    prompt_path = Path(__file__).resolve().parent / "MAINSYSTEMPROMPT.md"
    return prompt_path.read_text(encoding="utf-8")


def build_main_input(
    classification: str,
    user_text: str,
    image_bytes: bytes,
    meta: dict,
    memory_messages: list[dict],
) -> list[dict]:
    if classification not in ("---CHAT---", "---AGENT---"):
        raise ValueError(f"Invalid classification: {classification}")

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    image_data_url = f"data:image/png;base64,{image_b64}"

    width = meta.get("width", 0)
    height = meta.get("height", 0)
    grid = meta.get("grid", {})
    origin_left = int(meta.get("origin_left", 0))
    origin_top = int(meta.get("origin_top", 0))
    capture_mode = meta.get("capture_mode", "primary_monitor")
    scale = meta.get("scale", 1.0)

    if grid:
        grid_text = f"grid minor={grid.get('minor', 10)}, major={grid.get('major', 100)}, "
    else:
        grid_text = "grid=none, "

    meta_text = (
        f"Screenshot metadata: width={width}, height={height}, "
        f"{grid_text}origin_left={origin_left}, origin_top={origin_top}, "
        f"capture_mode={capture_mode}, scale={scale}. "
        "Coordinates from the screenshot are local image coordinates. "
        "Convert to real screen coordinates with screen_x=origin_left+x and screen_y=origin_top+y. "
        "For click actions, prefer click_and_verify(x, y, label=...) so runtime can verify UI changed."
    )

    user_content = (
        f"Classification: {classification}\n\n"
        f"User prompt: {user_text}\n\n"
        f"{meta_text}"
    )

    input_items: list[dict] = []

    for msg in memory_messages:
        role = msg.get("role")
        content = msg.get("content", "")
        if role in ("user", "assistant"):
            input_items.append({"role": role, "content": content})

    # Current user turn: text + image (multimodal format)
    input_items.append({
        "role": "user",
        "content": [
            {"type": "input_text", "text": user_content},
            {"type": "input_image", "image_url": image_data_url},
        ],
    })

    return input_items


def run_main_llm(
    instructions: str,
    input_items: list[dict],
) -> str:
    client = _get_client()
    response = client.responses.create(
        model=MODEL,
        instructions=instructions,
        input=input_items,
    )
    raw = getattr(response, "output_text", None) or ""
    if hasattr(response, "output") and response.output and not raw:
        for item in response.output:
            if hasattr(item, "content"):
                for c in item.content:
                    if hasattr(c, "text"):
                        raw += c.text
    return raw


def parse_main_output(raw_text: str, classification: str) -> tuple[str, str]:

   # Parse raw LLM output into (script_text, theo_response_text).
   # For ---AGENT---: expects ---DELIMITER---; top = script, bottom = Theo response.
   # For ---CHAT---: entire output is Theo response; no delimiter required.

    raw = (raw_text or "").strip()
    if not raw:
        raise ValueError("Empty output from model")

    if classification == "---CHAT---":
        return "", raw

    # ---AGENT---: require delimiter
    if DELIMITER not in raw:
        raise ValueError(f"Output missing required delimiter '{DELIMITER}'")

    parts = raw.split(DELIMITER, 1)
    if len(parts) != 2:
        raise ValueError("Output must contain exactly one delimiter")

    script_text = parts[0].strip()
    # Strip markdown code fences if model included them despite instructions
    for fence in ("```python", "```"):
        if script_text.startswith(fence):
            script_text = script_text[len(fence) :].lstrip()
        if script_text.endswith("```"):
            script_text = script_text[:-3].rstrip()
    theo_response_text = parts[1].strip()

    if not theo_response_text:
        raise ValueError("Theo response text (below delimiter) cannot be empty")

    return script_text, theo_response_text
