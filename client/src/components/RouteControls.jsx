import { useState } from "react";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";

const initialCoordinates = {
  start_latitude: "",
  start_longitude: "",
  destination_latitude: "",
  destination_longitude: "",
};

const fields = [
  { name: "start_latitude", label: "Start latitude", step: "any" },
  { name: "start_longitude", label: "Start longitude", step: "any" },
  { name: "destination_latitude", label: "Destination latitude", step: "any" },
  { name: "destination_longitude", label: "Destination longitude", step: "any" },
];

const validateCoordinates = (values) => {
  for (const field of fields) {
    const value = values[field.name].trim();

    if (!value) {
      return `${field.label} is required.`;
    }

    if (!Number.isFinite(Number(value))) {
      return `${field.label} must be numeric.`;
    }
  }

  const latitudeFields = ["start_latitude", "destination_latitude"];
  const longitudeFields = ["start_longitude", "destination_longitude"];

  if (latitudeFields.some((field) => Math.abs(Number(values[field])) > 90)) {
    return "Latitude must be between -90 and 90.";
  }

  if (longitudeFields.some((field) => Math.abs(Number(values[field])) > 180)) {
    return "Longitude must be between -180 and 180.";
  }

  return null;
};

const getRequestError = (status) => {
  if (status === 401) {
    return "Please sign in to calculate an evacuation route.";
  }

  if (status === 403) {
    return "Access denied.";
  }

  if (status === 404) {
    return "No evacuation route is currently available.";
  }

  return "Unable to calculate the evacuation route. Please try again.";
};

function RouteSummary({ route }) {
  if (!route) {
    return null;
  }

  if (!route.route_found) {
    return <p className="route-message">No evacuation route is currently available.</p>;
  }

  const metrics = [
    ["Distance", route.total_distance_km, " km"],
    ["Route cost", route.total_cost, ""],
    ["Maximum road risk", route.maximum_risk_level, ""],
    ["Average road risk", route.average_risk_level, ""],
    ["Roads", route.number_of_roads, ""],
    ["Blocked roads avoided", Array.isArray(route.blocked_roads) ? route.blocked_roads.length : null, ""],
  ];

  return (
    <div className="route-summary">
      <strong>Evacuation route found</strong>
      <dl>
        {metrics.map(([label, value, suffix]) => (
          value === null || value === undefined ? null : (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}{suffix}</dd>
            </div>
          )
        ))}
      </dl>
    </div>
  );
}

function RouteControls({ onRouteChange }) {
  const { token } = useAuth();
  const [values, setValues] = useState(initialCoordinates);
  const [route, setRoute] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateValue = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const clearRoute = () => {
    setRoute(null);
    setError("");
    onRouteChange(null);
  };

  const calculateRoute = async (event) => {
    event.preventDefault();
    setError("");

    const validationError = validateCoordinates(values);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!token) {
      setError("Please sign in to calculate an evacuation route.");
      return;
    }

    const payload = Object.fromEntries(
      fields.map((field) => [field.name, Number(values[field.name])])
    );

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/routes/calculate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(getRequestError(response.status));
      }

      const result = await response.json();
      setRoute(result);
      onRouteChange(result);

      if (!result.route_found) {
        setError("No evacuation route is currently available.");
      }
    } catch (requestError) {
      setRoute(null);
      onRouteChange(null);
      setError(requestError.message || "Unable to calculate the evacuation route. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="route-controls" aria-label="Evacuation route controls">
      <div className="route-controls-header">
        <div>
          <p className="eyebrow">Routing engine</p>
          <h2>Plan an evacuation route</h2>
        </div>
        <p>Use road-network coordinates to request a risk-aware route.</p>
      </div>

      <form onSubmit={calculateRoute}>
        <div className="coordinate-grid">
          {fields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                name={field.name}
                type="number"
                inputMode="decimal"
                step={field.step}
                value={values[field.name]}
                onChange={updateValue}
              />
            </label>
          ))}
        </div>
        <div className="route-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Calculating route..." : "Calculate Evacuation Route"}
          </button>
          <button type="button" className="button-secondary" onClick={clearRoute} disabled={loading}>
            Clear Route
          </button>
        </div>
      </form>

      {error && <p className="route-error" role="alert">{error}</p>}
      <RouteSummary route={route} />
    </section>
  );
}

export default RouteControls;
