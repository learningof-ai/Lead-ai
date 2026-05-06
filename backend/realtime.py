"""Tiny in-process WebSocket fan-out for real-time leads + call updates."""
from __future__ import annotations

import asyncio
import json
from typing import Set

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self._sockets: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._sockets.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets.discard(ws)

    async def broadcast(self, event: str, data: dict) -> None:
        payload = json.dumps({"event": event, "data": data})
        async with self._lock:
            dead = []
            for ws in list(self._sockets):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._sockets.discard(ws)


hub = Hub()
