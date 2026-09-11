import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const SHELTER_STATUSES = ["AVAILABLE", "FULL", "CLOSED"];
const EMPTY_CREATE_FORM = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  capacity: "",
};
const EMPTY_EDIT_FORM = {
  ...EMPTY_CREATE_FORM,
  current_occupancy: "0",
  status: "AVAILABLE",
};

const toFormValues = (shelter) => ({
  name: shelter.name ?? "",
  address: shelter.address ?? "",
  latitude: shelter.latitude ?? "",
  longitude: shelter.longitude ?? "",
  capacity: shelter.capacity ?? "",
  current_occupancy: shelter.current_occupancy ?? "0",
  status: shelter.status || "AVAILABLE",
});

const validateLocation = (values) => {
  if (!values.name.trim()) {
    return "Shelter name is required.";
  }

  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be between -90 and 90.";
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be between -180 and 180.";
  }

  const capacity = Number(values.capacity);

  if (!Number.isInteger(capacity) || capacity <= 0) {
    return "Capacity must be a positive integer.";
  }

  return null;
};

const validateEdit = (values) => {
  const locationError = validateLocation(values);

  if (locationError) {
    return locationError;
  }

  const occupancy = Number(values.current_occupancy);

  if (!Number.isInteger(occupancy) || occupancy < 0) {
    return "Current occupancy must be a non-negative integer.";
  }

  if (occupancy > Number(values.capacity)) {
    return "Current occupancy cannot exceed capacity.";
  }

  if (!SHELTER_STATUSES.includes(values.status)) {
    return "Select a valid shelter status.";
  }

  return null;
};

const createPayload = (values) => ({
  name: values.name.trim(),
  address: values.address.trim(),
  latitude: Number(values.latitude),
  longitude: Number(values.longitude),
  capacity: Number(values.capacity),
});

const editPayload = (values) => ({
  ...createPayload(values),
  current_occupancy: Number(values.current_occupancy),
  status: values.status,
});

const getErrorMessage = (status, fallback) => {
  if (status === 401) {
    return "Please sign in again.";
  }

  if (status === 403) {
    return "You are not authorized to manage shelters.";
  }

  if (status === 400) {
    return fallback || "Please check the shelter details.";
  }

  return "Unable to update shelters. Please try again.";
};

function ShelterManagement({ onChanged }) {
  const { token, currentUser } = useAuth();
  const [shelters, setShelters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadShelters = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/shelters`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status));
      }

      const data = await response.json();
      setShelters(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to update shelters. Please try again.");
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
    Promise.resolve().then(() => loadShelters(controller.signal));
    return () => controller.abort();
  }, [currentUser?.role, loadShelters]);

  const refreshAfterChange = async (message) => {
    setFeedback(message);
    setEditingId(null);
    setCreateForm(EMPTY_CREATE_FORM);
    await loadShelters();
    onChanged();
  };

  const readErrorResponse = async (response) => {
    try {
      const result = await response.json();
      return result.message;
    } catch {
      return undefined;
    }
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    const validationError = validateLocation(createForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/shelters`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload(createForm)),
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readErrorResponse(response)));
      }

      await refreshAfterChange("Shelter created successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update shelters. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setError("");
    setFeedback("");

    const validationError = validateEdit(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/shelters/${editingId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editPayload(editForm)),
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readErrorResponse(response)));
      }

      await refreshAfterChange("Shelter updated successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update shelters. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteShelter = async (shelter) => {
    if (!window.confirm("Delete this shelter?")) {
      return;
    }

    setError("");
    setFeedback("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/shelters/${shelter.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readErrorResponse(response)));
      }

      await refreshAfterChange("Shelter deleted successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update shelters. Please try again.");
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
    <section className="shelter-management" aria-label="Shelter management">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin controls</p>
          <h2>Shelter management</h2>
        </div>
        <span>{loading ? "Loading..." : `${shelters.length} records`}</span>
      </div>

      <form className="shelter-form" onSubmit={submitCreate}>
        <h3>Create shelter</h3>
        <div className="shelter-form-grid">
          <label>Name<input name="name" value={createForm.name} onChange={updateForm(setCreateForm)} /></label>
          <label>Latitude<input name="latitude" type="number" step="any" value={createForm.latitude} onChange={updateForm(setCreateForm)} /></label>
          <label>Longitude<input name="longitude" type="number" step="any" value={createForm.longitude} onChange={updateForm(setCreateForm)} /></label>
          <label>Capacity<input name="capacity" type="number" min="1" step="1" value={createForm.capacity} onChange={updateForm(setCreateForm)} /></label>
          <label className="field-wide">Address<input name="address" value={createForm.address} onChange={updateForm(setCreateForm)} /></label>
        </div>
        <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Shelter"}</button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}

      {editingId && (
        <form className="shelter-form edit-form" onSubmit={submitEdit}>
          <div className="section-heading">
            <h3>Edit shelter</h3>
            <button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
          <div className="shelter-form-grid">
            <label>Name<input name="name" value={editForm.name} onChange={updateForm(setEditForm)} /></label>
            <label>Latitude<input name="latitude" type="number" step="any" value={editForm.latitude} onChange={updateForm(setEditForm)} /></label>
            <label>Longitude<input name="longitude" type="number" step="any" value={editForm.longitude} onChange={updateForm(setEditForm)} /></label>
            <label>Capacity<input name="capacity" type="number" min="1" step="1" value={editForm.capacity} onChange={updateForm(setEditForm)} /></label>
            <label>Current occupancy<input name="current_occupancy" type="number" min="0" step="1" value={editForm.current_occupancy} onChange={updateForm(setEditForm)} /></label>
            <label>Status<select name="status" value={editForm.status} onChange={updateForm(setEditForm)}>{SHELTER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label className="field-wide">Address<input name="address" value={editForm.address} onChange={updateForm(setEditForm)} /></label>
          </div>
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>
        </form>
      )}

      <div className="shelter-table-wrap">
        <table className="shelter-table">
          <thead><tr><th>Name</th><th>Address</th><th>Capacity</th><th>Current occupancy</th><th>Remaining capacity</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && shelters.length === 0 && <tr><td colSpan="7">No shelters found.</td></tr>}
            {shelters.map((shelter) => {
              const capacity = Number(shelter.capacity);
              const occupancy = Number(shelter.current_occupancy ?? 0);
              const remaining = Number.isFinite(capacity) && Number.isFinite(occupancy)
                ? capacity - occupancy
                : "Unavailable";

              return (
                <tr key={shelter.id}>
                  <td>{shelter.name}</td>
                  <td>{shelter.address || "Not provided"}</td>
                  <td>{shelter.capacity}</td>
                  <td>{shelter.current_occupancy ?? 0}</td>
                  <td>{remaining}</td>
                  <td>{shelter.status || "AVAILABLE"}</td>
                  <td className="table-actions">
                    <button type="button" className="text-button" onClick={() => { setEditingId(shelter.id); setEditForm(toFormValues(shelter)); setError(""); }}>Edit</button>
                    <button type="button" className="text-button danger" onClick={() => deleteShelter(shelter)} disabled={submitting}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ShelterManagement;
