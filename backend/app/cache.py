"""Bounded in-memory storage for complete repository snapshots."""

from __future__ import annotations

import time
from collections import OrderedDict
from typing import Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from .repositories import Snapshot


class TTLCache:
    def __init__(self, max_entries: int = 128, ttl_seconds: float = 300, clock: Callable[[], float] = time.monotonic):
        if max_entries < 1 or ttl_seconds <= 0:
            raise ValueError("Cache capacity and lifetime must be positive.")
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._entries: OrderedDict[str, tuple[float, Snapshot]] = OrderedDict()

    def get(self, key: str) -> Snapshot | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires_at, snapshot = entry
        if self.clock() >= expires_at:
            del self._entries[key]
            return None
        return snapshot

    def put(self, key: str, snapshot: Snapshot) -> None:
        self._entries.pop(key, None)
        self._entries[key] = (self.clock() + self.ttl_seconds, snapshot)
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)
