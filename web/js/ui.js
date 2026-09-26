/**
 * UI Rendering and Component Builders for Sala Vazia
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderClock(state) {
  const clockEl = document.getElementById('live-clock');
  const slotEl = document.getElementById('live-slot-badge');
  const statusEl = document.getElementById('live-status-label');

  if (clockEl) {
    clockEl.textContent = state.timeString;
  }
  if (slotEl) {
    if (state.currentSlot) {
      slotEl.textContent = `${state.currentSlot.code} (${state.currentSlot.start} - ${state.currentSlot.end})`;
      slotEl.className = 'slot-badge slot-active';
    } else if (state.nextSlot) {
      slotEl.textContent = `Intervalo • Próxima: ${state.nextSlot.code}`;
      slotEl.className = 'slot-badge slot-interval';
    } else {
      slotEl.textContent = 'Fora de expediente';
      slotEl.className = 'slot-badge slot-off';
    }
  }
  if (statusEl) {
    statusEl.textContent = `${state.dayName} • ${state.statusLabel}`;
  }
}

function renderGpsBanner(gpsState, nearestInfo) {
  const banner = document.getElementById('gps-banner');
  if (!banner) return;

  if (gpsState.loading) {
    banner.innerHTML = `
      <div class="gps-card gps-loading">
        <div class="gps-spinner"></div>
        <div class="gps-info">
          <strong>Detectando sua localização no campus...</strong>
          <span>Aguarde alguns segundos para ordenar as salas mais próximas.</span>
        </div>
      </div>
    `;
    banner.style.display = 'block';
    return;
  }

  if (gpsState.error || !gpsState.coords) {
    banner.innerHTML = `
      <div class="gps-card gps-notice">
        <span class="gps-icon">🔍</span>
        <div class="gps-info">
          <strong>GPS não ativado — Busque pela barra de pesquisa</strong>
          <span>Sem GPS? Use a <strong>barra de busca</strong> abaixo para procurar pelo prédio ou sala desejada (ex: <em>DID 3, 104, Química</em>).</span>
        </div>
        <div class="gps-actions">
          <button id="btn-focus-search" class="btn-sm btn-search-cta" title="Rolar até a barra de busca">
            🔍 Ir para a Busca
          </button>
          <button id="btn-retry-gps" class="btn-sm btn-outline" title="Tentar ativar GPS">
            📍 Ativar GPS
          </button>
        </div>
      </div>
    `;
    banner.style.display = 'block';

    const focusBtn = document.getElementById('btn-focus-search');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const input = document.getElementById('search-input');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          input.classList.remove('highlight-pulse');
          void input.offsetWidth;
          input.classList.add('highlight-pulse');
        }
      });
    }

    const retryBtn = document.getElementById('btn-retry-gps');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => window.App.requestGpsLocation());
    }
    return;
  }

  if (gpsState.coords && nearestInfo) {
    banner.innerHTML = `
      <div class="gps-card gps-success">
        <span class="gps-icon pulse-dot">📍</span>
        <div class="gps-info">
          <strong>Você está a ${nearestInfo.distanceFormatted} do prédio ${escapeHtml(nearestInfo.building.name)}</strong>
          <span>${escapeHtml(nearestInfo.building.campus)} • Salas ordenadas da mais próxima para a mais distante</span>
        </div>
        <button id="btn-refresh-gps" class="btn-sm btn-outline" title="Atualizar GPS">Atualizar 📍</button>
      </div>
    `;
    banner.style.display = 'block';
    const refreshBtn = document.getElementById('btn-refresh-gps');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => window.App.requestGpsLocation());
    }
    return;
  }

  banner.style.display = 'none';
}

function renderMetrics(totalRooms, totalFree, totalOccupied, nearestInfo) {
  const freeEl = document.getElementById('metric-free');
  const occupiedEl = document.getElementById('metric-occupied');
  const nearestEl = document.getElementById('metric-nearest');

  if (freeEl) freeEl.textContent = totalFree;
  if (occupiedEl) occupiedEl.textContent = totalOccupied;
  if (nearestEl) {
    if (nearestInfo) {
      nearestEl.innerHTML = `<strong>${escapeHtml(nearestInfo.key)}</strong> <span class="text-subtle">(${nearestInfo.distanceFormatted})</span>`;
    } else {
      nearestEl.innerHTML = '<span class="text-subtle" title="Utilize a barra de busca para encontrar sua sala">Use a busca 🔍</span>';
    }
  }
}

function renderRoomCard(room, buildingInfo, distanceMeters) {
  const isFree = room.is_free_now;
  const statusClass = isFree ? 'badge-free' : 'badge-occupied';
  const statusText = isFree ? 'LIVRE AGORA' : 'OCUPADA';

  let timeProjectionHtml = '';
  if (isFree) {
    if (room.free_until === 'Resto do dia') {
      timeProjectionHtml = `<span class="time-label text-success">Livre pelo resto do dia</span>`;
    } else if (room.free_until) {
      timeProjectionHtml = `<span class="time-label text-warning">Livre até <strong>${room.free_until}</strong> (próx: ${room.next_class || 'aula'})</span>`;
    }
  } else {
    timeProjectionHtml = `<span class="time-label text-danger">Ocupada por <strong>${escapeHtml(room.current_class || 'Turma')}</strong> • Libera às <strong>${room.free_at || 'fim do turno'}</strong></span>`;
  }

  const distanceHtml = distanceMeters !== null
    ? `<span class="room-distance">📍 ${window.GeoEngine.formatDistance(distanceMeters)}</span>`
    : '';

  const buildingName = buildingInfo ? buildingInfo.name : room.building;
  const campusBadge = buildingInfo ? `<span class="campus-tag">${escapeHtml(buildingInfo.campus)}</span>` : '';

  return `
    <article class="room-card ${isFree ? 'card-free' : 'card-occupied'}" data-room-id="${room.id}">
      <div class="card-header">
        <div class="header-left">
          ${campusBadge}
          <h3 class="room-title">${escapeHtml(room.name)}</h3>
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>

      <div class="card-meta">
        <span class="meta-item">🏛️ ${escapeHtml(buildingName)}</span>
        <span class="meta-item">🚪 Sala ${escapeHtml(room.room_number || '-')}</span>
        <span class="meta-item">👥 Cap. ${room.capacity || 0}</span>
        ${distanceHtml}
      </div>

      <div class="card-projection">
        ${timeProjectionHtml}
      </div>

      <div class="card-footer">
        <span class="category-tag">${escapeHtml(room.category || 'SALA DE AULA')}</span>
        <button class="btn-details" onclick="window.App.showRoomDetails(${room.id})">Ver Detalhes</button>
      </div>
    </article>
  `;
}

function renderRoomsGrid(rooms, buildings, userCoords, isPreview, totalCount) {
  const container = document.getElementById('rooms-grid');
  const countEl = document.getElementById('results-count');
  if (!container) return;

  if (rooms.length === 0) {
    const hasGps = !!userCoords;
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏫</div>
        <h3>Nenhuma sala encontrada</h3>
        <p>${hasGps ? 'Não há salas com os filtros aplicados nesta região.' : 'Tente ajustar os filtros de busca ou campus.'}</p>
        <button class="btn-primary" onclick="window.App.resetFilters()">Limpar Filtros</button>
      </div>
    `;
    if (countEl) countEl.textContent = '0 salas';
    return;
  }

  if (countEl) {
    if (isPreview) {
      countEl.textContent = `Mostrando as 5 salas mais prioritárias (de ${totalCount} salas livres)`;
    } else {
      const freeCount = rooms.filter((r) => r.is_free_now).length;
      const occupiedCount = rooms.length - freeCount;
      if (occupiedCount > 0 && freeCount > 0) {
        countEl.textContent = `${rooms.length} salas encontradas (${freeCount} livres no topo • ${occupiedCount} ocupadas)`;
      } else if (freeCount > 0) {
        countEl.textContent = `${rooms.length} sala${rooms.length !== 1 ? 's' : ''} livre${rooms.length !== 1 ? 's' : ''} encontrada${rooms.length !== 1 ? 's' : ''}`;
      } else {
        countEl.textContent = `${rooms.length} sala${rooms.length !== 1 ? 's' : ''} ocupada${rooms.length !== 1 ? 's' : ''} encontrada${rooms.length !== 1 ? 's' : ''}`;
      }
    }
  }

  const cardsHtml = rooms.map((room) => {
    const buildingInfo = buildings[room.building];
    let dist = null;
    if (userCoords && buildingInfo && typeof buildingInfo.lat === 'number') {
      dist = window.GeoEngine.haversineDistance(
        userCoords.lat,
        userCoords.lng,
        buildingInfo.lat,
        buildingInfo.lng
      );
    }
    return renderRoomCard(room, buildingInfo, dist);
  }).join('');

  // Show-all banner when in preview mode and there are more rooms to display
  const showAllBanner = (isPreview && totalCount > rooms.length) ? `
    <div class="show-all-banner">
      <span>Mostrando 5 de <strong>${totalCount}</strong> salas livres disponíveis</span>
      <button class="btn-show-all" id="btn-show-all" onclick="window.App.setShowAll(true)">
        Ver todas as ${totalCount} salas
      </button>
    </div>
  ` : '';

  container.innerHTML = cardsHtml + showAllBanner;
}

window.UI = {
  renderClock,
  renderGpsBanner,
  renderMetrics,
  renderRoomsGrid
};
