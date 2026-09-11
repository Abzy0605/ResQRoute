import { useEffect, useMemo } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";
import { MAP_ICONS } from "./mapIcons";

const ROUTE_COLOR = "#0f766e";

const toCoordinates = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return [latitude, longitude];
};

function RouteLayer({ route }) {
  const map = useMap();

  const routePositions = useMemo(() => {
    const routeNodes = route?.route_nodes || [];
    const mappedRoutePositions = routeNodes.map(toCoordinates);

    return mappedRoutePositions.every((position) => position !== null)
      ? mappedRoutePositions
      : [];
  }, [route]);
  const startPosition = toCoordinates(route?.start_coordinates);
  const destinationPosition = toCoordinates(route?.destination_coordinates);

  useEffect(() => {
    if (routePositions.length > 1) {
      map.fitBounds(routePositions, {
        padding: [30, 30],
        maxZoom: 13,
      });
    }
  }, [map, routePositions]);

  if (!route?.route_found) {
    return null;
  }

  return (
    <>
      {routePositions.length > 1 && (
        <Polyline
          positions={routePositions}
          pathOptions={{
            color: ROUTE_COLOR,
            opacity: 0.95,
            weight: 8,
          }}
        >
          <Popup>
            <div className="map-popup">
              <strong>Evacuation route</strong>
              <span>Distance: {route.total_distance_km} km</span>
              <span>Roads: {route.number_of_roads}</span>
            </div>
          </Popup>
        </Polyline>
      )}

      {startPosition && (
        <Marker position={startPosition} icon={MAP_ICONS["route-start"]} title="Evacuation start">
          <Popup>
            <strong>Evacuation Start</strong>
          </Popup>
        </Marker>
      )}

      {destinationPosition && (
        <Marker position={destinationPosition} icon={MAP_ICONS["route-destination"]} title="Evacuation destination">
          <Popup>
            <strong>Evacuation Destination</strong>
          </Popup>
        </Marker>
      )}
    </>
  );
}

export default RouteLayer;
