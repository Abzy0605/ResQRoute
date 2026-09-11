import { useEffect, useMemo, useRef, useState } from "react";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";
const ROAD_POLL_INTERVAL_MS = 30000;

const normalizeStatus = (status) => String(status || "").trim().toUpperCase();

const shelterDetails = (shelter) => {
  const capacity = Number(shelter.capacity);
  const occupancy = Number(shelter.current_occupancy ?? 0);
  const remainingCapacity = Number.isFinite(capacity) && Number.isFinite(occupancy)
    ? capacity - occupancy
    : null;
  const hasCoordinates = Number.isFinite(Number(shelter.latitude))
    && Number.isFinite(Number(shelter.longitude))
    && Number(shelter.latitude) >= -90
    && Number(shelter.latitude) <= 90
    && Number(shelter.longitude) >= -180
    && Number(shelter.longitude) <= 180;
  const status = normalizeStatus(shelter.status || "AVAILABLE");

  return {
    remainingCapacity,
    status,
    available: status === "AVAILABLE" && remainingCapacity !== null && remainingCapacity > 0 && hasCoordinates,
  };
};

const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "Not provided";
};

const getLocationError = (error) => {
  if (error?.code === 1) return "Location permission was denied. You can enter coordinates manually.";
  if (error?.code === 3) return "Location request timed out. You can enter coordinates manually.";
  return "Your location is currently unavailable. You can enter coordinates manually.";
};

const getRouteError = (status, body) => {
  if (status === 401) return "Please sign in again before calculating a route.";
  if (status === 403) return "You are not authorized to calculate an evacuation route.";
  if (status === 400) return body.message || "Please check the location details.";
  return "Unable to calculate the evacuation route. Please try again.";
};

function EvacuationWorkflow({ onRouteChange, onShelterChange, onOperationalDataChanged }) {
  const { token } = useAuth();
  const [location, setLocation] = useState({ latitude: "", longitude: "" });
  const [disasters, setDisasters] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [disastersLoading, setDisastersLoading] = useState(true);
  const [sheltersLoading, setSheltersLoading] = useState(true);
  const [disastersError, setDisastersError] = useState("");
  const [sheltersError, setSheltersError] = useState("");
  const [selectedShelterId, setSelectedShelterId] = useState("");
  const [route, setRoute] = useState(null);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState("idle");
  const [monitoringDisabled, setMonitoringDisabled] = useState(false);
  const routeRef = useRef(route);
  const locationRef = useRef(location);
  const selectedShelterRef = useRef(null);
  const rerouteInFlightRef = useRef(false);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    const controller = new AbortController();

    const loadDisasters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/disasters`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Active disasters could not be loaded.");
        const data = await response.json();
        if (!controller.signal.aborted) setDisasters(Array.isArray(data) ? data : []);
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !controller.signal.aborted) {
          setDisasters([]);
          setDisastersError(requestError.message || "Active disasters could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setDisastersLoading(false);
      }
    };

    const loadShelters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/shelters`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Shelters could not be loaded.");
        const data = await response.json();
        if (!controller.signal.aborted) setShelters(Array.isArray(data) ? data : []);
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !controller.signal.aborted) {
          setShelters([]);
          setSheltersError(requestError.message || "Shelters could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setSheltersLoading(false);
      }
    };

    Promise.all([
      Promise.resolve().then(loadDisasters),
      Promise.resolve().then(loadShelters),
    ]);
    return () => controller.abort();
  }, [token]);

  const activeDisasters = useMemo(
    () => disasters.filter((disaster) => normalizeStatus(disaster.status) === "ACTIVE"),
    [disasters]
  );
  const shelterOptions = useMemo(
    () => shelters.map((shelter) => ({ ...shelter, ...shelterDetails(shelter) })),
    [shelters]
  );
  const availableShelterCount = shelterOptions.filter((shelter) => shelter.available).length;
  const selectedShelter = shelterOptions.find((shelter) => String(shelter.id) === selectedShelterId) || null;

  useEffect(() => {
    selectedShelterRef.current = selectedShelter;
  }, [selectedShelter]);

  const updateLocation = (event) => {
    const { name, value } = event.target;
    setLocation((current) => ({ ...current, [name]: value }));
  };

  const useMyLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser. You can enter coordinates manually.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        });
        setLocating(false);
      },
      (geolocationError) => {
        setLocationError(getLocationError(geolocationError));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const selectShelter = (shelter) => {
    if (!shelter.available) return;
    setSelectedShelterId(String(shelter.id));
    setRoute(null);
    setError("");
    setMonitoringStatus("idle");
    onRouteChange(null);
    onShelterChange(shelter);
  };

  const validateRoute = () => {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    if (!location.latitude.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return "Latitude must be a number between -90 and 90.";
    }
    if (!location.longitude.trim() || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return "Longitude must be a number between -180 and 180.";
    }
    if (!selectedShelter) return "Select an available shelter before calculating a route.";
    if (!selectedShelter.available) return "The selected shelter is not currently available for evacuation.";
    return null;
  };

  const calculateRoute = async (event) => {
    event.preventDefault();
    setError("");
    setRoute(null);
    setMonitoringStatus("idle");
    onRouteChange(null);

    const validationError = validateRoute();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      start_latitude: Number(location.latitude),
      start_longitude: Number(location.longitude),
      destination_latitude: Number(selectedShelter.latitude),
      destination_longitude: Number(selectedShelter.longitude),
    };

    setRouting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/routes/calculate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        // Use a safe fallback if the API returns malformed JSON.
      }

      if (!response.ok) throw new Error(getRouteError(response.status, result));
      if (typeof result.route_found !== "boolean") {
        throw new Error("The route service returned an unexpected response. Please try again.");
      }

      setRoute(result);
      onRouteChange(result);
      setMonitoringStatus(result.route_found ? "active" : "idle");
    } catch (requestError) {
      setError(requestError.message || "Unable to calculate the evacuation route. Please try again.");
    } finally {
      setRouting(false);
    }
  };

  const activeRouteRoadIds = useMemo(() => (
    route?.route_found && Array.isArray(route.roads)
      ? route.roads.map((road) => String(road.id)).filter(Boolean)
      : []
  ), [route]);
  const activeRouteRoadKey = activeRouteRoadIds.join(",");
  const activeRouteRoadCount = activeRouteRoadIds.length;

  useEffect(() => {
    if (!token || monitoringDisabled || activeRouteRoadCount === 0) {
      return undefined;
    }

    const controller = new AbortController();

    const checkRouteRoads = async () => {
      if (rerouteInFlightRef.current || controller.signal.aborted) return;

      const currentRoute = routeRef.current;
      const currentShelter = selectedShelterRef.current;
      const currentLocation = locationRef.current;

      if (!currentRoute?.route_found || !Array.isArray(currentRoute.roads) || currentRoute.roads.length === 0 || !currentShelter) {
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/roads/route-status`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) {
            setMonitoringDisabled(true);
            setMonitoringStatus("disabled");
          }
          return;
        }

        if (!response.ok) throw new Error("Road monitoring request failed");

        const roads = await response.json();
        if (!Array.isArray(roads)) throw new Error("Road monitoring response was invalid");

        const statusByRoadId = new Map(
          roads.map((road) => [String(road.id), normalizeStatus(road.status)])
        );
        const blockedRoad = currentRoute.roads.find(
          (road) => statusByRoadId.get(String(road.id)) === "BLOCKED"
        );

        if (!blockedRoad || rerouteInFlightRef.current || controller.signal.aborted) {
          setMonitoringStatus((currentStatus) => (
            currentStatus === "warning" ? "active" : currentStatus
          ));
          return;
        }

        const startLatitude = Number(currentLocation.latitude);
        const startLongitude = Number(currentLocation.longitude);
        const destinationLatitude = Number(currentShelter.latitude);
        const destinationLongitude = Number(currentShelter.longitude);

        if (![startLatitude, startLongitude, destinationLatitude, destinationLongitude].every(Number.isFinite)) {
          throw new Error("Saved route coordinates are unavailable");
        }

        rerouteInFlightRef.current = true;
        setMonitoringStatus("rerouting");

        const rerouteResponse = await fetch(`${API_BASE_URL}/api/routes/calculate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start_latitude: startLatitude,
            start_longitude: startLongitude,
            destination_latitude: destinationLatitude,
            destination_longitude: destinationLongitude,
          }),
          signal: controller.signal,
        });

        let rerouteResult = {};
        try {
          rerouteResult = await rerouteResponse.json();
        } catch {
          // Keep user-facing monitoring feedback generic if the response is malformed.
        }

        if (!rerouteResponse.ok) {
          if (rerouteResponse.status === 401 || rerouteResponse.status === 403) {
            setMonitoringDisabled(true);
            setMonitoringStatus("disabled");
          } else {
            setMonitoringStatus("warning");
          }
          return;
        }

        if (typeof rerouteResult.route_found !== "boolean") {
          setMonitoringStatus("warning");
          return;
        }

        setRoute(rerouteResult);
        onRouteChange(rerouteResult);
        onOperationalDataChanged();
        setMonitoringStatus(rerouteResult.route_found ? "updated" : "no-alternative");
      } catch (requestError) {
        if (requestError.name !== "AbortError" && !controller.signal.aborted) {
          setMonitoringStatus("warning");
        }
      } finally {
        rerouteInFlightRef.current = false;
      }
    };

    checkRouteRoads();
    const intervalId = window.setInterval(checkRouteRoads, ROAD_POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [activeRouteRoadCount, activeRouteRoadKey, monitoringDisabled, onOperationalDataChanged, onRouteChange, token]);

  const blockedRoadCount = Array.isArray(route?.blocked_roads) ? route.blocked_roads.length : 0;

  return (
    <section className="evacuation-workflow" aria-label="Citizen evacuation workflow">
      <div className="route-controls-header">
        <div><p className="eyebrow">Evacuation workflow</p><h2>Plan your evacuation</h2></div>
        <p>Choose an available shelter and request a route across the current road network.</p>
      </div>

      <section className="evacuation-step" aria-label="Active disaster context">
        <h3>1. Emergency context</h3>
        {disastersLoading && <p className="muted-text">Loading disaster context...</p>}
        {disastersError && <p className="route-error" role="alert">{disastersError}</p>}
        {!disastersLoading && !disastersError && activeDisasters.length === 0 && <p className="muted-text">There are no active disasters currently listed. Review local guidance before deciding whether to evacuate.</p>}
        {activeDisasters.length > 0 && (
          <div className="active-disaster-list">
            {activeDisasters.map((disaster) => <span key={disaster.id}>{disaster.type} · Severity {disaster.severity} · {disaster.status}</span>)}
          </div>
        )}
      </section>

      <form onSubmit={calculateRoute}>
        <section className="evacuation-step" aria-label="Citizen location">
          <h3>2. Your location</h3>
          <div className="evacuation-location-grid">
            <label>Latitude<input name="latitude" type="number" inputMode="decimal" step="any" value={location.latitude} onChange={updateLocation} disabled={routing} /></label>
            <label>Longitude<input name="longitude" type="number" inputMode="decimal" step="any" value={location.longitude} onChange={updateLocation} disabled={routing} /></label>
          </div>
          <button type="button" className="button-secondary" onClick={useMyLocation} disabled={routing || locating}>{locating ? "Getting location..." : "Use My Location"}</button>
          {locationError && <p className="route-error" role="alert">{locationError}</p>}
        </section>

        <section className="evacuation-step" aria-label="Shelter selection">
          <h3>3. Select a shelter</h3>
          {sheltersLoading && <p className="muted-text">Loading shelters...</p>}
          {sheltersError && <p className="route-error" role="alert">{sheltersError}</p>}
          {!sheltersLoading && !sheltersError && shelterOptions.length === 0 && <p className="muted-text">No shelters are currently listed.</p>}
          {!sheltersLoading && !sheltersError && shelterOptions.length > 0 && availableShelterCount === 0 && <p className="muted-text">No shelters are currently available with remaining capacity.</p>}
          {!sheltersLoading && !sheltersError && shelterOptions.length > 0 && (
            <div className="shelter-selection-grid">
              {shelterOptions.map((shelter) => (
                <article className={`evacuation-shelter-card ${String(shelter.id) === selectedShelterId ? "selected" : ""} ${shelter.available ? "available" : "unavailable"}`} key={shelter.id}>
                  <div><strong>{shelter.name || "Shelter"}</strong><span>{shelter.address || "Address not provided"}</span></div>
                  <div><span>Location: {formatCoordinate(shelter.latitude)}, {formatCoordinate(shelter.longitude)}</span><span>Capacity: {shelter.capacity ?? "Not provided"}</span><span>Occupied: {shelter.current_occupancy ?? 0}</span><span>Remaining: {shelter.remainingCapacity ?? "Unavailable"}</span><span>Status: {shelter.status || "Not provided"}</span></div>
                  <button type="button" onClick={() => selectShelter(shelter)} disabled={!shelter.available || routing}>
                    {String(shelter.id) === selectedShelterId ? "Selected" : shelter.available ? "Select Shelter" : shelter.status === "FULL" ? "Full" : shelter.status === "CLOSED" ? "Closed" : "Unavailable"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="evacuation-step evacuation-route-action" aria-label="Route calculation">
          <h3>4. Calculate evacuation route</h3>
          <p>Routes exclude roads currently marked BLOCKED and use the backend's road-risk-aware route cost.</p>
          <button type="submit" disabled={routing}>{routing ? "Calculating route..." : "Calculate Evacuation Route"}</button>
        </section>
      </form>

      {error && <p className="route-error" role="alert">{error}</p>}

      {route?.route_found && monitoringStatus === "active" && (
        <p className="route-monitoring-status" role="status">Monitoring route for road changes.</p>
      )}
      {monitoringStatus === "rerouting" && (
        <p className="route-monitoring-status rerouting" role="status">Road blocked — recalculating route...</p>
      )}
      {monitoringStatus === "updated" && route?.route_found && (
        <p className="route-monitoring-status updated" role="status"><strong>Route changed.</strong> A road on your route is now blocked. A new route has been calculated.</p>
      )}
      {monitoringStatus === "no-alternative" && (
        <p className="route-monitoring-status unavailable" role="alert">No alternative route is currently available because the road network is blocked or disconnected.</p>
      )}
      {monitoringStatus === "warning" && (
        <p className="route-monitoring-status warning" role="status">Unable to check road status right now. Your current route has not been changed.</p>
      )}
      {monitoringStatus === "disabled" && (
        <p className="route-monitoring-status unavailable" role="alert">Route monitoring stopped because your session is no longer authorized. Please sign in again.</p>
      )}

      {route && !route.route_found && (
        <section className="evacuation-result no-route" aria-label="Evacuation route result">
          <h3>No calculated route</h3>
          <p>No route could be calculated to this shelter with the currently available roads.</p>
          {blockedRoadCount > 0 && <p>{blockedRoadCount} blocked road{blockedRoadCount === 1 ? " was" : "s were"} excluded from routing.</p>}
        </section>
      )}

      {route?.route_found && selectedShelter && (
        <section className="evacuation-result" aria-label="Evacuation route result">
          <div className="section-heading"><div><p className="eyebrow">Evacuation route</p><h3>Calculated route to {selectedShelter.name}</h3></div><span>{route.risk_level || "Route risk information"}</span></div>
          <div className="evacuation-summary-grid">
            <div><span>From</span><strong>Citizen location</strong><small>{formatCoordinate(location.latitude)}, {formatCoordinate(location.longitude)}</small></div>
            <div><span>To</span><strong>{selectedShelter.name}</strong><small>Remaining capacity: {selectedShelter.remainingCapacity}</small></div>
            <div><span>Distance</span><strong>{route.total_distance_km ?? "Not available"} km</strong><small>{route.number_of_roads ?? "Not available"} roads</small></div>
            <div><span>Route risk</span><strong>Maximum {route.maximum_risk_level ?? "Not available"}</strong><small>Average {route.average_risk_level ?? "Not available"}</small></div>
            <div><span>Route cost</span><strong>{route.total_cost ?? "Not available"}</strong><small>Backend risk-aware cost</small></div>
            <div><span>Blocked roads</span><strong>{blockedRoadCount}</strong><small>Excluded from routing</small></div>
          </div>
          {(Number(route.maximum_risk_level) > 0 || blockedRoadCount > 0) && <p className="route-risk-notice">Route risk information is available: maximum road risk is {route.maximum_risk_level ?? "not available"}, and {blockedRoadCount} blocked road{blockedRoadCount === 1 ? " was" : "s were"} excluded. Conditions can change; follow emergency guidance.</p>}
        </section>
      )}
    </section>
  );
}

export default EvacuationWorkflow;
