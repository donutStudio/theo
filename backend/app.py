from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

# Load .env from project root (theo/.env, outside frontend and backend)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = Flask(__name__)
CORS(app)

@app.route("/ping", methods=["GET"])
def ping():
    return "hello from THEO BACKEND"

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
