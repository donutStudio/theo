#Screenshot capture with label-free grid overlay and downscaling.
#Returns a PIL Image and metadata for in-process LLM usage.

import sys
from ctypes import POINTER, Structure, WINFUNCTYPE, byref, c_long, c_uint, c_void_p, windll
from ctypes.wintypes import RECT

import mss
from PIL import Image, ImageDraw

# these are configs for the graph that is overlayed on every screenshot.

MINOR_SPACING = 10
MAJOR_SPACING = 100
SCALE_FACTOR = 0.75


MINOR_COLOR = (200, 200, 200) 
MAJOR_COLOR = (120, 120, 120) 
MINOR_WIDTH = 1
MAJOR_WIDTH = 2

MONITORINFOF_PRIMARY = 0x1


class MONITORINFO(Structure):
    _fields_ = [
        ("cbSize", c_uint),
        ("rcMonitor", RECT),
        ("rcWork", RECT),
        ("dwFlags", c_uint),
    ]


def _get_primary_monitor_bounds_windows():
    """Use Win32 API to get the Windows primary monitor rect (left, top, width, height)."""
    from ctypes import sizeof

    user32 = windll.user32
    primary_rect = [None]

    def callback(h_monitor, _h_dc, _lprc_clip, _dw_data):
        mi = MONITORINFO()
        mi.cbSize = sizeof(MONITORINFO)
        if user32.GetMonitorInfoW(h_monitor, byref(mi)) and (mi.dwFlags & MONITORINFOF_PRIMARY):
            r = mi.rcMonitor
            primary_rect[0] = (r.left, r.top, r.right - r.left, r.bottom - r.top)
        return 1  # continue enumeration

    MONITORENUMPROC = WINFUNCTYPE(c_long, c_void_p, c_void_p, POINTER(RECT), c_long)
    user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(callback), 0)
    return primary_rect[0]


def _select_primary_monitor(sct):
    """Return the mss monitor dict for the Windows primary display, or monitors[1] on other platforms."""
    if sys.platform != "win32":
        return sct.monitors[1]
    bounds = _get_primary_monitor_bounds_windows()
    if not bounds:
        return sct.monitors[1]
    left, top, width, height = bounds
    for i, mon in enumerate(sct.monitors):
        if i == 0:
            continue
        if mon["left"] == left and mon["top"] == top and mon["width"] == width and mon["height"] == height:
            return mon
    return sct.monitors[1]


def _draw_grid(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    """Draw label-free grid: minor every 10px, major every 100px."""
    # minor lines
    for x in range(0, width + 1, MINOR_SPACING):
        draw.line([(x, 0), (x, height)], fill=MINOR_COLOR, width=MINOR_WIDTH)
    for y in range(0, height + 1, MINOR_SPACING):
        draw.line([(0, y), (width, y)], fill=MINOR_COLOR, width=MINOR_WIDTH)

    # major lines
    for x in range(0, width + 1, MAJOR_SPACING):
        draw.line([(x, 0), (x, height)], fill=MAJOR_COLOR, width=MAJOR_WIDTH)
    for y in range(0, height + 1, MAJOR_SPACING):
        draw.line([(0, y), (width, y)], fill=MAJOR_COLOR, width=MAJOR_WIDTH)


def image_processor():
    with mss.mss() as sct:
        primary = _select_primary_monitor(sct)
        screenshot = sct.grab(primary)

        if screenshot is None:
            raise RuntimeError("Failed to capture screenshot")

        width = screenshot.width
        height = screenshot.height
        img = Image.frombytes("RGBA", (width, height), screenshot.bgra)
        img = img.convert("RGB")

        # overlay grid
        draw = ImageDraw.Draw(img)
        _draw_grid(draw, width, height)

        # compression
        new_width = int(width * SCALE_FACTOR)
        new_height = int(height * SCALE_FACTOR)
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    return {
        "image": img,
        "width": width,
        "height": height,
        "grid": {"minor": MINOR_SPACING, "major": MAJOR_SPACING},
        "scale": SCALE_FACTOR,
    }
