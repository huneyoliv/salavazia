"""Unit tests for building geographic coordinates and reference integrity."""

import json
import math
from pathlib import Path


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in meters using Haversine."""
    radius_earth_meters = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius_earth_meters * c


def test_buildings_json_schema_and_bounds() -> None:
    buildings_path = Path("data/buildings.json")
    assert buildings_path.exists(), "data/buildings.json must exist"

    with open(buildings_path, encoding="utf-8") as f:
        buildings = json.load(f)

    assert len(buildings) >= 26, "Expected at least 26 mapped buildings"

    valid_campi = {"São Cristóvão", "Itabaiana", "Aracaju"}

    for key, data in buildings.items():
        assert isinstance(key, str) and key.strip(), f"Invalid key: {key}"
        assert "name" in data and isinstance(data["name"], str) and data["name"].strip()
        campus = data.get("campus")
        assert "campus" in data and campus in valid_campi, f"Invalid campus in {key}: {campus}"
        assert "lat" in data and isinstance(data["lat"], (int, float))
        assert "lng" in data and isinstance(data["lng"], (int, float))
        assert "description" in data and isinstance(data["description"], str)

        lat = data["lat"]
        lng = data["lng"]
        # Coordinate bounds for Sergipe state
        assert -11.5 <= lat <= -9.5, f"Latitude out of Sergipe bounds for {key}: {lat}"
        assert -38.5 <= lng <= -36.5, f"Longitude out of Sergipe bounds for {key}: {lng}"


def test_referential_integrity_with_rooms() -> None:
    rooms_path = Path("data/rooms.json")
    buildings_path = Path("data/buildings.json")

    assert rooms_path.exists(), "data/rooms.json must exist"
    assert buildings_path.exists(), "data/buildings.json must exist"

    with open(rooms_path, encoding="utf-8") as f:
        rooms = json.load(f)

    with open(buildings_path, encoding="utf-8") as f:
        buildings = json.load(f)

    # Active scheduled rooms must have valid coordinates mapped
    active_rooms = [r for r in rooms if r.get("has_schedule")]
    assert len(active_rooms) > 0, "Expected active rooms in catalog"

    missing_buildings: set[str] = set()
    for room in active_rooms:
        building = room.get("building")
        if not building or building not in buildings:
            missing_buildings.add(str(building))

    assert not missing_buildings, f"Rooms refer to unmapped buildings: {missing_buildings}"


def test_haversine_distance_ranking() -> None:
    buildings_path = Path("data/buildings.json")
    with open(buildings_path, encoding="utf-8") as f:
        buildings = json.load(f)

    # Standing right in front of Didática 5
    user_lat = -10.924967
    user_lng = -37.1040998

    distances = {
        name: haversine_distance_meters(user_lat, user_lng, b["lat"], b["lng"])
        for name, b in buildings.items()
    }

    # Proximity sanity checks
    assert distances["DID 5"] < 1.0, "Distance to self should be approx 0 meters"
    assert distances["DID 6"] < 150.0, "Didática 6 should be less than 150m from Didática 5"
    assert distances["DID 1"] < 250.0, "Didática 1 should be within 250m of Didática 5"
    assert distances["BLOCO C"] > 30000.0, "Itabaiana campus should be > 30km away"
    assert distances["SALA DO CULTART"] > 5000.0, "Cultart (Aracaju) should be > 5km away"
