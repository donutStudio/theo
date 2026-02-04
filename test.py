# any ai generated pyautogui script should be saved in this file



import pyautogui
import time

# Move to the bottom-right corner where the date and time are usually shown
screen_width, screen_height = pyautogui.size()
pyautogui.moveTo(screen_width - 50, screen_height - 20, duration=0.5)

# Click to open the calendar/date panel
pyautogui.click()
time.sleep(2)
