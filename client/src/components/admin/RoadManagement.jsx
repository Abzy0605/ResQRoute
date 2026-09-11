import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const ROAD_STATUSES = ["OPEN", "BLOCKED"];
const EMPTY_FORM = {
  road_name: "",
  start_latitude: "",
  start_longitude: "",
  end_latitude: "",
  end_longitude: "",
  distance_km: "",
  risk_level: "",
  status: "OPEN",
};

const toFormValues = (road) => ({
  road_name: road.road_name ?? "",
  start_latitude: road.start_latitude ?? "",
  start_longitude: road.start_longitude ?? "",
  end_latitude: road.end_latitude ?? "",
  end_longitude: road.end_longitude ?? "",
  distance_km: road.distance_km ?? "",
  risk_level: road.risk_level ?? "",
  status: road.status || "OPEN",
});

const validateForm = (values) => {
  if (!values.road_name.trim()) {
    return "Road name is required.";
  }

  const coordinates = [
    [values.start_latitude, "Start latitude", -90, 90],
    [values.start_longitude, "Start longitude", -180, 180],
    [values.end_latitude, "End latitude", -90, 90],
    [values.end_longitude, "End longitude", -180, 180],
  ];

  for (const [value, label, minimum, maximum] of coordinates) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      return `${label} must be between ${minimum} and ${maximum}.`;
    }
  }

  const distance = Number(values.distance_km);
  if (!Number.isFinite(distance) || distance <= 0) {
    return "Distance must be greater than 0.";
  }

  const riskLevel = Number(values.risk_level);
  if (!Number.isInteger(riskLevel) || riskLevel < 1 || riskLevel > 10) {
    return "Risk level must be an integer between 1 and 10.";
  }

  if (!ROAD_STATUSES.includes(values.status)) {
    return "Select a valid road status.";
  }

  return null;
};

const toPayload = (values) => ({
  road_name: values.road_name.trim(),
  start_latitude: Number(values.start_latitude),
  start_longitude: Number(values.start_longitude),
  end_latitude: Number(values.end_latitude),
  end_longitude: Number(values.end_longitude),
  distance_km: Number(values.distance_km),
  risk_level: Number(values.risk_level),
  status: values.status,
});

const errorMessage = (status, fallback) => {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You are not authorized to manage roads.";
  if (status === 400) return fallback || "Please check the road details.";
  return "Unable to update roads. Please try again.";
};

const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "Not provided";
};

function RoadManagement({ onChanged }) {
  const { token, currentUser } = useAuth();
  const [roads, setRoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadRoads = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/roads`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error(errorMessage(response.status));
      const data = await response.json();
      setRoads(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to update roads. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return undefined;
    const controller = new AbortController();
    Promise.resolve().then(() => loadRoads(controller.signal));
    return () => controller.abort();
  }, [currentUser?.role, loadRoads]);

  const readError = async (response) => {
    try {
      return (await response.json()).message;
    } catch {
      return undefined;
    }
  };

  const refreshAfterChange = async (message) => {
    setFeedback(message);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await loadRoads();
    onChanged();
  };

  const submitForm = async (event, isEdit = false) => {
    event.preventDefault();
    setError("");
    setFeedback("");
    const values = isEdit ? editingForm : form;
    const validationError = validateForm(values);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const endpoint = isEdit
        ? `${API_BASE_URL}/api/roads/${editingId}`
        : `${API_BASE_URL}/api/roads`;
      const response = await fetch(endpoint, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toPayload(values)),
      });

      if (!response.ok) {
        throw new Error(errorMessage(response.status, await readError(response)));
      }

      await refreshAfterChange(isEdit ? "Road updated successfully." : "Road created successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update roads. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRoad = async (road) => {
    if (!window.confirm("Delete this road?")) return;
    setError("");
    setFeedback("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/roads/${road.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(errorMessage(response.status, await readError(response)));
      }

      await refreshAfterChange("Road deleted successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update roads. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };

  if (currentUser?.role !== "ADMIN") return null;

  const formFields = (values, setter) => (
    <div className="road-form-grid">
      <label>Road name<input name="road_name" value={values.road_name} onChange={updateForm(setter)} /></label>
      <label>Start latitude<input name="start_latitude" type="number" step="any" value={values.start_latitude} onChange={updateForm(setter)} /></label>
      <label>Start longitude<input name="start_longitude" type="number" step="any" value={values.start_longitude} onChange={updateForm(setter)} /></label>
      <label>End latitude<input name="end_latitude" type="number" step="any" value={values.end_latitude} onChange={updateForm(setter)} /></label>
      <label>End longitude<input name="end_longitude" type="number" step="any" value={values.end_longitude} onChange={updateForm(setter)} /></label>
      <label>Distance (km)<input name="distance_km" type="number" min="0" step="any" value={values.distance_km} onChange={updateForm(setter)} /></label>
      <label>Risk level<input name="risk_level" type="number" min="1" max="10" step="1" value={values.risk_level} onChange={updateForm(setter)} /></label>
      <label>Status<select name="status" value={values.status} onChange={updateForm(setter)}>{ROAD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    </div>
  );

  return (
    <section className="road-management" aria-label="Road management">
      <div className="section-heading">
        <div><p className="eyebrow">Admin controls</p><h2>Road management</h2></div>
        <span>{loading ? "Loading..." : `${roads.length} records`}</span>
      </div>

      <form className="road-form" onSubmit={(event) => submitForm(event)}>
        <h3>Create road</h3>
        {formFields(form, setForm)}
        <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Road"}</button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}

      {editingId && (
        <form className="road-form edit-form" onSubmit={(event) => submitForm(event, true)}>
          <div className="section-heading"><h3>Edit road</h3><button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button></div>
          {formFields(editingForm, setEditingForm)}
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>
        </form>
      )}

      <div className="road-table-wrap">
        <table className="road-table">
          <thead><tr><th>Road name</th><th>Start</th><th>End</th><th>Distance</th><th>Risk</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && roads.length === 0 && <tr><td colSpan="7">No roads found.</td></tr>}
            {roads.map((road) => (
              <tr key={road.id}>
                <td>{road.road_name}</td>
                <td>{formatCoordinate(road.start_latitude)}, {formatCoordinate(road.start_longitude)}</td>
                <td>{formatCoordinate(road.end_latitude)}, {formatCoordinate(road.end_longitude)}</td>
                <td>{road.distance_km} km</td>
                <td>{road.risk_level}</td>
                <td><span className={`road-status ${String(road.status || "OPEN").toUpperCase() === "BLOCKED" ? "blocked" : "open"}`}>{road.status || "OPEN"}</span></td>
                <td className="table-actions">
                  <button type="button" className="text-button" onClick={() => { setEditingId(road.id); setEditingForm(toFormValues(road)); setError(""); }}>Edit</button>
                  <button type="button" className="text-button danger" onClick={() => deleteRoad(road)} disabled={submitting}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default RoadManagement;
