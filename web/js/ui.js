/**
 * UI Rendering and Component Builders for Sala Vazia
 * Clean, Utility-First Design System
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
  const dotEl = document.getElementById('live-dot');
  const statusEl = document.getElementById('live-status-label');

  if (clockEl) {
    clockEl.textContent = state.timeString;
  }

  if (slotEl) {
    if (state.currentSlot) {
      slotEl.textContent = `${state.currentSlot.code} (${state.currentSlot.start} – ${state.currentSlot.end})`;
    } else if (state.nextSlot && state.isExpediente) {
      slotEl.textContent = `Intervalo · Próxima: ${state.nextSlot.code} (${state.nextSlot.start})`;
    } else {
      slotEl.textContent = 'Fora de expediente';
    }
  }

  if (dotEl) {
    dotEl.className = 'live-dot';
    if (state.statusMode === 'active') {
      dotEl.classList.add('dot-active');
    } else if (state.statusMode === 'interval') {
      dotEl.classList.add('dot-interval');
    } else {
      dotEl.classList.add('dot-off');
    }
  }

  if (statusEl) {
    statusEl.textContent = `${state.dayName} · ${state.statusLabel}`;
  }
}

function renderGpsBanner(gpsState, nearestInfo) {
  const banner = document.getElementById('gps-banner');
  if (!banner) return;

  if (gpsState.loading) {
    banner.innerHTML = `
      <div class="gps-banner-card is-searching">
        <div class="gps-banner-content">
          <svg class="icon-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
            <path d="M2 12h20"/>
          </svg>
          <span>Obtendo sua localização no campus para ordenar as salas...</span>
        </div>
      </div>
    `;
    banner.style.display = 'block';
    return;
  }

  if (gpsState.error || !gpsState.coords) {
    banner.innerHTML = `
      <div class="gps-banner-card">
        <div class="gps-banner-content">
          <svg class="icon-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Localização não ativada. Use a busca ou ative o GPS para ordenar por proximidade.</span>
        </div>
        <div class="gps-banner-actions">
          <button id="btn-retry-gps" class="btn-banner-action" title="Ativar localização">Ativar GPS</button>
        </div>
      </div>
    `;
    banner.style.display = 'block';

    const retryBtn = document.getElementById('btn-retry-gps');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => window.App.requestGpsLocation());
    }
    return;
  }

  if (gpsState.coords && nearestInfo) {
    banner.innerHTML = `
      <div class="gps-banner-card is-active">
        <div class="gps-banner-content">
          <svg class="icon-inline" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Você está a <strong>${escapeHtml(nearestInfo.distanceFormatted)}</strong> do prédio <strong>${escapeHtml(nearestInfo.building.name)}</strong> · Salas ordenadas por distância</span>
        </div>
        <div class="gps-banner-actions">
          <button id="btn-refresh-gps" class="btn-banner-action" title="Atualizar localização">Atualizar</button>
        </div>
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
      nearestEl.textContent = `${nearestInfo.key} (${nearestInfo.distanceFormatted})`;
    } else {
      nearestEl.textContent = 'Não detectado';
    }
  }
}

function renderRoomCard(room, buildingInfo, distanceMeters) {
  const isOffHours = Boolean(room.is_off_hours);
  const isFree = Boolean(room.is_free_now);

  let statusBadgeHtml = '';
  let projectionHtml = '';

  if (isOffHours) {
    statusBadgeHtml = `
      <span class="status-pill pill-off">
        <span class="badge-dot"></span>
        Sem expediente
      </span>
    `;
    projectionHtml = `
      <div class="card-projection-box">
        <span class="projection-text is-off">Fora do horário de expediente letivo</span>
      </div>
    `;
  } else if (isFree) {
    statusBadgeHtml = `
      <span class="status-pill pill-free">
        <span class="badge-dot"></span>
        Livre agora
      </span>
    `;

    let timeText = 'Livre pelo restante do dia';
    if (room.free_until && room.free_until !== 'Resto do dia') {
      timeText = `Livre até <strong>${room.free_until}</strong>${room.next_class ? ` · Próx: ${escapeHtml(room.next_class)}` : ''}`;
    }

    projectionHtml = `
      <div class="card-projection-box">
        <svg class="projection-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="projection-text is-free">${timeText}</span>
      </div>
    `;
  } else {
    statusBadgeHtml = `
      <span class="status-pill pill-occupied">
        <span class="badge-dot"></span>
        Em aula
      </span>
    `;

    const className = room.current_class ? escapeHtml(room.current_class) : 'Turma';
    const releaseTime = room.free_at ? room.free_at : 'fim do turno';

    projectionHtml = `
      <div class="card-projection-box">
        <svg class="projection-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="projection-text is-occupied">Ocupada por <strong>${className}</strong> · Libera às <strong>${releaseTime}</strong></span>
      </div>
    `;
  }

  const distanceHtml = distanceMeters !== null
    ? `<span class="meta-item meta-distance">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        ${window.GeoEngine.formatDistance(distanceMeters)}
      </span>`
    : '';

  const buildingName = buildingInfo ? buildingInfo.name : room.building;
  const campusName = buildingInfo ? buildingInfo.campus : 'UFS';
  const roomDisplayTitle = room.room_number ? `Sala ${escapeHtml(room.room_number)}` : escapeHtml(room.name);

  return `
    <article class="room-card" data-room-id="${room.id}">
      <div class="room-card-header">
        <div class="room-title-group">
          <span class="building-label">${escapeHtml(buildingName)}</span>
          <h3 class="room-heading">${roomDisplayTitle}</h3>
        </div>
        ${statusBadgeHtml}
      </div>

      <div class="card-meta-row">
        <span class="meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Cap. ${room.capacity || 0}
        </span>
        <span class="meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 4h3a2 2 0 0 1 2 2v14"/>
            <path d="M2 20h20"/>
            <path d="M13 20V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"/>
          </svg>
          ${escapeHtml(room.category || 'Sala de aula')}
        </span>
        ${distanceHtml}
      </div>

      ${projectionHtml}

      <div class="card-footer-row">
        <span class="campus-caption">${escapeHtml(campusName)}</span>
        <button class="btn-open-details" onclick="window.App.showRoomDetails(${room.id})">Ver horários</button>
      </div>
    </article>
  `;
}

function renderRoomsGrid(rooms, buildings, userCoords, isPreview, totalCount) {
  const container = document.getElementById('rooms-grid');
  const countEl = document.getElementById('results-count');
  if (!container) return;

  if (rooms.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        <h3>Nenhuma sala encontrada</h3>
        <p>Não há salas correspondentes aos filtros aplicados.</p>
        <button class="btn-reset-filters" onclick="window.App.resetFilters()">Redefinir filtros</button>
      </div>
    `;
    if (countEl) countEl.textContent = '0 salas encontradas';
    return;
  }

  if (countEl) {
    if (isPreview) {
      countEl.textContent = `Mostrando as 5 salas mais próximas (de ${totalCount} disponíveis)`;
    } else {
      const freeCount = rooms.filter((r) => r.is_free_now).length;
      const occupiedCount = rooms.length - freeCount;
      if (occupiedCount > 0 && freeCount > 0) {
        countEl.textContent = `${rooms.length} salas encontradas (${freeCount} livres · ${occupiedCount} em aula)`;
      } else if (freeCount > 0) {
        countEl.textContent = `${rooms.length} ${rooms.length !== 1 ? 'salas livres encontradas' : 'sala livre encontrada'}`;
      } else {
        countEl.textContent = `${rooms.length} ${rooms.length !== 1 ? 'salas em aula encontradas' : 'sala em aula encontrada'}`;
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

  if (isPreview) {
    container.innerHTML = `
      ${cardsHtml}
      <div class="show-all-banner">
        <span>Exibindo as 5 salas prioritárias para acesso rápido.</span>
        <button class="btn-show-all" onclick="window.App.setShowAll(true)">Ver todas as ${totalCount} salas</button>
      </div>
    `;
  } else {
    container.innerHTML = cardsHtml;
  }
}

window.UI = {
  escapeHtml,
  renderClock,
  renderGpsBanner,
  renderMetrics,
  renderRoomCard,
  renderRoomsGrid
};
