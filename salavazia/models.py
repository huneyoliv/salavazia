"""Data models for SIGAA rooms, courses, and schedules."""

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Course:
    code: str
    name: str


@dataclass
class SlotAllocation:
    slot_id: str
    day_of_week: int
    shift: int
    slot_index: int
    class_code: str


@dataclass
class Room:
    id: int
    name: str
    building: str
    room_number: str
    category: str
    capacity: int
    available_capacity_pct: int
    academic_period: str
    has_schedule: bool
    status: str
    courses: list[Course] = field(default_factory=list)
    allocations: list[SlotAllocation] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
