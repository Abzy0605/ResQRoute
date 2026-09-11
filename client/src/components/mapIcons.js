import L from "leaflet";

const MARKER_DETAILS = {
  disaster: { label: "!", name: "Disaster" },
  shelter: { label: "+", name: "Shelter" },
  "selected-shelter": { label: "+", name: "Selected shelter" },
  "rescue-team": { label: "R", name: "Rescue team" },
  incident: { label: "SOS", name: "Incident" },
  "route-start": { label: "A", name: "Evacuation start" },
  "route-destination": { label: "B", name: "Evacuation destination" },
};

export const createMapIcon = (type) => {
  const marker = MARKER_DETAILS[type];

  if (!marker) {
    throw new Error(`Unknown map marker type: ${type}`);
  }

  return L.divIcon({
    className: "resq-map-div-icon",
    html: `<span class="resq-map-marker resq-map-marker--${type}" aria-label="${marker.name}"><span class="resq-map-marker__label">${marker.label}</span></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
};

export const MAP_ICONS = Object.fromEntries(
  Object.keys(MARKER_DETAILS).map((type) => [type, createMapIcon(type)]),
);
