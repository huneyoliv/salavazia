"""Official UFS timetable and slot definitions according to CONEPE resolutions."""

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

BRASILIA_TZ = timezone(timedelta(hours=-3))

DAY_NAMES: dict[int, str] = {
    1: "Domingo",
    2: "Segunda-feira",
    3: "Terça-feira",
    4: "Quarta-feira",
    5: "Quinta-feira",
    6: "Sexta-feira",
    7: "Sábado",
}


@dataclass(frozen=True)
class TimeSlot:
    """Academic class time slot in the UFS schedule."""

    shift: int  # 1=Manhã, 2=Tarde, 3=Noite
    slot_index: int  # 1..6 (Manhã/Tarde) or 1..4 (Noite)
    code: str  # e.g. M1, T2, N3
    start: time
    end: time

    @property
    def time_range(self) -> str:
        return f"{self.start.strftime('%H:%M')} - {self.end.strftime('%H:%M')}"


UFS_SLOTS: list[TimeSlot] = [
    # Manhã (Shift 1)
    TimeSlot(shift=1, slot_index=1, code="M1", start=time(7, 30), end=time(8, 15)),
    TimeSlot(shift=1, slot_index=2, code="M2", start=time(8, 15), end=time(9, 0)),
    TimeSlot(shift=1, slot_index=3, code="M3", start=time(9, 15), end=time(10, 0)),
    TimeSlot(shift=1, slot_index=4, code="M4", start=time(10, 0), end=time(10, 45)),
    TimeSlot(shift=1, slot_index=5, code="M5", start=time(11, 0), end=time(11, 45)),
    TimeSlot(shift=1, slot_index=6, code="M6", start=time(11, 45), end=time(12, 30)),
    # Tarde (Shift 2)
    TimeSlot(shift=2, slot_index=1, code="T1", start=time(13, 30), end=time(14, 15)),
    TimeSlot(shift=2, slot_index=2, code="T2", start=time(14, 15), end=time(15, 0)),
    TimeSlot(shift=2, slot_index=3, code="T3", start=time(15, 15), end=time(16, 0)),
    TimeSlot(shift=2, slot_index=4, code="T4", start=time(16, 0), end=time(16, 45)),
    TimeSlot(shift=2, slot_index=5, code="T5", start=time(17, 0), end=time(17, 45)),
    TimeSlot(shift=2, slot_index=6, code="T6", start=time(17, 45), end=time(18, 30)),
    # Noite (Shift 3)
    TimeSlot(shift=3, slot_index=1, code="N1", start=time(19, 0), end=time(19, 45)),
    TimeSlot(shift=3, slot_index=2, code="N2", start=time(19, 45), end=time(20, 30)),
    TimeSlot(shift=3, slot_index=3, code="N3", start=time(20, 45), end=time(21, 30)),
    TimeSlot(shift=3, slot_index=4, code="N4", start=time(21, 30), end=time(22, 15)),
]


@dataclass
class ScheduleState:
    """Current evaluation of UFS schedule based on a target timestamp."""

    timestamp: datetime
    day_of_week: int  # 1=Dom, 2=Seg, ..., 7=Sab
    day_name: str
    current_slot: TimeSlot | None
    next_slot: TimeSlot | None
    is_academic_hours: bool
    status_label: str
    is_expediente: bool = False


def get_sigaa_day_of_week(dt: datetime) -> int:
    """Map ISO weekday (1=Mon..7=Sun) to SIGAA day of week (1=Sun, 2=Mon..7=Sat)."""
    return (dt.isoweekday() % 7) + 1


def get_schedule_state(target_dt: datetime | None = None) -> ScheduleState:
    """Determine the active slot and next slot for a given datetime."""
    if target_dt is None:
        target_dt = datetime.now(BRASILIA_TZ)
    elif target_dt.tzinfo is None:
        target_dt = target_dt.replace(tzinfo=BRASILIA_TZ)

    sigaa_day = get_sigaa_day_of_week(target_dt)
    day_name = DAY_NAMES.get(sigaa_day, "Desconhecido")
    current_time = target_dt.time()
    now_minutes = current_time.hour * 60 + current_time.minute

    # UFS schedule rules:
    # - Mon..Fri (2..6): 07:30 (450m) to 22:15 (1335m)
    # - Saturday (7): 07:30 (450m) to 12:30 (750m) - shift 1 only
    # - Sunday (1): No classes
    is_weekday = 2 <= sigaa_day <= 6
    is_saturday = sigaa_day == 7
    is_expediente = (is_weekday and 450 <= now_minutes <= 1335) or (
        is_saturday and 450 <= now_minutes <= 750
    )

    applicable_slots = [s for s in UFS_SLOTS if s.shift == 1] if is_saturday else UFS_SLOTS

    current_slot: TimeSlot | None = None
    next_slot: TimeSlot | None = None

    if is_expediente:
        # Find matching current slot
        for idx, slot in enumerate(applicable_slots):
            if slot.start <= current_time < slot.end:
                current_slot = slot
                if idx + 1 < len(applicable_slots):
                    next_slot = applicable_slots[idx + 1]
                break

        # If not in an active slot, find upcoming slot in applicable slots today
        if current_slot is None:
            for slot in applicable_slots:
                if current_time < slot.start:
                    next_slot = slot
                    break

    is_academic_hours = current_slot is not None and is_expediente

    if current_slot:
        status_label = f"Aula em andamento: {current_slot.code} ({current_slot.time_range})"
    elif next_slot and is_expediente:
        next_time = next_slot.start.strftime("%H:%M")
        status_label = f"Intervalo: Próxima aula {next_slot.code} às {next_time}"
    elif sigaa_day == 1:
        status_label = "Domingo (sem aulas regulares)"
    elif is_saturday and now_minutes > 750:
        status_label = "Sábado (aulas encerradas às 12:30)"
    elif now_minutes < 450:
        status_label = "Fora de expediente (aulas iniciam às 07:30)"
    else:
        status_label = "Fora do horário de aulas"

    return ScheduleState(
        timestamp=target_dt,
        day_of_week=sigaa_day,
        day_name=day_name,
        current_slot=current_slot,
        next_slot=next_slot,
        is_academic_hours=is_academic_hours,
        status_label=status_label,
        is_expediente=is_expediente,
    )
