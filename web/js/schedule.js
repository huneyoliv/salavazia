/**
 * UFS Academic Schedule Engine (Client-side)
 * Resolução CONEPE 2024.1
 */

const UFS_SLOTS = [
  // Manhã (Shift 1)
  { shift: 1, slotIndex: 1, code: 'M1', start: '07:30', end: '08:15' },
  { shift: 1, slotIndex: 2, code: 'M2', start: '08:15', end: '09:00' },
  { shift: 1, slotIndex: 3, code: 'M3', start: '09:15', end: '10:00' },
  { shift: 1, slotIndex: 4, code: 'M4', start: '10:00', end: '10:45' },
  { shift: 1, slotIndex: 5, code: 'M5', start: '11:00', end: '11:45' },
  { shift: 1, slotIndex: 6, code: 'M6', start: '11:45', end: '12:30' },
  // Tarde (Shift 2)
  { shift: 2, slotIndex: 1, code: 'T1', start: '13:30', end: '14:15' },
  { shift: 2, slotIndex: 2, code: 'T2', start: '14:15', end: '15:00' },
  { shift: 2, slotIndex: 3, code: 'T3', start: '15:15', end: '16:00' },
  { shift: 2, slotIndex: 4, code: 'T4', start: '16:00', end: '16:45' },
  { shift: 2, slotIndex: 5, code: 'T5', start: '17:00', end: '17:45' },
  { shift: 2, slotIndex: 6, code: 'T6', start: '17:45', end: '18:30' },
  // Noite (Shift 3)
  { shift: 3, slotIndex: 1, code: 'N1', start: '19:00', end: '19:45' },
  { shift: 3, slotIndex: 2, code: 'N2', start: '19:45', end: '20:30' },
  { shift: 3, slotIndex: 3, code: 'N3', start: '20:45', end: '21:30' },
  { shift: 3, slotIndex: 4, code: 'N4', start: '21:30', end: '22:15' }
];

const DAY_NAMES = {
  1: 'Domingo',
  2: 'Segunda-feira',
  3: 'Terça-feira',
  4: 'Quarta-feira',
  5: 'Quinta-feira',
  6: 'Sexta-feira',
  7: 'Sábado'
};

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getSigaaDayOfWeek(date = new Date()) {
  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  // SIGAA: 1=Sun, 2=Mon, ..., 7=Sat
  return date.getDay() + 1;
}

function getCurrentScheduleState(date = new Date()) {
  const sigaaDay = getSigaaDayOfWeek(date);
  const dayName = DAY_NAMES[sigaaDay] || 'Desconhecido';
  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  // UFS classes run:
  // - Monday to Friday (2..6): 07:30 (450m) to 22:15 (1335m)
  // - Saturday (7): 07:30 (450m) to 12:30 (750m) - shift 1 only
  // - Sunday (1): No classes
  const isWeekday = sigaaDay >= 2 && sigaaDay <= 6;
  const isSaturday = sigaaDay === 7;
  const isExpediente = (isWeekday && nowMinutes >= 450 && nowMinutes <= 1335) ||
                       (isSaturday && nowMinutes >= 450 && nowMinutes <= 750);

  const applicableSlots = isSaturday
    ? UFS_SLOTS.filter((s) => s.shift === 1)
    : UFS_SLOTS;

  let currentSlot = null;
  let nextSlot = null;

  if (isExpediente) {
    for (let i = 0; i < applicableSlots.length; i++) {
      const slot = applicableSlots[i];
      const startMin = parseTimeToMinutes(slot.start);
      const endMin = parseTimeToMinutes(slot.end);

      if (nowMinutes >= startMin && nowMinutes < endMin) {
        currentSlot = slot;
        nextSlot = i + 1 < applicableSlots.length ? applicableSlots[i + 1] : null;
        break;
      }
    }

    if (!currentSlot) {
      for (const slot of applicableSlots) {
        const startMin = parseTimeToMinutes(slot.start);
        if (nowMinutes < startMin) {
          nextSlot = slot;
          break;
        }
      }
    }
  }

  const isAcademicHours = currentSlot !== null && isExpediente;

  let statusLabel = '';
  let statusMode = 'off';

  if (currentSlot) {
    statusLabel = `Em aula: ${currentSlot.code} (${currentSlot.start} – ${currentSlot.end})`;
    statusMode = 'active';
  } else if (nextSlot && isExpediente) {
    statusLabel = `Intervalo · Próxima aula: ${nextSlot.code} às ${nextSlot.start}`;
    statusMode = 'interval';
  } else if (sigaaDay === 1) {
    statusLabel = 'Domingo · Sem expediente letivo';
    statusMode = 'off';
  } else if (isSaturday && nowMinutes > 750) {
    statusLabel = 'Sábado · Aulas encerradas às 12:30';
    statusMode = 'off';
  } else if (nowMinutes < 450) {
    statusLabel = 'Fora de expediente · Aulas iniciam às 07:30';
    statusMode = 'off';
  } else {
    statusLabel = 'Fora de expediente · Aulas encerradas hoje';
    statusMode = 'off';
  }

  return {
    dayOfWeek: sigaaDay,
    dayName,
    currentSlot,
    nextSlot,
    isAcademicHours,
    isExpediente,
    statusMode,
    statusLabel,
    timeString: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };
}

function computeRoomStatus(roomData, scheduleState) {
  const allocations = roomData.allocations || [];

  // When outside academic hours, do not show class projections
  if (!scheduleState.isExpediente) {
    return {
      id: roomData.id,
      name: roomData.name || '',
      building: roomData.building || 'UNKNOWN',
      room_number: roomData.room_number || '',
      category: roomData.category || 'OUTRO',
      capacity: roomData.capacity || 0,
      has_schedule: roomData.has_schedule ?? allocations.length > 0,
      is_free_now: true,
      is_free_next: true,
      current_class: null,
      next_class: null,
      free_until: null,
      free_at: null,
      is_off_hours: true
    };
  }

  const todayAllocations = {};
  for (const alloc of allocations) {
    if (alloc.day_of_week === scheduleState.dayOfWeek) {
      todayAllocations[`${alloc.shift}_${alloc.slot_index}`] = alloc.class_code;
    }
  }

  const currentSlot = scheduleState.currentSlot;
  const nextSlot = scheduleState.nextSlot;

  let isFreeNow = true;
  let currentClass = null;

  if (currentSlot) {
    const key = `${currentSlot.shift}_${currentSlot.slotIndex}`;
    if (todayAllocations[key]) {
      isFreeNow = false;
      currentClass = todayAllocations[key];
    }
  }

  let isFreeNext = true;
  let nextClass = null;

  if (nextSlot) {
    const nextKey = `${nextSlot.shift}_${nextSlot.slotIndex}`;
    if (todayAllocations[nextKey]) {
      isFreeNext = false;
      nextClass = todayAllocations[nextKey];
    }
  }

  let freeUntil = null;
  let freeAt = null;

  let orderedSlots = [];
  if (currentSlot) {
    const currIdx = UFS_SLOTS.findIndex(
      (s) => s.shift === currentSlot.shift && s.slotIndex === currentSlot.slotIndex
    );
    if (currIdx !== -1) {
      orderedSlots = UFS_SLOTS.slice(currIdx);
    }
  } else if (nextSlot) {
    const nextIdx = UFS_SLOTS.findIndex(
      (s) => s.shift === nextSlot.shift && s.slotIndex === nextSlot.slotIndex
    );
    if (nextIdx !== -1) {
      orderedSlots = UFS_SLOTS.slice(nextIdx);
    }
  }

  if (isFreeNow) {
    for (const slot of orderedSlots) {
      const key = `${slot.shift}_${slot.slotIndex}`;
      if (todayAllocations[key]) {
        freeUntil = slot.start;
        break;
      }
    }
    if (!freeUntil) {
      freeUntil = 'Resto do dia';
    }
  } else {
    for (const slot of orderedSlots) {
      const key = `${slot.shift}_${slot.slotIndex}`;
      if (todayAllocations[key] === currentClass) {
        freeAt = slot.end;
      } else {
        break;
      }
    }
    if (!freeAt && currentSlot) {
      freeAt = currentSlot.end;
    }
  }

  return {
    id: roomData.id,
    name: roomData.name || '',
    building: roomData.building || 'UNKNOWN',
    room_number: roomData.room_number || '',
    category: roomData.category || 'OUTRO',
    capacity: roomData.capacity || 0,
    has_schedule: roomData.has_schedule ?? allocations.length > 0,
    is_free_now: isFreeNow,
    is_free_next: isFreeNext,
    current_class: currentClass,
    next_class: nextClass,
    free_until: freeUntil,
    free_at: freeAt,
    is_off_hours: false
  };
}

window.ScheduleEngine = {
  UFS_SLOTS,
  DAY_NAMES,
  getSigaaDayOfWeek,
  getCurrentScheduleState,
  computeRoomStatus
};
