const legendItems = [
  { className: "legend-disaster", label: "Disaster" },
  { className: "legend-incident", label: "SOS incident" },
  { className: "legend-shelter", label: "Shelter" },
  { className: "legend-team", label: "Rescue team" },
  { className: "legend-road-open", label: "Open road" },
  { className: "legend-road-blocked", label: "Blocked road" },
  { className: "legend-risk-low", label: "Low risk zone" },
  { className: "legend-risk-moderate", label: "Moderate risk zone" },
  { className: "legend-risk-high", label: "High risk zone" },
  { className: "legend-risk-critical", label: "Critical risk zone" },
];

function MapLegend() {
  return (
    <aside className="map-legend" aria-label="Map legend">
      <strong>Map layers</strong>
      <div className="legend-items">
        {legendItems.map((item) => (
          <span className="legend-item" key={item.label}>
            <span className={`legend-swatch ${item.className}`} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </aside>
  );
}

export default MapLegend;
