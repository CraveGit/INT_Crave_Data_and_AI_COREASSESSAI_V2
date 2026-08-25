"""Single logging entry point for the whole API.

On Cloud Foundry the container filesystem is ephemeral and per-instance, so a
FileHandler alone means `cf logs` shows nothing and /logs only ever returns the
worker that happened to answer. Stdout is the platform's real log drain, so it is
always attached; the file is kept as a best-effort tail buffer for /logs.
"""
import os
import sys
import logging

LOG_FILE = os.getenv("LOG_FILE", "Run.log")
LOG_LEVEL = os.getenv("LOG_LEVEL", "WARNING").upper()
FORMAT = "[%(asctime)s] %(levelname)s %(name)s: %(message)s"

_configured = False


# Idempotent: every module calls this at import, only the first call installs handlers.
def configure() -> None:
    global _configured
    if _configured: return
    _configured = True

    root = logging.getLogger()
    root.setLevel(getattr(logging, LOG_LEVEL, logging.WARNING))
    for handler in list(root.handlers):
        root.removeHandler(handler)

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(logging.Formatter(FORMAT))
    root.addHandler(stream)

    # File is optional; a read-only or full disk must never take the app down.
    try:
        file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter(FORMAT))
        root.addHandler(file_handler)
    except OSError as e:
        root.warning(f"E-LOG-file handler unavailable ({e}); stdout only")


def getLogger(name: str) -> logging.Logger:
    configure()
    return logging.getLogger(name)
