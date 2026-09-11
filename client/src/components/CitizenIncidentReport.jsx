import { useEffect, useState } from "react";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";

const EMPTY_FORM = {
  disaster_id: "",
  description: "",
  latitude: "",
  longitude: "",
  severity: "",
};

const getRequestError = (status, message) => {
  if (status === 401) return "Please sign in again before reporting an incident.";
  if (status === 403) return "You are not authorized to report an incident.";
  if (status === 400) return message || "Please check the incident details and try again.";
  return "Unable to report the incident. Please try again.";
};

const getLocationError = (error) => {
  if (error?.code === 1) {
    return "Location permission was denied. You can enter coordinates manually.";
  }

  if (error?.code === 3) {
    return "Location request timed out. You can enter coordinates manually.";
  }

  return "Your location is currently unavailable. You can enter coordinates manually.";
};

const validateForm = (form) => {
  const description = form.description.trim();
  const severity = Number(form.severity);
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);

  if (!description) return "Please describe the incident.";
  if (!Number.isInteger(severity) || severity < 1 || severity > 10) {
    return "Severity must be an integer between 1 and 10.";
  }
  if (!form.latitude.trim()) return "Latitude is required.";
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be a number between -90 and 90.";
  }
  if (!form.longitude.trim()) return "Longitude is required.";
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be a number between -180 and 180.";
  }
  if (form.disaster_id !== "" && (!Number.isInteger(Number(form.disaster_id)) || Number(form.disaster_id) <= 0)) {
    return "Please select a valid disaster.";
  }

  return null;
};

function CitizenIncidentReport({ onIncidentReported }) {
  const { token } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [disasters, setDisasters] = useState([]);
  const [disastersLoading, setDisastersLoading] = useState(true);
  const [disastersError, setDisastersError] = useState("");
  const [formError, setFormError] = useState("");
  const [apiError, setApiError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [successIncident, setSuccessIncident] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadDisasters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/disasters`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Available disasters could not be loaded. You can still report without selecting one.");
        }

        const data = await response.json();
        if (!controller.signal.aborted) {
          setDisasters(Array.isArray(data) ? data : []);
          setDisastersError("");
        }
      } catch (error) {
        if (error.name !== "AbortError" && !controller.signal.aborted) {
          setDisasters([]);
          setDisastersError(error.message || "Available disasters could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setDisastersLoading(false);
      }
    };

    loadDisasters();
    return () => controller.abort();
  }, [token]);

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
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
        setForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }));
        setLocating(false);
      },
      (error) => {
        setLocationError(getLocationError(error));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const submitIncident = async (event) => {
    event.preventDefault();
    setFormError("");
    setApiError("");
    setSuccessIncident(null);

    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = {
      disaster_id: form.disaster_id === "" ? null : Number(form.disaster_id),
      description: form.description.trim(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      severity: Number(form.severity),
    };

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents`, {
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
        // Fall back to a safe generic error below when the API response is not JSON.
      }

      if (!response.ok) {
        throw new Error(getRequestError(response.status, result.message));
      }

      setSuccessIncident(result);
      setForm(EMPTY_FORM);
      onIncidentReported?.(result);
    } catch (error) {
      setApiError(error.message || "Unable to report the incident. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="citizen-incident-report" aria-label="Report an incident">
      <div className="route-controls-header">
        <div>
          <p className="eyebrow">Emergency assistance</p>
          <h2>Report an incident</h2>
        </div>
        <p>Send your location and incident details to response coordinators.</p>
      </div>

      <form className="citizen-incident-form" onSubmit={submitIncident}>
        <label className="field-wide">
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={updateForm}
            placeholder="Describe what happened and any immediate danger."
            disabled={submitting}
          />
        </label>
        <label>
          Severity (1–10)
          <select name="severity" value={form.severity} onChange={updateForm} disabled={submitting}>
            <option value="">Select severity</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((severity) => (
              <option key={severity} value={severity}>{severity}</option>
            ))}
          </select>
        </label>
        <label>
          Related disaster (optional)
          <select name="disaster_id" value={form.disaster_id} onChange={updateForm} disabled={submitting || disastersLoading}>
            <option value="">Not linked to a specific disaster</option>
            {disasters.map((disaster) => (
              <option key={disaster.id} value={disaster.id}>
                {disaster.type} · Severity {disaster.severity} · {disaster.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Latitude
          <input name="latitude" type="number" inputMode="decimal" step="any" value={form.latitude} onChange={updateForm} disabled={submitting} />
        </label>
        <label>
          Longitude
          <input name="longitude" type="number" inputMode="decimal" step="any" value={form.longitude} onChange={updateForm} disabled={submitting} />
        </label>
        <div className="citizen-incident-actions">
          <button type="button" className="button-secondary" onClick={useMyLocation} disabled={submitting || locating}>
            {locating ? "Getting location..." : "Use My Location"}
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting report..." : "Submit Incident Report"}
          </button>
        </div>
      </form>

      {disastersLoading && <p className="muted-text">Loading available disasters...</p>}
      {disastersError && <p className="route-error" role="alert">{disastersError}</p>}
      {locationError && <p className="route-error" role="alert">{locationError}</p>}
      {formError && <p className="route-error" role="alert">{formError}</p>}
      {apiError && <p className="route-error" role="alert">{apiError}</p>}
      {successIncident && (
        <p className="auth-message" role="status">
          Incident report #{successIncident.id} submitted successfully at {Number(successIncident.latitude).toFixed(5)}, {Number(successIncident.longitude).toFixed(5)}.
        </p>
      )}
    </section>
  );
}

export default CitizenIncidentReport;
