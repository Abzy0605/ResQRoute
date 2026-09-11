import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const TEAM_STATUSES = ["AVAILABLE", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "COMPLETED"];
const EMPTY_FORM = {
  name: "",
  contact_number: "",
  latitude: "",
  longitude: "",
  status: "AVAILABLE",
};

const toFormValues = (team) => ({
  name: team.name ?? "",
  contact_number: team.contact_number ?? "",
  latitude: team.latitude ?? "",
  longitude: team.longitude ?? "",
  status: team.status || "AVAILABLE",
});

const optionalCoordinateError = (value, label, minimum, maximum) => {
  if (value.trim() === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    return `${label} must be between ${minimum} and ${maximum}, or left empty.`;
  }

  return null;
};

const validateForm = (values) => {
  if (!values.name.trim()) {
    return "Rescue team name is required.";
  }

  const latitudeError = optionalCoordinateError(
    values.latitude,
    "Latitude",
    -90,
    90
  );
  const longitudeError = optionalCoordinateError(
    values.longitude,
    "Longitude",
    -180,
    180
  );

  if (latitudeError) {
    return latitudeError;
  }

  if (longitudeError) {
    return longitudeError;
  }

  if (!TEAM_STATUSES.includes(values.status)) {
    return "Select a valid rescue team status.";
  }

  return null;
};

const coordinateValue = (value) => (
  value.trim() === "" ? null : Number(value)
);

const toPayload = (values) => ({
  name: values.name.trim(),
  contact_number: values.contact_number.trim(),
  latitude: coordinateValue(values.latitude),
  longitude: coordinateValue(values.longitude),
  status: values.status,
});

const getErrorMessage = (status, fallback) => {
  if (status === 401) {
    return "Please sign in again.";
  }

  if (status === 403) {
    return "You are not authorized to manage rescue teams.";
  }

  if (status === 400) {
    return fallback || "Please check the rescue team details.";
  }

  return "Unable to update rescue teams. Please try again.";
};

function RescueTeamManagement({ onChanged }) {
  const { token, currentUser } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadTeams = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/rescue-teams`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status));
      }

      const data = await response.json();
      setTeams(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to update rescue teams. Please try again.");
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
    Promise.resolve().then(() => loadTeams(controller.signal));
    return () => controller.abort();
  }, [currentUser?.role, loadTeams]);

  const readErrorResponse = async (response) => {
    try {
      const result = await response.json();
      return result.message;
    } catch {
      return undefined;
    }
  };

  const refreshAfterChange = async (message) => {
    setFeedback(message);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await loadTeams();
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
        ? `${API_BASE_URL}/api/rescue-teams/${editingId}`
        : `${API_BASE_URL}/api/rescue-teams`;
      const response = await fetch(endpoint, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toPayload(values)),
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readErrorResponse(response)));
      }

      await refreshAfterChange(isEdit
        ? "Rescue team updated successfully."
        : "Rescue team created successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update rescue teams. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTeam = async (team) => {
    if (!window.confirm("Delete this rescue team?")) {
      return;
    }

    setError("");
    setFeedback("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/rescue-teams/${team.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readErrorResponse(response)));
      }

      await refreshAfterChange("Rescue team deleted successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update rescue teams. Please try again.");
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
    <section className="team-management" aria-label="Rescue team management">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin controls</p>
          <h2>Rescue team management</h2>
        </div>
        <span>{loading ? "Loading..." : `${teams.length} records`}</span>
      </div>

      <form className="team-form" onSubmit={(event) => submitForm(event)}>
        <h3>Create rescue team</h3>
        <div className="team-form-grid">
          <label>Name<input name="name" value={form.name} onChange={updateForm(setForm)} /></label>
          <label>Contact number<input name="contact_number" value={form.contact_number} onChange={updateForm(setForm)} /></label>
          <label>Latitude<input name="latitude" type="number" step="any" value={form.latitude} onChange={updateForm(setForm)} /></label>
          <label>Longitude<input name="longitude" type="number" step="any" value={form.longitude} onChange={updateForm(setForm)} /></label>
          <label>Status<select name="status" value={form.status} onChange={updateForm(setForm)}>{TEAM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        </div>
        <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Rescue Team"}</button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}

      {editingId && (
        <form className="team-form edit-form" onSubmit={(event) => submitForm(event, true)}>
          <div className="section-heading">
            <h3>Edit rescue team</h3>
            <button type="button" className="text-button" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
          <div className="team-form-grid">
            <label>Name<input name="name" value={editingForm.name} onChange={updateForm(setEditingForm)} /></label>
            <label>Contact number<input name="contact_number" value={editingForm.contact_number} onChange={updateForm(setEditingForm)} /></label>
            <label>Latitude<input name="latitude" type="number" step="any" value={editingForm.latitude} onChange={updateForm(setEditingForm)} /></label>
            <label>Longitude<input name="longitude" type="number" step="any" value={editingForm.longitude} onChange={updateForm(setEditingForm)} /></label>
            <label>Status<select name="status" value={editingForm.status} onChange={updateForm(setEditingForm)}>{TEAM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          </div>
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>
        </form>
      )}

      <div className="team-table-wrap">
        <table className="team-table">
          <thead><tr><th>Team name</th><th>Contact number</th><th>Latitude</th><th>Longitude</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && teams.length === 0 && <tr><td colSpan="6">No rescue teams found.</td></tr>}
            {teams.map((team) => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.contact_number || "Not provided"}</td>
                <td>{team.latitude ?? "Not provided"}</td>
                <td>{team.longitude ?? "Not provided"}</td>
                <td>{team.status || "AVAILABLE"}</td>
                <td className="table-actions">
                  <button type="button" className="text-button" onClick={() => { setEditingId(team.id); setEditingForm(toFormValues(team)); setError(""); }}>Edit</button>
                  <button type="button" className="text-button danger" onClick={() => deleteTeam(team)} disabled={submitting}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default RescueTeamManagement;
