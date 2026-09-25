"""Unit tests for the crawler and export functionalities."""

import json
from pathlib import Path
from unittest.mock import MagicMock

from salavazia.crawler import RoomCrawler
from salavazia.models import Course, Room, SlotAllocation
from tests.test_parser import SAMPLE_NONEXISTENT_HTML, SAMPLE_VALID_ROOM_HTML


def create_dummy_room(room_id: int) -> Room:
    return Room(
        id=room_id,
        name=f"SALA DE AULA - DID 6 - {room_id}",
        building="DID 6",
        room_number=str(room_id),
        category="SALA DE AULA",
        capacity=40,
        available_capacity_pct=80,
        academic_period="2026/2",
        has_schedule=True,
        status="active",
        courses=[Course(code="MAT001", name="Calculo I")],
        allocations=[
            SlotAllocation(
                slot_id=f"{room_id}_2_1_1",
                day_of_week=2,
                shift=1,
                slot_index=1,
                class_code="MAT001",
            )
        ],
    )


def test_crawler_scan_range_with_mock_client() -> None:
    mock_client = MagicMock()

    def mock_fetch(room_id: int, timeout: float = 12.0) -> str:
        if room_id == 1008644:
            return SAMPLE_VALID_ROOM_HTML
        return SAMPLE_NONEXISTENT_HTML

    mock_client.fetch_room_html.side_effect = mock_fetch

    crawler = RoomCrawler(client=mock_client, max_workers=2, request_delay=0.0)
    rooms = crawler.scan_range(start_id=1008643, end_id=1008645)

    assert len(rooms) == 1
    assert rooms[0].id == 1008644
    assert rooms[0].building == "DID 6"


def test_crawler_export_json_and_csv(tmp_path: Path) -> None:
    rooms = [create_dummy_room(1008640), create_dummy_room(1008641)]

    json_path = tmp_path / "rooms.json"
    csv_path = tmp_path / "rooms.csv"

    RoomCrawler.export_to_json(rooms, json_path)
    RoomCrawler.export_to_csv(rooms, csv_path)

    assert json_path.exists()
    assert csv_path.exists()

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == 2
    assert data[0]["id"] == 1008640
    assert data[1]["id"] == 1008641

    with open(csv_path, encoding="utf-8") as f:
        lines = f.readlines()
    assert len(lines) == 3  # Header + 2 rows
    assert "1008640" in lines[1]
    assert "1008641" in lines[2]
