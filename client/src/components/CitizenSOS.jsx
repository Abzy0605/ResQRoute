import { useEffect, useMemo, useState } from "react";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";
const SOS_SEVERITY = 10;

const getLocationError = (error) => {
  if (error?.code === 1) return "Location permission was denied. You can enter coordinates manually.";
  if (error?.code === 3) return "Location request timed out. You can enter coordinates manually.";
  return "Your location is currently unavailable. You can enter coordinates manually.";
};

const getRequestError = (status, message) => {
  if (status === 401) return "Please sign in again before sending an SOS request.";
  if (status === 403) return "You are not authorized to send an SOS request.";
  if (status === 400) return message || "Please check your SOS details and try again.";
  return "SOS request was not confirmed as submitted. Please try again.";
};

const normalizeStatus = (status) => String(status || "").trim().toUpperCase();

function CitizenSOS({ onSOSSubmitted }) {
  const { token } = useAuth();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [details, setDetails] = useState("");
  const [disasterId, setDisasterId] = useState("");
  const [disasters, setDisasters] = useState([]);
  const [disastersLoading, setDisastersLoading] = useState(true);
  const [disastersError, setDisastersError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [formError, setFormError] = useState("");
  const [apiError, setApiError] = useState("");
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successIncident, setSuccessIncident] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadDisasters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/disasters`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Available disasters could not be loaded. You can still send SOS without selecting one.");
        const data = await response.json();
        if (!controller.signal.aborted) setDisasters(Array.isArray(data) ? data : []);
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

  const orderedDisasters = useMemo(() => (
    [...disasters].sort((first, second) => (
      Number(normalizeStatus(second.status) === "ACTIVE") - Number(normalizeStatus(first.status) === "ACTIVE")
    ))
  ), [disasters]);

  const selectedDisaster = disasters.find((disaster) => String(disaster.id) === disasterId) || null;

  const validate = () => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    if (!latitude.trim() || !Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
      return "Latitude must be a number between -90 and 90 before sending SOS.";
    }
    if (!longitude.trim() || !Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
      return "Longitude must be a number between -180 and 180 before sending SOS.";
    }
    if (disasterId && (!Number.isInteger(Number(disasterId)) || Number(disasterId) <= 0)) {
      return "Please select a valid disaster.";
    }
    return null;
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
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setLocating(false);
      },
      (error) => {
        setLocationError(getLocationError(error));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const beginConfirmation = (event) => {
    event.preventDefault();
    setFormError("");
    setApiError("");
    setSuccessIncident(null);

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setConfirming(true);
  };

  const sendSOS = async () => {
    if (submitting) return;

    setApiError("");
    const payload = {
      disaster_id: disasterId ? Number(disasterId) : null,
      description: ["SOS emergency request", details.trim()].filter(Boolean).join(" — "),
      latitude: Number(latitude),
      longitude: Number(longitude),
      severity: SOS_SEVERITY,
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
        // A generic message below avoids exposing malformed server output.
      }

      if (!response.ok || !result.id) {
        throw new Error(getRequestError(response.status, result.message));
      }

      setSuccessIncident({ ...result, disasterLabel: selectedDisaster?.type || "Not linked to a specific disaster" });
      setConfirming(false);
      setDetails("");
      onSOSSubmitted?.(result);
    } catch (error) {
      setApiError(error.message || "SOS request was not confirmed as submitted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="citizen-sos" aria-label="SOS emergency request">
      <div className="route-controls-header">
        <div>
          <p className="eyebrow">Emergency assistance</p>
          <h2>SOS / Emergency</h2>
        </div>
        <p>Send an emergency incident to disaster-response coordinators. A rescue team must be assigned by an administrator.</p>
      </div>

      <form className="citizen-sos-form" onSubmit={beginConfirmation}>
        <label>
          Latitude
          <input type="number" inputMode="decimal" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={submitting || confirming} />
        </label>
        <label>
          Longitude
          <input type="number" inputMode="decimal" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={submitting || confirming} />
        </label>
        <label>
          Related disaster (optional)
          <select value={disasterId} onChange={(event) => setDisasterId(event.target.value)} disabled={submitting || confirming || disastersLoading}>
            <option value="">Not linked to a specific disaster</option>
            {orderedDisasters.map((disaster) => (
              <option key={disaster.id} value={disaster.id}>{disaster.type} · Severity {disaster.severity} · {disaster.status}</option>
            ))}
          </select>
        </label>
        <label className="field-wide">
          Additional details (optional)
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add details that may help response coordinators." disabled={submitting || confirming} />
        </label>
        <div className="citizen-sos-actions">
          <button type="button" className="button-secondary" onClick={useMyLocation} disabled={submitting || confirming || locating}>
            {locating ? "Getting location..." : "Use My Location"}
          </button>
          <button type="submit" className="sos-button" disabled={submitting || confirming}>Send SOS</button>
        </div>
      </form>

      {confirming && (
        <section className="sos-confirmation" aria-label="Confirm emergency SOS">
          <h3>Send emergency SOS?</h3>
          <p>An emergency incident will be reported with your current location and severity {SOS_SEVERITY}. Continue?</p>
          <div className="citizen-sos-actions">
            <button type="button" className="button-secondary" onClick={() => setConfirming(false)} disabled={submitting}>Cancel</button>
            <button type="button" className="sos-button" onClick={sendSOS} disabled={submitting}>{submitting ? "Sending SOS..." : "Send SOS"}</button>
          </div>
        </section>
      )}

      {disastersLoading && <p className="muted-text">Loading available disasters...</p>}
      {disastersError && <p className="route-error" role="alert">{disastersError}</p>}
      {locationError && <p className="route-error" role="alert">{locationError}</p>}
      {formError && <p className="route-error" role="alert">{formError}</p>}
      {apiError && <p className="route-error" role="alert">{apiError}</p>}
      {successIncident && (
        <section className="sos-success" role="status">
          <strong>SOS request submitted</strong>
          <span>Incident #{successIncident.id} · Status: {successIncident.status || "REPORTED"} · Severity: {successIncident.severity ?? SOS_SEVERITY}</span>
          <span>Location: {Number(successIncident.latitude).toFixed(5)}, {Number(successIncident.longitude).toFixed(5)}</span>
          <span>Disaster: {successIncident.disasterLabel}</span>
          <p>Your request has been reported. A disaster administrator must assign a rescue team.</p>
        </section>
      )}
    </section>
  );
}

export default CitizenSOS;
