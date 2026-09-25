"""Crawler engine for scanning and cataloging SIGAA UFS rooms."""

import csv
import json
import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from salavazia.client import SigaaClient
from salavazia.models import Room
from salavazia.parser import parse_room_page

logger = logging.getLogger(__name__)


class RoomCrawler:
    """Coordinates batch scanning of SIGAA physical space IDs."""

    def __init__(
        self,
        client: SigaaClient | None = None,
        max_workers: int = 5,
        request_delay: float = 0.05,
    ) -> None:
        self.client = client or SigaaClient()
        self.max_workers = max_workers
        self.request_delay = request_delay
        self._lock = threading.Lock()

    def fetch_and_parse_single(self, id_sala: int) -> Room | None:
        """Fetch and parse a single room ID."""
        if self.request_delay > 0:
            time.sleep(self.request_delay)

        html_content = self.client.fetch_room_html(id_sala)
        if not html_content:
            return None

        return parse_room_page(id_sala, html_content)

    def scan_range(
        self,
        start_id: int,
        end_id: int,
        on_room_found: Callable[[Room], None] | None = None,
        on_progress: Callable[[int, int, int], None] | None = None,
    ) -> list[Room]:
        """Scan a range of IDs [start_id, end_id] concurrently.

        Returns only existing rooms (excluding non-existent spaces).
        """
        total = end_id - start_id + 1
        processed = 0
        found_rooms: list[Room] = []

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_id = {
                executor.submit(self.fetch_and_parse_single, sid): sid
                for sid in range(start_id, end_id + 1)
            }

            for future in as_completed(future_to_id):
                sid = future_to_id[future]
                room: Room | None = None
                try:
                    room = future.result()
                except Exception as exc:
                    logger.error("Error processing ID %d: %s", sid, exc)

                with self._lock:
                    processed += 1
                    if room is not None:
                        found_rooms.append(room)
                        if on_room_found:
                            on_room_found(room)
                    if on_progress:
                        on_progress(processed, total, len(found_rooms))

        found_rooms.sort(key=lambda r: r.id)
        return found_rooms

    def scan_specific_ids(self, ids: list[int]) -> list[Room]:
        """Scan a specific explicit list of IDs."""
        found_rooms: list[Room] = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_id = {executor.submit(self.fetch_and_parse_single, sid): sid for sid in ids}
            for future in as_completed(future_to_id):
                try:
                    room = future.result()
                    if room is not None:
                        found_rooms.append(room)
                except Exception as exc:
                    logger.error("Error processing ID: %s", exc)

        found_rooms.sort(key=lambda r: r.id)
        return found_rooms

    @staticmethod
    def export_to_json(rooms: list[Room], filepath: str | Path) -> None:
        """Export list of rooms to structured JSON."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = [room.to_dict() for room in rooms]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def export_to_csv(rooms: list[Room], filepath: str | Path) -> None:
        """Export tabular summary of rooms to CSV."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        headers = [
            "id",
            "building",
            "room_number",
            "category",
            "name",
            "capacity",
            "available_capacity_pct",
            "academic_period",
            "has_schedule",
            "status",
            "total_courses",
            "total_allocations",
        ]
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            for r in rooms:
                writer.writerow(
                    [
                        r.id,
                        r.building,
                        r.room_number,
                        r.category,
                        r.name,
                        r.capacity,
                        r.available_capacity_pct,
                        r.academic_period,
                        r.has_schedule,
                        r.status,
                        len(r.courses),
                        len(r.allocations),
                    ]
                )
