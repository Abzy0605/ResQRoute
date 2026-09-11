import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const EMPTY_FORM = {
  type: "",
  severity: "",
  latitude: "",
  longitude: "",
  description: "",
  status: "ACTIVE",
};

const toFormValues = (disaster) => ({
  type: disaster.type ?? "",
  severity: disaster.severity ?? "",
  latitude: disaster.latitude ?? "",
  longitude: disaster.longitude ?? "",
  description: disaster.description ?? "",
  status: disaster.status || "ACTIVE",
});

const validateForm = (values, includeStatus = false) => {
  if (!values.type.trim()) {
    return "Disaster type is required.";
  }

  const severity = Number(values.severity);
  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);

  if (!Number.isInteger(severity) || severity < 1 || severity > 10) {
    return "Severity must be an integer between 1 and 10.";
  }

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be between -90 and 90.";
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be between -180 and 180.";
  }

  if (includeStatus && !values.status.trim()) {
    return "Status is required when editing a disaster.";
  }

  return null;
};

const toPayload = (values, includeStatus = false) => {
  const payload = {
    type: values.type.trim(),
    severity: Number(values.severity),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    description: values.description.trim(),
  };

  if (includeStatus) {
    payload.status = values.status.trim();
  }

  return payload;
};

const responseMessage = (status, fallback) => {
  if (status === 401) {
    return "Please sign in again.";
  }

  if (status === 403) {
    return "You are not authorized to manage disasters.";
  }

  if (status === 400) {
    return fallback || "Please check the disaster details.";
  }

  return "Unable to update disasters. Please try again.";
};

function DisasterManagement({ onChanged }) {
  const { token, currentUser } = useAuth();
  const [disasters, setDisasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadDisasters = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/disasters`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) {
        throw new Error(responseMessage(response.status));
      }

      const data = await response.json();
      setDisasters(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to update disasters. Please try again.");
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") {
      return undefined;
    }

    const controller = new AbortController();
    Promise.resolve().then(() => loadDisasters(controller.signal));
    return () => controller.abort();
  }, [currentUser?.role, loadDisasters]);

  const refreshAfterChange = async (message) => {
    setFeedback(message);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await loadDisasters();
    onChanged();
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/disasters`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toPayload(form)),
      });

      if (!response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = {};
        }
        throw new Error(responseMessage(response.status, result.message));
      }

      await refreshAfterChange("Disaster created successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update disasters. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    const validationError = validateForm(editingForm, true);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/disasters/${editingId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toPayload(editingForm, true)),
      });

      if (!response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = {};
        }
        throw new Error(responseMessage(response.status, result.message));
      }

      await refreshAfterChange("Disaster updated successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update disasters. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDisaster = async (disaster) => {
    if (!window.confirm("Delete this disaster?")) {
      return;
    }

    setError("");
    setFeedback("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/disasters/${disaster.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = {};
        }
        throw new Error(responseMessage(response.status, result.message));
      }

      await refreshAfterChange("Disaster deleted successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update disasters. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (setter) => (event) => {
    const { name, value } = event.target;
    setter((current) => ({ ...current, [name]: value }));
  };

  if (currentUser?.role !== "ADMIN") {
    return null;
  }

  return (
    <section className="disaster-management" aria-label="Disaster management">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin controls</p>
          <h2>Disaster management</h2>
        </div>
        <span>{loading ? "Loading..." : `${disasters.length} records`}</span>
      </div>

      <form className="disaster-form" onSubmit={submitCreate}>
        <h3>Create disaster</h3>
        <div className="disaster-form-grid">
          <label>Type<input name="type" value={form.type} onChange={updateForm(setForm)} /></label>
          <label>Severity<input name="severity" type="number" min="1" max="10" step="1" value={form.severity} onChange={updateForm(setForm)} /></label>
          <label>Latitude<input name="latitude" type="number" step="any" value={form.latitude} onChange={updateForm(setForm)} /></label>
          <label>Longitude<input name="longitude" type="number" step="any" value={form.longitude} onChange={updateForm(setForm)} /></label>
          <label className="field-wide">Description<textarea name="description" value={form.description} onChange={updateForm(setForm)} /></label>
        </div>
        <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Disaster"}</button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}

      {editingId && (
        <form className="disaster-form edit-form" onSubmit={submitEdit}>
          <div className="section-heading"><h3>Edit disaster</h3><button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button></div>
          <div className="disaster-form-grid">
            <label>Type<input name="type" value={editingForm.type} onChange={updateForm(setEditingForm)} /></label>
            <label>Severity<input name="severity" type="number" min="1" max="10" step="1" value={editingForm.severity} onChange={updateForm(setEditingForm)} /></label>
            <label>Latitude<input name="latitude" type="number" step="any" value={editingForm.latitude} onChange={updateForm(setEditingForm)} /></label>
            <label>Longitude<input name="longitude" type="number" step="any" value={editingForm.longitude} onChange={updateForm(setEditingForm)} /></label>
            <label>Status<input name="status" value={editingForm.status} onChange={updateForm(setEditingForm)} /></label>
            <label className="field-wide">Description<textarea name="description" value={editingForm.description} onChange={updateForm(setEditingForm)} /></label>
          </div>
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>
        </form>
      )}

      <div className="disaster-table-wrap">
        <table className="disaster-table">
          <thead><tr><th>Type</th><th>Severity</th><th>Location</th><th>Status</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && disasters.length === 0 && <tr><td colSpan="6">No disasters found.</td></tr>}
            {disasters.map((disaster) => (
              <tr key={disaster.id}>
                <td>{disaster.type}</td>
                <td>{disaster.severity}</td>
                <td>{disaster.latitude}, {disaster.longitude}</td>
                <td>{disaster.status || "ACTIVE"}</td>
                <td>{disaster.description || "Not provided"}</td>
                <td className="table-actions">
                  <button type="button" className="text-button" onClick={() => { setEditingId(disaster.id); setEditingForm(toFormValues(disaster)); setError(""); }}>Edit</button>
                  <button type="button" className="text-button danger" onClick={() => deleteDisaster(disaster)} disabled={submitting}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default DisasterManagement;
