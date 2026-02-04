import io
import logging
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, send_file
from flask_cors import CORS

from utils.imageProcessor import image_processor

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load .env from project root (theo/.env, outside frontend and backend)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = Flask(__name__)
CORS(app)


@app.route("/ping", methods=["GET"])
def ping():
    return "hello from THEO BACKEND"


@app.route("/screenshot", methods=["GET"])
def screenshot():
    """Capture screen with grid overlay; return PIL Image + metadata in-process (no base64)."""
    try:
        result = image_processor()
        # PIL Image is in result["image"] for in-process LLM use; return metadata only as JSON
        metadata = {
            "width": result["width"],
            "height": result["height"],
            "grid": result["grid"],
            "scale": result["scale"],
        }
        return jsonify(metadata)
    except Exception as e:
        logger.exception("Screenshot capture failed")
        return jsonify({"error": "Failed to capture screenshot", "detail": str(e)}), 500


@app.route("/screenshot/preview", methods=["GET"])
def screenshot_preview():
    """Return the screenshot image as PNG for testing (view in browser)."""
    try:
        result = image_processor()
        buf = io.BytesIO()
        result["image"].save(buf, format="PNG", optimize=True)
        buf.seek(0)
        return send_file(buf, mimetype="image/png")
    except Exception as e:
        logger.exception("Screenshot preview failed")
        return jsonify({"error": "Failed to capture screenshot", "detail": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
