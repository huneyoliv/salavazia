/**
 * Geographic calculation and Geolocation API wrapper
 */

const EARTH_RADIUS_METERS = 6371000.0;

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180.0;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const phi1 = degreesToRadians(lat1);
  const phi2 = degreesToRadians(lat2);
  const deltaPhi = degreesToRadians(lat2 - lat1);
  const deltaLambda = degreesToRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) ** 2;

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return EARTH_RADIUS_METERS * c;
}

function formatDistance(meters) {
  if (meters === null || meters === undefined || isNaN(meters)) {
    return null;
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não é suportada pelo seu navegador'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        let msg = 'Erro ao obter localização';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Permissão de GPS negada';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Sinal de GPS indisponível';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Tempo limite de busca esgotado';
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  });
}

function findNearestBuilding(userCoords, buildings) {
  if (!userCoords || !buildings) return null;

  let nearestKey = null;
  let minDistance = Infinity;

  for (const [key, bldg] of Object.entries(buildings)) {
    if (typeof bldg.lat === 'number' && typeof bldg.lng === 'number') {
      const dist = haversineDistance(userCoords.lat, userCoords.lng, bldg.lat, bldg.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestKey = key;
      }
    }
  }

  if (!nearestKey) return null;

  return {
    key: nearestKey,
    building: buildings[nearestKey],
    distanceMeters: minDistance,
    distanceFormatted: formatDistance(minDistance)
  };
}

window.GeoEngine = {
  haversineDistance,
  formatDistance,
  getUserLocation,
  findNearestBuilding
};
