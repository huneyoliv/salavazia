/**
 * UFS Academic Schedule Engine (Client-side)
 * Resolução CONEPE 2024.1
 */

const UFS_SLOTS = [
  // Manhã (Shift 1)
  { shift: 1, slotIndex: 1, code: 'M1', start: '07:30', end: '08:20' },
  { shift: 1, slotIndex: 2, code: 'M2', start: '08:20', end: '09:10' },
  { shift: 1, slotIndex: 3, code: 'M3', start: '09:10', end: '10:00' },
  { shift: 1, slotIndex: 4, code: 'M4', start: '10:10', end: '11:00' },
  { shift: 1, slotIndex: 5, code: 'M5', start: '11:00', end: '11:50' },
  { shift: 1, slotIndex: 6, code: 'M6', start: '11:50', end: '12:40' },
  // Tarde (Shift 2)
  { shift: 2, slotIndex: 1, code: 'T1', start: '13:30', end: '14:20' },
  { shift: 2, slotIndex: 2, code: 'T2', start: '14:20', end: '15:10' },
  { shift: 2, slotIndex: 3, code: 'T3', start: '15:10', end: '16:00' },
  { shift: 2, slotIndex: 4, code: 'T4', start: '16:10', end: '17:00' },
  { shift: 2, slotIndex: 5, code: 'T5', start: '17:00', end: '17:50' },
  { shift: 2, slotIndex: 6, code: 'T6', start: '17:50', end: '18:40' },
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

  let currentSlot = null;
  let nextSlot = null;

  for (let i = 0; i < UFS_SLOTS.length; i++) {
    const slot = UFS_SLOTS[i];
    const startMin = parseTimeToMinutes(slot.start);
    const endMin = parseTimeToMinutes(slot.end);

    if (nowMinutes >= startMin && nowMinutes < endMin) {
      currentSlot = slot;
      nextSlot = i + 1 < UFS_SLOTS.length ? UFS_SLOTS[i + 1] : null;
      break;
    }
  }

  if (!currentSlot) {
    for (const slot of UFS_SLOTS) {
      const startMin = parseTimeToMinutes(slot.start);
      if (nowMinutes < startMin) {
        nextSlot = slot;
        break;
      }
    }
  }

  const isAcademicHours = currentSlot !== null && sigaaDay >= 2 && sigaaDay <= 7;

  let statusLabel = '';
  if (currentSlot) {
    statusLabel = `Aula em andamento: ${currentSlot.code} (${currentSlot.start} - ${currentSlot.end})`;
  } else if (nextSlot) {
    statusLabel = `Intervalo: Próxima aula ${nextSlot.code} às ${nextSlot.start}`;
  } else if (sigaaDay === 1) {
    statusLabel = 'Domingo (sem aulas regulares)';
  } else {
    statusLabel = 'Fora do horário de aulas';
  }

  return {
    dayOfWeek: sigaaDay,
    dayName,
    currentSlot,
    nextSlot,
    isAcademicHours,
    statusLabel,
    timeString: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };
}

window.ScheduleEngine = {
  UFS_SLOTS,
  DAY_NAMES,
  getSigaaDayOfWeek,
  getCurrentScheduleState
};
