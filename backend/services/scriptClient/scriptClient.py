"""
Execute LLM-generated PyAutoGUI scripts in-process with moderate safety checks.
See SCRIPTFILEPLAN.md for design and safety rules.
"""
import ast
import builtins
import logging
from typing import Any

import math
import pyautogui
import random
import time

try:
    import PIL
except ImportError:
    PIL = None

logger = logging.getLogger(__name__)

# Allowlisted imports (script may only use these)
ALLOWED_IMPORTS = frozenset({"pyautogui", "time", "random", "math", "PIL"})

# Blocked builtins (not provided in exec globals)
BLOCKED_BUILTINS = frozenset({"open", "eval", "exec"})


def _safe_import(name: str, globals=None, locals=None, fromlist=(), level=0):
    """Restricted __import__ that only allows allowlisted modules."""
    mod = name.split(".", 1)[0]
    if not _allowed_module(name) and not _allowed_module(mod):
        raise ImportError(f"Import not allowed: {name!r}")
    return builtins.__import__(name, globals, locals, fromlist, level)


def _safe_builtins() -> dict[str, Any]:
    """Builtins dict with dangerous names removed; allow restricted __import__."""
    safe = {k: v for k, v in builtins.__dict__.items() if k not in BLOCKED_BUILTINS}
    safe["__import__"] = _safe_import
    return safe


def _allowed_module(name: str) -> bool:
    """True if module name is on the allowlist (including PIL submodules)."""
    if name in ALLOWED_IMPORTS:
        return True
    if name.startswith("PIL."):
        return True
    return False


def _validate_script(script_text: str) -> None:
    """
    Validate script via AST: only allowlisted imports, no blocked builtins.
    Raises ValueError with a short message if invalid.
    """
    try:
        tree = ast.parse(script_text)
    except SyntaxError as e:
        raise ValueError(f"Invalid Python syntax: {e}") from e

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                # alias.name is the module name for "import x" or "import x as y"
                mod = alias.name.split(".", 1)[0]
                if not _allowed_module(alias.name) and not _allowed_module(mod):
                    raise ValueError(f"Import not allowed: {alias.name!r}")
        elif isinstance(node, ast.ImportFrom):
            if node.module is None:
                continue
            mod = node.module.split(".", 1)[0]
            if not _allowed_module(node.module) and not _allowed_module(mod):
                raise ValueError(f"Import not allowed: {node.module!r}")
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in BLOCKED_BUILTINS:
                    raise ValueError(f"Use of builtin not allowed: {node.func.id!r}")
        elif isinstance(node, ast.Name):
            if node.id in BLOCKED_BUILTINS:
                raise ValueError(f"Use of builtin not allowed: {node.id!r}")


def run_script(script_text: str) -> dict[str, Any]:
    """
    Validate and execute the script text in-process with restricted globals.

    Returns:
        {"ok": True} on success, {"ok": False, "error": "..."} on validation or runtime error.
    """
    script_text = (script_text or "").strip()
    if not script_text:
        return {"ok": False, "error": "Empty script"}

    try:
        _validate_script(script_text)
    except ValueError as e:
        logger.warning("Script validation failed: %s", e)
        return {"ok": False, "error": str(e)}

    # Restricted globals: only allowlisted modules + safe builtins
    restricted_globals: dict[str, Any] = {
        "pyautogui": pyautogui,
        "time": time,
        "random": random,
        "math": math,
        "__builtins__": _safe_builtins(),
    }
    if PIL is not None:
        restricted_globals["PIL"] = PIL

    try:
        exec(compile(script_text, "<script>", "exec"), restricted_globals)
        return {"ok": True}
    except Exception as e:
        logger.exception("Script execution failed")
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
