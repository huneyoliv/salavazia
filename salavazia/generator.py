"""Generate real-time room availability status based on UFS academic schedule."""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from salavazia.schedule import (
    BRASILIA_TZ,
    UFS_SLOTS,
    ScheduleState,
    TimeSlot,
    get_schedule_state,
)

logger = logging.getLogger(__name__)


def compute_room_status(
    room_data: dict[str, Any],
    schedule_state: ScheduleState,
) -> dict[str, Any]:
    """Compute real-time occupancy status for an individual room."""
    room_id = room_data.get("id")
    name = room_data.get("name", "")
    building = room_data.get("building", "UNKNOWN")
    room_number = room_data.get("room_number", "")
    category = room_data.get("category", "OUTRO")
    capacity = room_data.get("capacity", 0)
    has_schedule = room_data.get("has_schedule", False)
    allocations = room_data.get("allocations", [])

    # Index today's allocations by (shift, slot_index)
    today_allocations: dict[tuple[int, int], str] = {}
    for alloc in allocations:
        if alloc.get("day_of_week") == schedule_state.day_of_week:
            key = (alloc.get("shift"), alloc.get("slot_index"))
            today_allocations[key] = alloc.get("class_code", "")

    current_slot = schedule_state.current_slot
    next_slot = schedule_state.next_slot

    is_free_now = True
    current_class: str | None = None

    if current_slot is not None:
        slot_key = (current_slot.shift, current_slot.slot_index)
        if slot_key in today_allocations:
            is_free_now = False
            current_class = today_allocations[slot_key]

    is_free_next = True
    next_class: str | None = None

    if next_slot is not None:
        next_key = (next_slot.shift, next_slot.slot_index)
        if next_key in today_allocations:
            is_free_next = False
            next_class = today_allocations[next_key]

    # Compute free_until (if free now) or free_at (if occupied now)
    free_until: str | None = None
    free_at: str | None = None

    # Order remaining slots from current slot onward
    ordered_slots: list[TimeSlot] = []
    if current_slot is not None:
        curr_idx = UFS_SLOTS.index(current_slot)
        ordered_slots = UFS_SLOTS[curr_idx:]
    elif next_slot is not None:
        next_idx = UFS_SLOTS.index(next_slot)
        ordered_slots = UFS_SLOTS[next_idx:]

    if is_free_now:
        # Find next occupied slot today
        for slot in ordered_slots:
            if (slot.shift, slot.slot_index) in today_allocations:
                free_until = slot.start.strftime("%H:%M")
                break
        if free_until is None:
            free_until = "Resto do dia"
    else:
        # Currently occupied: find when this consecutive block of classes ends
        for slot in ordered_slots:
            if (slot.shift, slot.slot_index) not in today_allocations:
                free_at = slot.start.strftime("%H:%M")
                break
        if free_at is None:
            # Occupied until end of night shift
            free_at = "22:15"

    return {
        "id": room_id,
        "name": name,
        "building": building,
        "room_number": room_number,
        "category": category,
        "capacity": capacity,
        "has_schedule": has_schedule,
        "is_free_now": is_free_now,
        "is_free_next": is_free_next,
        "current_class": current_class,
        "next_class": next_class,
        "free_until": free_until,
        "free_at": free_at,
    }


def generate_status_payload(
    rooms: list[dict[str, Any]],
    target_dt: datetime | None = None,
) -> dict[str, Any]:
    """Generate complete status JSON payload for all rooms."""
    schedule_state = get_schedule_state(target_dt)

    evaluated_rooms: list[dict[str, Any]] = [
        compute_room_status(room, schedule_state) for room in rooms
    ]

    total_active = sum(1 for r in evaluated_rooms if r["has_schedule"])
    total_free_now = sum(1 for r in evaluated_rooms if r["is_free_now"] and r["has_schedule"])
    total_occupied_now = total_active - total_free_now

    current_slot_dict: dict[str, Any] | None = None
    if schedule_state.current_slot:
        cs = schedule_state.current_slot
        current_slot_dict = {
            "shift": cs.shift,
            "slot_index": cs.slot_index,
            "code": cs.code,
            "time_range": cs.time_range,
            "start": cs.start.strftime("%H:%M"),
            "end": cs.end.strftime("%H:%M"),
        }

    next_slot_dict: dict[str, Any] | None = None
    if schedule_state.next_slot:
        ns = schedule_state.next_slot
        next_slot_dict = {
            "shift": ns.shift,
            "slot_index": ns.slot_index,
            "code": ns.code,
            "time_range": ns.time_range,
            "start": ns.start.strftime("%H:%M"),
            "end": ns.end.strftime("%H:%M"),
        }

    return {
        "generated_at": datetime.now(BRASILIA_TZ).isoformat(),
        "evaluated_timestamp": schedule_state.timestamp.isoformat(),
        "schedule": {
            "day_of_week": schedule_state.day_of_week,
            "day_name": schedule_state.day_name,
            "is_academic_hours": schedule_state.is_academic_hours,
            "status_label": schedule_state.status_label,
            "current_slot": current_slot_dict,
            "next_slot": next_slot_dict,
        },
        "summary": {
            "total_rooms": len(evaluated_rooms),
            "total_active_rooms": total_active,
            "total_free_now": total_free_now,
            "total_occupied_now": total_occupied_now,
        },
        "rooms": evaluated_rooms,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate real-time room availability status")
    parser.add_argument(
        "--rooms",
        type=str,
        default="data/rooms.json",
        help="Path to rooms catalog JSON (default: data/rooms.json)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/status.json",
        help="Path to output status JSON (default: data/status.json)",
    )
    parser.add_argument(
        "--time",
        type=str,
        default=None,
        help="Optional ISO timestamp for simulation (e.g. 2026-09-25T14:30:00)",
    )
    args = parser.parse_args()

    rooms_path = Path(args.rooms)
    if not rooms_path.exists():
        raise FileNotFoundError(f"Rooms catalog file not found: {rooms_path}")

    with open(rooms_path, encoding="utf-8") as f:
        rooms_data = json.load(f)

    target_dt: datetime | None = None
    if args.time:
        target_dt = datetime.fromisoformat(args.time)

    payload = generate_status_payload(rooms_data, target_dt)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    logger.info("Successfully generated %s for %d rooms", output_path, len(payload["rooms"]))
    print(f"Generated {output_path} ({payload['summary']['total_free_now']} rooms free now)")


if __name__ == "__main__":
    main()
