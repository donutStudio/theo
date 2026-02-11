##simple test file
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.scriptClient.scriptClient import run_script

script = """
# Open the system clock to reveal the day of the week
import pyautogui
import time

# Move to the bottom-right corner where the clock is and click
pyautogui.moveTo(1860, 1050, duration=0.5)
pyautogui.click()

time.sleep(1)

"""

print(run_script(script))
