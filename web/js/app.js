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
          <div class="empty-icon">⚠️</div>
          <h3>Erro ao carregar dados</h3>
          <p>${err.message}</p>
          <button class="btn-primary" onclick="location.reload()">Recarregar Página</button>
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

function getRoomAvailabilityScore(room, nowMinutes, sigaaDay) {
  if (!room.is_free_now) {
    return 0;
  }

  if (room.free_until === 'Resto do dia') {
    const catalogEntry = AppState.roomsCatalog[room.id];
    const allocationsToday = (catalogEntry?.allocations || []).filter(
      (a) => a.day_of_week === sigaaDay
    ).length;
    return allocationsToday === 0 ? 900 : 720;
  }

  if (room.free_until && room.free_until.includes(':')) {
    const [h, m] = room.free_until.split(':').map(Number);
    const endMinutes = h * 60 + m;
    let diff = endMinutes - nowMinutes;
    if (diff < 0) diff = 30;

    if (!room.is_free_next) {
      return Math.min(diff, 45);
    }
    return diff;
  }

  return room.is_free_next ? 120 : 30;
}

function filterAndSortRooms() {
  if (!AppState.statusData || !AppState.statusData.rooms) return [];

  const { query, campus, building, category, freeOnly } = AppState.filters;
  const qLower = query.trim().toLowerCase();

  let filtered = AppState.statusData.rooms.filter((room) => {
    if (!room.has_schedule) return false;

    if (freeOnly && !room.is_free_now) return false;

    if (building !== 'all' && room.building !== building) return false;

    const bldgInfo = AppState.buildingsData[room.building];
    if (campus !== 'all') {
      if (!bldgInfo || bldgInfo.campus !== campus) return false;
    }

    if (category !== 'all' && room.category !== category) return false;

    if (qLower) {
      const matchName = (room.name || '').toLowerCase().includes(qLower);
      const matchBldg = (room.building || '').toLowerCase().includes(qLower);
      const matchNum = (room.room_number || '').toLowerCase().includes(qLower);
      const matchClass = (room.current_class || '').toLowerCase().includes(qLower) ||
                         (room.next_class || '').toLowerCase().includes(qLower);
      if (!matchName && !matchBldg && !matchNum && !matchClass) return false;
    }

    return true;
  });

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sigaaDay = window.ScheduleEngine ? window.ScheduleEngine.getSigaaDayOfWeek(now) : now.getDay() + 1;

  filtered.sort((a, b) => {
    if (a.is_free_now !== b.is_free_now) {
      return a.is_free_now ? -1 : 1;
    }

    const availA = getRoomAvailabilityScore(a, nowMinutes, sigaaDay);
    const availB = getRoomAvailabilityScore(b, nowMinutes, sigaaDay);

    if (AppState.userCoords) {
      const bldgA = AppState.buildingsData[a.building];
      const bldgB = AppState.buildingsData[b.building];
      const distA = bldgA && typeof bldgA.lat === 'number'
        ? window.GeoEngine.haversineDistance(AppState.userCoords.lat, AppState.userCoords.lng, bldgA.lat, bldgA.lng)
        : Infinity;
      const distB = bldgB && typeof bldgB.lat === 'number'
        ? window.GeoEngine.haversineDistance(AppState.userCoords.lat, AppState.userCoords.lng, bldgB.lat, bldgB.lng)
        : Infinity;

      const effDistA = distA - (availA * 0.35);
      const effDistB = distB - (availB * 0.35);

      if (Math.abs(effDistA - effDistB) > 0.01) {
        return effDistA - effDistB;
      }
      return a.name.localeCompare(b.name);
    }

    if (availA !== availB) {
      return availB - availA;
    }

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

  const filteredRooms = filterAndSortRooms();
  const isPreview = filteredRooms._isPreview || false;
  const totalCount = filteredRooms._totalCount || filteredRooms.length;

  const totalActive = AppState.statusData ? AppState.statusData.summary.total_active_rooms : 0;
  const totalFree = AppState.statusData ? AppState.statusData.summary.total_free_now : 0;
  const totalOccupied = totalActive - totalFree;

  window.UI.renderMetrics(totalActive, totalFree, totalOccupied, nearestInfo);
  window.UI.renderRoomsGrid(filteredRooms, AppState.buildingsData, AppState.userCoords, isPreview, totalCount);
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
    .map((c) => `<li><strong>${c.code}</strong> — ${c.name}</li>`)
    .join('');

  modalBody.innerHTML = `
    <h2>${room.name}</h2>
    <div class="modal-meta">
      <span>🏛️ <strong>Prédio:</strong> ${room.building}</span>
      <span>🚪 <strong>Número:</strong> ${room.room_number || '-'}</span>
      <span>👥 <strong>Capacidade:</strong> ${room.capacity || 0} alunos</span>
      <span>🏷️ <strong>Categoria:</strong> ${room.category || '-'}</span>
    </div>

    <h3>Disciplinas Alocadas neste Semestre</h3>
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

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
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
  requestGpsLocation,
  showRoomDetails,
  resetFilters,
  setShowAll
};
