/**
 * Main Application Orchestrator for Sala Vazia
 */

const AppState = {
  statusData: null,
  buildingsData: {},
  roomsCatalog: {},
  userCoords: null,
  gpsLoading: false,
  gpsError: null,
  showAll: false,
  filters: {
    query: '',
    campus: 'all',
    building: 'all',
    category: 'all',
    freeOnly: true
  }
};

async function loadData() {
  try {
    const [statusRes, buildingsRes, roomsRes] = await Promise.all([
      fetch('./data/status.json'),
      fetch('./data/buildings.json'),
      fetch('./data/rooms.json')
    ]);

    if (!statusRes.ok || !buildingsRes.ok || !roomsRes.ok) {
      throw new Error('Falha ao carregar catálogos de dados');
    }

    AppState.statusData = await statusRes.json();
    AppState.buildingsData = await buildingsRes.json();

    const rawRooms = await roomsRes.json();
    AppState.roomsCatalog = {};
    for (const r of rawRooms) {
      AppState.roomsCatalog[r.id] = r;
    }

    populateBuildingFilter();
    updateAppView();
  } catch (err) {
    console.error('Error loading data:', err);
    const grid = document.getElementById('rooms-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>Erro ao carregar dados</h3>
          <p>${err.message}</p>
          <button class="btn-reset-filters" onclick="location.reload()">Recarregar página</button>
        </div>
      `;
    }
  }
}

function populateBuildingFilter() {
  const select = document.getElementById('filter-building');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="all">Todos os Prédios</option>';

  const entries = Object.entries(AppState.buildingsData);
  entries.sort((a, b) => a[1].name.localeCompare(b[1].name));

  for (const [key, bldg] of entries) {
    if (AppState.filters.campus !== 'all' && bldg.campus !== AppState.filters.campus) {
      continue;
    }
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${bldg.name} (${bldg.campus})`;
    select.appendChild(opt);
  }

  select.value = currentVal;
}

function isDefaultSearchState() {
  const { query, campus, building, category } = AppState.filters;
  return query.trim() === '' && campus === 'all' && building === 'all' && category === 'all';
}

function hasActiveFilters() {
  const { query, campus, building, category, freeOnly } = AppState.filters;
  return query.trim() !== '' || campus !== 'all' || building !== 'all' || category !== 'all' || !freeOnly;
}

function getRoomFreeSlotsInfo(room, sigaaDay, nowMinutes) {
  const catalogEntry = AppState.roomsCatalog[room.id];
  const allocations = catalogEntry?.allocations || [];
  const allocationsToday = allocations.filter((a) => a.day_of_week === sigaaDay);

  const isSaturday = sigaaDay === 7;
  const totalSlotsToday = isSaturday ? 6 : 16;
  const totalFreeToday = Math.max(0, totalSlotsToday - allocationsToday.length);

  const applicableSlots = isSaturday
    ? (window.ScheduleEngine?.UFS_SLOTS || []).filter((s) => s.shift === 1)
    : (window.ScheduleEngine?.UFS_SLOTS || []);

  const todayAllocKeys = new Set(
    allocationsToday.map((a) => `${a.shift}_${a.slot_index}`)
  );

  let remainingFreeToday = 0;
  for (const slot of applicableSlots) {
    const endMin = window.ScheduleEngine?.parseTimeToMinutes
      ? window.ScheduleEngine.parseTimeToMinutes(slot.end)
      : 0;
    if (endMin > nowMinutes) {
      const key = `${slot.shift}_${slot.slotIndex}`;
      if (!todayAllocKeys.has(key)) {
        remainingFreeToday++;
      }
    }
  }

  return {
    totalFreeToday,
    remainingFreeToday
  };
}

function evaluateRoomPreSlotState(room, scheduleState) {
  const isPreSlot = Boolean(scheduleState?.isPreSlotWindow && scheduleState?.nextSlot);
  const nextSlotStart = scheduleState?.nextSlot?.start || null;

  if (isPreSlot) {
    if (room.is_free_now && room.is_free_next) {
      return {
        priorityGroup: 1,
        isViable: true,
        willBeOccupiedSoon: false,
        willBeFreeSoon: false,
        nextSlotStart
      };
    }

    if (!room.is_free_now && room.is_free_next) {
      return {
        priorityGroup: 2,
        isViable: true,
        willBeOccupiedSoon: false,
        willBeFreeSoon: true,
        nextSlotStart
      };
    }

    if (room.is_free_now && !room.is_free_next) {
      return {
        priorityGroup: 3,
        isViable: false,
        willBeOccupiedSoon: true,
        willBeFreeSoon: false,
        nextSlotStart
      };
    }

    return {
      priorityGroup: 4,
      isViable: false,
      willBeOccupiedSoon: false,
      willBeFreeSoon: false,
      nextSlotStart
    };
  }

  if (room.is_free_now) {
    return {
      priorityGroup: 1,
      isViable: true,
      willBeOccupiedSoon: false,
      willBeFreeSoon: false,
      nextSlotStart: null
    };
  }

  return {
    priorityGroup: 4,
    isViable: false,
    willBeOccupiedSoon: false,
    willBeFreeSoon: false,
    nextSlotStart: null
  };
}

function normalizeSearchText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_./]/g, ' ')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEvaluatedRooms(scheduleState) {
  const catalogRooms = Object.values(AppState.roomsCatalog);
  if (catalogRooms.length > 0 && window.ScheduleEngine && typeof window.ScheduleEngine.computeRoomStatus === 'function') {
    return catalogRooms.map((room) => window.ScheduleEngine.computeRoomStatus(room, scheduleState));
  }
  return AppState.statusData && AppState.statusData.rooms ? AppState.statusData.rooms : [];
}

function filterAndSortRooms(evaluatedRooms, scheduleState) {
  if (!evaluatedRooms || evaluatedRooms.length === 0) return [];

  const { query, campus, building, category, freeOnly } = AppState.filters;
  const normQuery = normalizeSearchText(query);
  const queryTokens = normQuery ? normQuery.split(' ').filter(Boolean) : [];

  const now = scheduleState ? scheduleState.timestamp || new Date() : new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sigaaDay = scheduleState
    ? scheduleState.dayOfWeek
    : (window.ScheduleEngine ? window.ScheduleEngine.getSigaaDayOfWeek(now) : now.getDay() + 1);

  const enrichedRooms = evaluatedRooms.map((room) => {
    const slotsInfo = getRoomFreeSlotsInfo(room, sigaaDay, nowMinutes);
    const preSlotState = evaluateRoomPreSlotState(room, scheduleState);

    return {
      ...room,
      free_slots_total: slotsInfo.totalFreeToday,
      free_slots_remaining: slotsInfo.remainingFreeToday,
      priority_group: preSlotState.priorityGroup,
      is_viable: preSlotState.isViable,
      will_be_occupied_soon: preSlotState.willBeOccupiedSoon,
      will_be_free_soon: preSlotState.willBeFreeSoon,
      next_slot_start: preSlotState.nextSlotStart
    };
  });

  let filtered = enrichedRooms.filter((room) => {
    if (!room.has_schedule) return false;

    if (freeOnly) {
      if (scheduleState?.isPreSlotWindow) {
        if (!room.is_viable && !room.will_be_occupied_soon) {
          return false;
        }
      } else if (!room.is_free_now) {
        return false;
      }
    }

    if (building !== 'all' && room.building !== building) return false;

    const bldgInfo = AppState.buildingsData[room.building];
    if (campus !== 'all') {
      if (!bldgInfo || bldgInfo.campus !== campus) return false;
    }

    if (category !== 'all' && room.category !== category) return false;

    if (queryTokens.length > 0) {
      const bldgName = bldgInfo ? bldgInfo.name : '';
      const rawCombined = `${room.name || ''} ${room.building || ''} ${room.room_number || ''} ${bldgName} ${room.category || ''} ${room.current_class || ''} ${room.next_class || ''}`;
      const targetNorm = normalizeSearchText(rawCombined);
      const targetWords = targetNorm.split(' ');
      const targetCompact = targetNorm.replace(/\s+/g, '');

      const matchesAllTokens = queryTokens.every((token) => {
        if (/^\d+$/.test(token)) {
          const numVal = parseInt(token, 10);
          return targetWords.some((w) => {
            if (w === token) return true;
            if (/^\d+$/.test(w)) {
              if (parseInt(w, 10) === numVal) return true;
              if (token.length >= 3 && w.startsWith(token)) return true;
            }
            return false;
          });
        }
        return targetNorm.includes(token) || targetCompact.includes(token);
      });

      if (!matchesAllTokens) return false;
    }

    return true;
  });

  const buildingDistances = {};
  if (AppState.userCoords) {
    for (const [key, bldg] of Object.entries(AppState.buildingsData)) {
      if (typeof bldg.lat === 'number' && typeof bldg.lng === 'number') {
        buildingDistances[key] = window.GeoEngine.haversineDistance(
          AppState.userCoords.lat,
          AppState.userCoords.lng,
          bldg.lat,
          bldg.lng
        );
      } else {
        buildingDistances[key] = Infinity;
      }
    }
  }

  filtered.sort((a, b) => {
    // 1. Viabilidade: salas disponíveis para estudo vêm antes
    const viableA = a.is_viable ? 1 : 0;
    const viableB = b.is_viable ? 1 : 0;
    if (viableA !== viableB) {
      return viableB - viableA;
    }

    // 2. Proximidade por didática/prédio
    if (AppState.userCoords) {
      const distA = buildingDistances[a.building] ?? Infinity;
      const distB = buildingDistances[b.building] ?? Infinity;

      if (a.building !== b.building && Math.abs(distA - distB) > 8) {
        return distA - distB;
      }
    }

    // 3. Mais horários livres no dia (slots restantes e total)
    if (a.free_slots_remaining !== b.free_slots_remaining) {
      return b.free_slots_remaining - a.free_slots_remaining;
    }

    if (a.free_slots_total !== b.free_slots_total) {
      return b.free_slots_total - a.free_slots_total;
    }

    // 4. Na janela de 15 min: livre agora tem preferência sobre desocupa às 15:15
    if (a.priority_group !== b.priority_group) {
      return a.priority_group - b.priority_group;
    }

    // 5. Categoria: Sala de aula tem preferência sobre outros tipos
    if (a.category !== b.category) {
      if (a.category === 'SALA DE AULA') return -1;
      if (b.category === 'SALA DE AULA') return 1;
    }

    // 6. Alfabético por prédio e nome
    if (a.building !== b.building) {
      return a.building.localeCompare(b.building);
    }
    return a.name.localeCompare(b.name);
  });

  const isDefaultView = !AppState.showAll && isDefaultSearchState();
  const totalCount = filtered.length;

  if (isDefaultView && totalCount > 5) {
    const previewRooms = filtered.slice(0, 5);
    previewRooms._totalCount = totalCount;
    previewRooms._isPreview = true;
    return previewRooms;
  }

  filtered._totalCount = totalCount;
  filtered._isPreview = false;
  return filtered;
}

function updateAppView() {
  const scheduleState = window.ScheduleEngine.getCurrentScheduleState();
  window.UI.renderClock(scheduleState);

  const nearestInfo = window.GeoEngine.findNearestBuilding(
    AppState.userCoords,
    AppState.buildingsData
  );

  window.UI.renderGpsBanner(
    {
      loading: AppState.gpsLoading,
      error: AppState.gpsError,
      coords: AppState.userCoords
    },
    nearestInfo
  );

  const isExpediente = scheduleState.isExpediente;
  const evaluatedRooms = getEvaluatedRooms(scheduleState);
  const filteredRooms = isExpediente ? filterAndSortRooms(evaluatedRooms, scheduleState) : [];
  const isPreview = filteredRooms._isPreview || false;
  const totalCount = filteredRooms._totalCount || filteredRooms.length;

  const totalActive = isExpediente ? evaluatedRooms.filter((r) => r.has_schedule).length : 0;
  const totalFree = isExpediente ? evaluatedRooms.filter((r) => r.has_schedule && r.is_free_now).length : 0;
  const totalOccupied = isExpediente ? totalActive - totalFree : 0;

  window.UI.renderMetrics(totalActive, totalFree, totalOccupied, isExpediente ? nearestInfo : null);
  window.UI.renderRoomsGrid(filteredRooms, AppState.buildingsData, AppState.userCoords, isPreview, totalCount, scheduleState);
}

async function requestGpsLocation() {
  AppState.gpsLoading = true;
  AppState.gpsError = null;
  updateAppView();

  try {
    const coords = await window.GeoEngine.getUserLocation();
    AppState.userCoords = coords;
    AppState.gpsLoading = false;
  } catch (err) {
    AppState.gpsError = err.message;
    AppState.gpsLoading = false;
  }

  updateAppView();
}

function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.showAll = true;
      AppState.filters.query = e.target.value;
      updateAppView();
    });
  }

  // Clear search
  const clearBtn = document.getElementById('btn-clear-search');
  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      AppState.filters.query = '';
      updateAppView();
    });
  }

  // Free Only switch
  const freeToggle = document.getElementById('toggle-free-only');
  if (freeToggle) {
    freeToggle.addEventListener('change', (e) => {
      AppState.showAll = true;
      AppState.filters.freeOnly = e.target.checked;
      updateAppView();
    });
  }

  // Campus filter pills
  const campusPills = document.querySelectorAll('.campus-pill');
  campusPills.forEach((pill) => {
    pill.addEventListener('click', (e) => {
      campusPills.forEach((p) => p.classList.remove('active'));
      e.currentTarget.classList.add('active');
      AppState.showAll = true;
      AppState.filters.campus = e.currentTarget.dataset.campus;
      populateBuildingFilter();
      updateAppView();
    });
  });

  // Building select
  const buildingSelect = document.getElementById('filter-building');
  if (buildingSelect) {
    buildingSelect.addEventListener('change', (e) => {
      AppState.showAll = true;
      AppState.filters.building = e.target.value;
      updateAppView();
    });
  }

  // Category select
  const categorySelect = document.getElementById('filter-category');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      AppState.showAll = true;
      AppState.filters.category = e.target.value;
      updateAppView();
    });
  }

  // Modal close handlers
  const modalClose = document.getElementById('modal-close');
  const modalBackdrop = document.getElementById('room-modal');
  if (modalClose && modalBackdrop) {
    modalClose.addEventListener('click', () => {
      modalBackdrop.style.display = 'none';
    });
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) modalBackdrop.style.display = 'none';
    });
  }
}

function setShowAll(val) {
  AppState.showAll = val;
  updateAppView();
}

function showRoomDetails(roomId) {
  const room = AppState.roomsCatalog[roomId];
  const modal = document.getElementById('room-modal');
  const modalBody = document.getElementById('modal-body');
  if (!room || !modal || !modalBody) return;

  const coursesList = (room.courses || [])
    .map((c) => `<li><strong>${escapeHtml(c.code)}</strong> — ${escapeHtml(c.name)}</li>`)
    .join('');

  modalBody.innerHTML = `
    <h2>${escapeHtml(room.name)}</h2>
    <div class="modal-meta-grid">
      <span>Prédio: <strong>${escapeHtml(room.building)}</strong></span>
      <span>Sala: <strong>${escapeHtml(room.room_number || '-')}</strong></span>
      <span>Capacidade: <strong>${room.capacity || 0} lugares</strong></span>
      <span>Categoria: <strong>${escapeHtml(room.category || '-')}</strong></span>
    </div>

    <h3>Disciplinas alocadas neste semestre</h3>
    <ul class="courses-list">
      ${coursesList || '<li>Nenhuma disciplina cadastrada</li>'}
    </ul>
  `;

  modal.style.display = 'flex';
}

function resetFilters() {
  AppState.showAll = false;
  AppState.filters.query = '';
  AppState.filters.campus = 'all';
  AppState.filters.building = 'all';
  AppState.filters.category = 'all';
  AppState.filters.freeOnly = true;

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  const freeToggle = document.getElementById('toggle-free-only');
  if (freeToggle) freeToggle.checked = true;

  const buildingSelect = document.getElementById('filter-building');
  if (buildingSelect) buildingSelect.value = 'all';

  const categorySelect = document.getElementById('filter-category');
  if (categorySelect) categorySelect.value = 'all';

  const campusPills = document.querySelectorAll('.campus-pill');
  campusPills.forEach((p) => {
    p.classList.toggle('active', p.dataset.campus === 'all');
  });

  populateBuildingFilter();
  updateAppView();
}

let deferredInstallPrompt = null;

function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const isSmallTouchScreen = window.innerWidth <= 820 && (
    'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
  );
  return isMobileUA || isSmallTouchScreen;
}

function isStandaloneMode() {
  const isDisplayStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const isWindowStandalone = window.navigator.standalone === true;
  const isReferrerApp = document.referrer.includes('android-app://') || document.referrer.includes('app://');
  return Boolean(isDisplayStandalone || isWindowStandalone || isReferrerApp);
}

function initPwaInstallPrompt() {
  const banner = document.getElementById('pwa-install-banner');
  const btnInstall = document.getElementById('pwa-btn-install');
  const btnDismiss = document.getElementById('pwa-btn-dismiss');
  const btnClose = document.getElementById('pwa-btn-close');
  if (!banner || !btnInstall || !btnDismiss) return;

  // Clear any legacy persistent lock so the user can see and test the prompt
  localStorage.removeItem('salavazia_pwa_dismissed_until');

  // Condition 1: Must NOT be open as an installed app
  if (isStandaloneMode()) {
    banner.style.display = 'none';
    return;
  }

  // Condition 2: Must be on a mobile device
  if (!isMobileDevice()) {
    banner.style.display = 'none';
    return;
  }

  // Condition 3: Check if dismissed during current browser session
  if (sessionStorage.getItem('salavazia_pwa_dismissed_session') === 'true') {
    banner.style.display = 'none';
    return;
  }

  function showBanner() {
    if (isMobileDevice() && !isStandaloneMode() && sessionStorage.getItem('salavazia_pwa_dismissed_session') !== 'true') {
      banner.style.display = 'block';
    }
  }

  function hideBanner() {
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(16px)';
    setTimeout(() => {
      banner.style.display = 'none';
      banner.style.opacity = '';
      banner.style.transform = '';
    }, 220);
    sessionStorage.setItem('salavazia_pwa_dismissed_session', 'true');
  }

  // Native Chrome/Android prompt hook
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showBanner();
  });

  // Prompt on page load for mobile browsers
  setTimeout(showBanner, 300);

  btnDismiss.addEventListener('click', hideBanner);
  if (btnClose) {
    btnClose.addEventListener('click', hideBanner);
  }

  btnInstall.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        hideBanner();
      }
      deferredInstallPrompt = null;
    } else {
      const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIos) {
        alert('Para usar como app no iPhone/iPad: toque no ícone de Compartilhar (no rodapé do Safari) e selecione "Adicionar à Tela de Início".');
      } else {
        alert('Para usar como app: toque no menu de opções do navegador (três pontos) e selecione "Instalar aplicativo" ou "Adicionar à tela inicial".');
      }
      hideBanner();
    }
  });

  window.addEventListener('appinstalled', () => {
    banner.style.display = 'none';
    deferredInstallPrompt = null;
  });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initPwaInstallPrompt();
  loadData();

  // Try GPS automatically on load
  requestGpsLocation();

  // Live timer: refresh clock and state every 30 seconds
  setInterval(() => {
    updateAppView();
  }, 30000);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('SW registration skipped:', err);
    });
  }
});

window.App = {
  AppState,
  requestGpsLocation,
  showRoomDetails,
  resetFilters,
  setShowAll,
  getEvaluatedRooms,
  filterAndSortRooms
};
