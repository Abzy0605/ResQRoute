import { useEffect, useState } from "react";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";
import { MAP_ICONS } from "./mapIcons";
import {
  Circle,
  LayerGroup,
  LayersControl,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";
const ENDPOINTS = {
  disasters: "/api/disasters",
  incidents: "/api/incidents",
  shelters: "/api/shelters",
  rescueTeams: "/api/rescue-teams",
  roads: "/api/roads",
  riskZones: "/api/risk-zones",
};

const RISK_ZONE_COLORS = {
  LOW: "#15803d",
  MODERATE: "#ca8a04",
  HIGH: "#ea580c",
  CRITICAL: "#b91c1c",
};

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const coordinates = (latitude, longitude) => {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);

  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return [lat, lng];
};

const formatValue = (value, fallback = "Not provided") => (
  value === null || value === undefined || value === "" ? fallback : value
);

const normalizeStatus = (status) => String(status || "OPEN").toUpperCase();

const loadMapData = async (token, signal, endpoints = ENDPOINTS) => {
  const entries = Object.entries(endpoints);
  const results = await Promise.all(entries.map(async ([layer, endpoint]) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }

      const records = await response.json();

      if (!Array.isArray(records)) {
        throw new Error("API response was not an array");
      }

      return { data: records, error: null, layer };
    } catch (error) {
      if (error.name === "AbortError") {
        return { data: [], error: null, layer };
      }

      console.error(`Failed to load ${layer} map data:`, error);
      return { data: [], error, layer };
    }
  }));

  return results.reduce((loaded, result) => {
    loaded.data[result.layer] = result.data;

    if (result.error) {
      loaded.errors.push(result.layer);
    }

    return loaded;
  }, { data: {}, errors: [] });
};

function DisasterMarkers({ disasters }) {
  return disasters.map((disaster) => {
    const position = coordinates(disaster.latitude, disaster.longitude);

    if (!position) {
      return null;
    }

    return (
      <Marker key={disaster.id} position={position} icon={MAP_ICONS.disaster} title="Disaster">
        <Popup>
          <div className="map-popup">
            <strong>{formatValue(disaster.type, "Disaster")}</strong>
            <span>Severity: {formatValue(disaster.severity)}</span>
            <span>Status: {formatValue(disaster.status)}</span>
            <span>{formatValue(disaster.description)}</span>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function ShelterMarkers({ shelters, selectedShelterId }) {
  return shelters.map((shelter) => {
    const position = coordinates(shelter.latitude, shelter.longitude);

    if (!position) {
      return null;
    }

    const capacity = toNumber(shelter.capacity);
    const occupancy = toNumber(shelter.current_occupancy) ?? 0;
    const remaining = capacity === null ? null : capacity - occupancy;

    const selected = String(shelter.id) === String(selectedShelterId);

    return (
      <LayerGroup key={shelter.id}>
        {selected && <Circle center={position} radius={180} pathOptions={{ color: "#0f766e", fillOpacity: 0.08, weight: 3 }} />}
        <Marker
          position={position}
          icon={selected ? MAP_ICONS["selected-shelter"] : MAP_ICONS.shelter}
          title={selected ? "Selected evacuation shelter" : shelter.name}
        >
          <Popup>
            <div className="map-popup">
              <strong>{formatValue(shelter.name, "Shelter")}</strong>
              {selected && <span>Selected evacuation destination</span>}
              <span>Address: {formatValue(shelter.address)}</span>
              <span>Capacity: {formatValue(shelter.capacity)}</span>
              <span>Current occupancy: {formatValue(shelter.current_occupancy, "0")}</span>
              <span>Remaining capacity: {formatValue(remaining)}</span>
              <span>Status: {formatValue(shelter.status)}</span>
            </div>
          </Popup>
        </Marker>
      </LayerGroup>
    );
  });
}

function RescueTeamMarkers({ rescueTeams }) {
  return rescueTeams.map((team) => {
    const position = coordinates(team.latitude, team.longitude);

    if (!position) {
      return null;
    }

    return (
      <Marker key={team.id} position={position} icon={MAP_ICONS["rescue-team"]} title={team.name}>
        <Popup>
          <div className="map-popup">
            <strong>{formatValue(team.name, "Rescue team")}</strong>
            <span>Status: {formatValue(team.status)}</span>
            <span>Contact: {formatValue(team.contact_number)}</span>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function IncidentMarkers({ incidents }) {
  return incidents.map((incident) => {
    const position = coordinates(incident.latitude, incident.longitude);

    if (!position) {
      return null;
    }

    return (
      <Marker key={incident.id} position={position} icon={MAP_ICONS.incident} title="SOS incident">
        <Popup>
          <div className="map-popup">
            <strong>SOS incident #{incident.id}</strong>
            <span>Severity: {formatValue(incident.severity)}</span>
            <span>Status: {formatValue(incident.status)}</span>
            <span>{formatValue(incident.description)}</span>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function RoadLines({ roads }) {
  return roads.map((road) => {
    const start = coordinates(road.start_latitude, road.start_longitude);
    const end = coordinates(road.end_latitude, road.end_longitude);

    if (!start || !end) {
      return null;
    }

    const blocked = normalizeStatus(road.status) === "BLOCKED";

    return (
      <Polyline
        key={road.id}
        positions={[start, end]}
        pathOptions={{
          color: blocked ? "#b91c1c" : "#166534",
          dashArray: blocked ? "8 8" : undefined,
          opacity: blocked ? 0.95 : 0.8,
          weight: blocked ? 5 : 4,
        }}
      >
        <Popup>
          <div className="map-popup">
            <strong>{formatValue(road.road_name, "Road")}</strong>
            <span>Distance: {formatValue(road.distance_km)} km</span>
            <span>Risk level: {formatValue(road.risk_level)}</span>
            <span>Status: {formatValue(road.status)}</span>
          </div>
        </Popup>
      </Polyline>
    );
  });
}

function RiskZoneCircles({ riskZones }) {
  return riskZones.map((zone) => {
    const center = coordinates(zone.center_latitude, zone.center_longitude);
    const radiusKm = toNumber(zone.radius_km);

    if (!center || radiusKm === null || radiusKm < 0) {
      return null;
    }

    const riskLevel = normalizeStatus(zone.risk_level);
    const color = RISK_ZONE_COLORS[riskLevel] || "#475569";

    return (
      <Circle
        key={zone.id}
        center={center}
        radius={radiusKm * 1000}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: 0.18,
          weight: 2,
        }}
      >
        <Popup>
          <div className="map-popup">
            <strong>{formatValue(zone.zone_name, "Risk zone")}</strong>
            <span>Risk score: {formatValue(zone.risk_score)}</span>
            <span>Risk level: {formatValue(zone.risk_level)}</span>
            {zone.disaster_type && <span>Disaster: {zone.disaster_type}</span>}
          </div>
        </Popup>
      </Circle>
    );
  });
}

function MapLayers({ onStatusChange, refreshKey = 0, selectedShelterId = null }) {
  const { token, currentUser } = useAuth();
  const [data, setData] = useState({
    disasters: [],
    incidents: [],
    shelters: [],
    rescueTeams: [],
    roads: [],
    riskZones: [],
  });

  useEffect(() => {
    if (!token) {
      onStatusChange({
        loading: false,
        message: "Sign in to view operational map layers.",
        errors: [],
      });
      return undefined;
    }

    const controller = new AbortController();
    onStatusChange({ loading: true, message: "Loading operational layers...", errors: [] });

    const endpoints = currentUser?.role === "ADMIN"
      ? ENDPOINTS
      : { disasters: ENDPOINTS.disasters, shelters: ENDPOINTS.shelters };
    loadMapData(token, controller.signal, endpoints).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      setData({
        disasters: result.data.disasters || [],
        incidents: result.data.incidents || [],
        shelters: result.data.shelters || [],
        rescueTeams: result.data.rescueTeams || [],
        roads: result.data.roads || [],
        riskZones: result.data.riskZones || [],
      });
      onStatusChange({
        loading: false,
        message: result.errors.length > 0
          ? "Some operational layers could not be loaded."
          : "Operational layers loaded.",
        errors: result.errors,
      });
    });

    return () => controller.abort();
  }, [currentUser?.role, onStatusChange, refreshKey, token]);

  return (
    <LayersControl position="topright">
      <LayersControl.Overlay checked name="Disasters">
        <LayerGroup>
          <DisasterMarkers disasters={data.disasters} />
        </LayerGroup>
      </LayersControl.Overlay>
      {currentUser?.role === "ADMIN" && (
        <LayersControl.Overlay checked name="SOS Incidents">
          <LayerGroup>
            <IncidentMarkers incidents={data.incidents} />
          </LayerGroup>
        </LayersControl.Overlay>
      )}
      <LayersControl.Overlay checked name="Shelters">
        <LayerGroup>
          <ShelterMarkers shelters={data.shelters} selectedShelterId={selectedShelterId} />
        </LayerGroup>
      </LayersControl.Overlay>
      <LayersControl.Overlay checked name="Rescue Teams">
        <LayerGroup>
          <RescueTeamMarkers rescueTeams={data.rescueTeams} />
        </LayerGroup>
      </LayersControl.Overlay>
      <LayersControl.Overlay checked name="Roads">
        <LayerGroup>
          <RoadLines roads={data.roads} />
        </LayerGroup>
      </LayersControl.Overlay>
      <LayersControl.Overlay checked name="Risk Zones">
        <LayerGroup>
          <RiskZoneCircles riskZones={data.riskZones} />
        </LayerGroup>
      </LayersControl.Overlay>
    </LayersControl>
  );
}

export default MapLayers;
