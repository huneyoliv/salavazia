"""Unit tests for the schedule state and real-time room availability generator."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from salavazia.generator import (
    compute_room_status,
    generate_status_payload,
)
from salavazia.schedule import (
    BRASILIA_TZ,
    get_schedule_state,
    get_sigaa_day_of_week,
)


def test_sigaa_day_mapping() -> None:
    # 2026-09-21 was a Monday
    monday = datetime(2026, 9, 21, 10, 0, tzinfo=BRASILIA_TZ)
    assert get_sigaa_day_of_week(monday) == 2

    # 2026-09-25 was a Friday
    friday = datetime(2026, 9, 25, 14, 0, tzinfo=BRASILIA_TZ)
    assert get_sigaa_day_of_week(friday) == 6

    # 2026-09-26 was a Saturday
    saturday = datetime(2026, 9, 26, 9, 0, tzinfo=BRASILIA_TZ)
    assert get_sigaa_day_of_week(saturday) == 7

    # 2026-09-27 was a Sunday
    sunday = datetime(2026, 9, 27, 10, 0, tzinfo=BRASILIA_TZ)
    assert get_sigaa_day_of_week(sunday) == 1


def test_schedule_state_active_slot() -> None:
    # Monday at 08:30 (M2: 08:20 - 09:10)
    dt = datetime(2026, 9, 21, 8, 30, tzinfo=BRASILIA_TZ)
    state = get_schedule_state(dt)

    assert state.day_of_week == 2
    assert state.is_academic_hours is True
    assert state.current_slot is not None
    assert state.current_slot.code == "M2"
    assert state.next_slot is not None
    assert state.next_slot.code == "M3"


def test_schedule_state_lunch_interval() -> None:
    # Monday at 12:50 (between M6 end 12:40 and T1 start 13:30)
    dt = datetime(2026, 9, 21, 12, 50, tzinfo=BRASILIA_TZ)
    state = get_schedule_state(dt)

    assert state.day_of_week == 2
    assert state.is_academic_hours is False
    assert state.current_slot is None
    assert state.next_slot is not None
    assert state.next_slot.code == "T1"


def test_schedule_state_night_and_off_hours() -> None:
    # Wednesday at 20:00 (N2: 19:45 - 20:30)
    dt_night = datetime(2026, 9, 23, 20, 0, tzinfo=BRASILIA_TZ)
    state_night = get_schedule_state(dt_night)
    assert state_night.current_slot is not None
    assert state_night.current_slot.code == "N2"
    assert state_night.next_slot is not None
    assert state_night.next_slot.code == "N3"

    # Dawn at 03:00
    dt_dawn = datetime(2026, 9, 23, 3, 0, tzinfo=BRASILIA_TZ)
    state_dawn = get_schedule_state(dt_dawn)
    assert state_dawn.current_slot is None
    assert state_dawn.next_slot is not None
    assert state_dawn.next_slot.code == "M1"

    # Late night at 23:00
    dt_late = datetime(2026, 9, 23, 23, 0, tzinfo=BRASILIA_TZ)
    state_late = get_schedule_state(dt_late)
    assert state_late.current_slot is None
    assert state_late.next_slot is None


def test_compute_room_status_occupied_and_free() -> None:
    # Friday 14:30 -> Shift 2 (Tarde), Slot 2 (T2)
    dt = datetime(2026, 9, 25, 14, 30, tzinfo=BRASILIA_TZ)
    state = get_schedule_state(dt)

    # Room 1: Occupied in T2 and T3
    occupied_room = {
        "id": 1001,
        "name": "SALA 101",
        "building": "DID 6",
        "room_number": "101",
        "category": "SALA DE AULA",
        "capacity": 50,
        "has_schedule": True,
        "allocations": [
            {"day_of_week": 6, "shift": 2, "slot_index": 2, "class_code": "MAT0101"},
            {"day_of_week": 6, "shift": 2, "slot_index": 3, "class_code": "MAT0101"},
        ],
    }
    status1 = compute_room_status(occupied_room, state)
    assert status1["is_free_now"] is False
    assert status1["current_class"] == "MAT0101"
    assert status1["is_free_next"] is False
    assert status1["free_at"] == "16:10"  # Free after T3 ends (T4 starts 16:10)

    # Room 2: Free now in T2, but has class in T3
    soon_occupied_room = {
        "id": 1002,
        "name": "SALA 102",
        "building": "DID 6",
        "room_number": "102",
        "category": "SALA DE AULA",
        "capacity": 40,
        "has_schedule": True,
        "allocations": [
            {"day_of_week": 6, "shift": 2, "slot_index": 3, "class_code": "FIS0202"},
        ],
    }
    status2 = compute_room_status(soon_occupied_room, state)
    assert status2["is_free_now"] is True
    assert status2["current_class"] is None
    assert status2["is_free_next"] is False
    assert status2["next_class"] == "FIS0202"
    assert status2["free_until"] == "15:10"  # T3 starts at 15:10

    # Room 3: Completely free for the rest of today
    completely_free_room = {
        "id": 1003,
        "name": "SALA 103",
        "building": "DID 6",
        "room_number": "103",
        "category": "SALA DE AULA",
        "capacity": 60,
        "has_schedule": True,
        "allocations": [],
    }
    status3 = compute_room_status(completely_free_room, state)
    assert status3["is_free_now"] is True
    assert status3["free_until"] == "Resto do dia"


def test_generate_status_payload_with_real_catalog() -> None:
    rooms_path = Path("data/rooms.json")
    assert rooms_path.exists()

    with open(rooms_path, encoding="utf-8") as f:
        rooms = json.load(f)

    # Test generation for a known lecture time: Thursday 15:00 (T2)
    test_dt = datetime(2026, 9, 24, 15, 0, tzinfo=timezone(timedelta(hours=-3)))
    payload = generate_status_payload(rooms, test_dt)

    assert "generated_at" in payload
    assert payload["summary"]["total_rooms"] == len(rooms)
    assert payload["summary"]["total_active_rooms"] > 0
    total_active = payload["summary"]["total_active_rooms"]
    sum_rooms = payload["summary"]["total_free_now"] + payload["summary"]["total_occupied_now"]
    assert sum_rooms == total_active

    # Verify room items
    room_item = payload["rooms"][0]
    required_keys = {
        "id", "name", "building", "room_number", "category",
        "capacity", "has_schedule", "is_free_now", "is_free_next",
        "current_class", "next_class", "free_until", "free_at"
    }
    assert required_keys.issubset(room_item.keys())
