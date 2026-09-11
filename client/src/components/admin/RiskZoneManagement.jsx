import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const EMPTY_FORM = {
  disaster_id: "",
  zone_name: "",
  risk_score: "",
  center_latitude: "",
  center_longitude: "",
  radius_km: "",
};

const riskLevelForScore = (score) => {
  if (score >= 81) return "CRITICAL";
  if (score >= 61) return "HIGH";
  if (score >= 31) return "MODERATE";
  return "LOW";
};

const toFormValues = (zone) => ({
  disaster_id: zone.disaster_id ?? "",
  zone_name: zone.zone_name ?? "",
  risk_score: zone.risk_score ?? "",
  center_latitude: zone.center_latitude ?? "",
  center_longitude: zone.center_longitude ?? "",
  radius_km: zone.radius_km ?? "",
});

const validateForm = (values) => {
  if (!values.zone_name.trim()) return "Risk zone name is required.";
  if (!values.risk_score.trim()) return "Risk score is required.";

  const riskScore = Number(values.risk_score);
  if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100) {
    return "Risk score must be an integer between 0 and 100.";
  }

  if (!values.center_latitude.trim()) return "Center latitude is required.";
  const latitude = Number(values.center_latitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Center latitude must be between -90 and 90.";
  }

  if (!values.center_longitude.trim()) return "Center longitude is required.";
  const longitude = Number(values.center_longitude);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Center longitude must be between -180 and 180.";
  }

  if (!values.radius_km.trim()) return "Radius is required.";
  const radius = Number(values.radius_km);
  if (!Number.isFinite(radius) || radius <= 0) {
    return "Radius must be greater than 0 km.";
  }

  if (values.disaster_id !== "" && (!Number.isInteger(Number(values.disaster_id)) || Number(values.disaster_id) <= 0)) {
    return "Please select a valid disaster.";
  }

  return null;
};

const toPayload = (values) => ({
  disaster_id: values.disaster_id === "" ? null : Number(values.disaster_id),
  zone_name: values.zone_name.trim(),
  risk_score: Number(values.risk_score),
  risk_level: riskLevelForScore(Number(values.risk_score)),
  center_latitude: Number(values.center_latitude),
  center_longitude: Number(values.center_longitude),
  radius_km: Number(values.radius_km),
});

const errorMessage = (status, fallback) => {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You are not authorized to manage risk zones.";
  if (status === 404) return "Risk zone not found.";
  if (status === 400) return fallback || "Please check the risk zone details.";
  return "Unable to update risk zones. Please try again.";
};

const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "Not provided";
};

const formatDate = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Not provided";
};

function RiskZoneManagement({ onChanged }) {
  const { token, currentUser } = useAuth();
  const [riskZones, setRiskZones] = useState([]);
  const [disasters, setDisasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disastersLoading, setDisastersLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [disastersError, setDisastersError] = useState("");

  const loadRiskZones = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/risk-zones`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error(errorMessage(response.status));
      const data = await response.json();
      setRiskZones(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to load risk zones. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  const loadDisasters = useCallback(async (signal) => {
    setDisastersLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/disasters`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error("Available disasters could not be loaded.");
      const data = await response.json();
      setDisasters(Array.isArray(data) ? data : []);
      setDisastersError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setDisasters([]);
        setDisastersError(requestError.message || "Available disasters could not be loaded.");
      }
    } finally {
      if (!signal?.aborted) setDisastersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return undefined;
    const controller = new AbortController();
    Promise.all([
      Promise.resolve().then(() => loadRiskZones(controller.signal)),
      Promise.resolve().then(() => loadDisasters(controller.signal)),
    ]);
    return () => controller.abort();
  }, [currentUser?.role, loadDisasters, loadRiskZones]);

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
    await loadRiskZones();
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
        ? `${API_BASE_URL}/api/risk-zones/${editingId}`
        : `${API_BASE_URL}/api/risk-zones`;
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

      await refreshAfterChange(isEdit ? "Risk zone updated successfully." : "Risk zone created successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update risk zones. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRiskZone = async (zone) => {
    if (!window.confirm(`Delete risk zone "${zone.zone_name}"?`)) return;
    setError("");
    setFeedback("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/risk-zones/${zone.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(errorMessage(response.status, await readError(response)));
      }

      await refreshAfterChange("Risk zone deleted successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update risk zones. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };

  if (currentUser?.role !== "ADMIN") return null;

  const formFields = (values, setter) => {
    const score = Number(values.risk_score);
    const riskLevel = Number.isInteger(score) && score >= 0 && score <= 100
      ? riskLevelForScore(score)
      : "Enter a valid risk score";

    return (
      <div className="risk-zone-form-grid">
        <label>Risk zone name<input name="zone_name" value={values.zone_name} onChange={updateForm(setter)} /></label>
        <label>Associated disaster (optional)<select name="disaster_id" value={values.disaster_id} onChange={updateForm(setter)} disabled={disastersLoading}><option value="">Not linked to a specific disaster</option>{disasters.map((disaster) => <option key={disaster.id} value={disaster.id}>{disaster.type} · Severity {disaster.severity} · {disaster.status}</option>)}</select></label>
        <label>Risk score (0–100)<input name="risk_score" type="number" min="0" max="100" step="1" value={values.risk_score} onChange={updateForm(setter)} /></label>
        <div className="risk-level-preview"><span>Risk level</span><strong>{riskLevel}</strong></div>
        <label>Center latitude<input name="center_latitude" type="number" step="any" value={values.center_latitude} onChange={updateForm(setter)} /></label>
        <label>Center longitude<input name="center_longitude" type="number" step="any" value={values.center_longitude} onChange={updateForm(setter)} /></label>
        <label>Radius (km)<input name="radius_km" type="number" min="0" step="any" value={values.radius_km} onChange={updateForm(setter)} /></label>
      </div>
    );
  };

  return (
    <section className="risk-zone-management" aria-label="Risk zone management">
      <div className="section-heading">
        <div><p className="eyebrow">Admin controls</p><h2>Risk zone management</h2></div>
        <span>{loading ? "Loading..." : `${riskZones.length} records`}</span>
      </div>

      <form className="risk-zone-form" onSubmit={(event) => submitForm(event)}>
        <h3>Create risk zone</h3>
        {formFields(form, setForm)}
        <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Risk Zone"}</button>
      </form>

      {disastersLoading && <p className="muted-text">Loading available disasters...</p>}
      {disastersError && <p className="auth-error" role="alert">{disastersError}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}

      {editingId && (
        <form className="risk-zone-form edit-form" onSubmit={(event) => submitForm(event, true)}>
          <div className="section-heading"><h3>Edit risk zone</h3><button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button></div>
          {formFields(editingForm, setEditingForm)}
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>
        </form>
      )}

      <div className="risk-zone-table-wrap">
        <table className="risk-zone-table">
          <thead><tr><th>Name</th><th>Disaster</th><th>Score</th><th>Level</th><th>Center</th><th>Radius</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && riskZones.length === 0 && <tr><td colSpan="8">No risk zones found.</td></tr>}
            {riskZones.map((zone) => (
              <tr key={zone.id}>
                <td>{zone.zone_name || "Not provided"}</td>
                <td>{zone.disaster_type || "Not linked"}</td>
                <td>{zone.risk_score ?? "Not provided"}</td>
                <td>{zone.risk_level || "Not provided"}</td>
                <td>{formatCoordinate(zone.center_latitude)}, {formatCoordinate(zone.center_longitude)}</td>
                <td>{zone.radius_km ?? "Not provided"} km</td>
                <td>{formatDate(zone.created_at)}</td>
                <td className="table-actions">
                  <button type="button" className="text-button" onClick={() => { setEditingId(zone.id); setEditingForm(toFormValues(zone)); setError(""); }}>Edit</button>
                  <button type="button" className="text-button danger" onClick={() => deleteRiskZone(zone)} disabled={submitting}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default RiskZoneManagement;
