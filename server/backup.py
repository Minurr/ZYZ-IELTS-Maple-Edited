"""Consistent online SQLite backup, keeping the latest 14 daily snapshots."""
from pathlib import Path
import sqlite3
from datetime import datetime, timezone

directory = Path("/var/lib/ielts/backups")
directory.mkdir(mode=0o700, exist_ok=True)
target = directory / (datetime.now(timezone.utc).strftime("%Y-%m-%d") + ".sqlite3")
with sqlite3.connect("/var/lib/ielts/accounts.sqlite3") as source:
    with sqlite3.connect(target) as destination:
        source.backup(destination)
target.chmod(0o600)
for stale in sorted(directory.glob("*.sqlite3"))[:-14]:
    stale.unlink()
