import { useCallback, useEffect, useState } from "react";
import useAuth from "../../context/useAuth";
import { API_BASE_URL } from "../../config";

const INCIDENT_STATUSES = ["REPORTED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "COMPLETED"];

const formatCoordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "Not provided";
};

const formatDate = (value) => {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not provided" : date.toLocaleString();
};

const getErrorMessage = (status, fallback) => {
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You are not authorized to manage incidents.";
  if (status === 404) return "Incident or rescue team not found.";
  if (status === 400) return fallback || "Please check the incident details.";
  return "Unable to update incident. Please try again.";
};

function IncidentManagement({ onChanged, refreshKey = 0 }) {
  const { token, currentUser } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadIncidents = useCallback(async (signal) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error(getErrorMessage(response.status));
      const data = await response.json();
      setIncidents(Array.isArray(data) ? data : []);
      setError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to update incident. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  const loadTeams = useCallback(async (signal) => {
    setTeamsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/rescue-teams`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error(getErrorMessage(response.status));
      const data = await response.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Unable to update incident. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setTeamsLoading(false);
    }
  }, [token]);

  const loadResources = useCallback(async (signal) => {
    setResourcesLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/resources`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) throw new Error(getErrorMessage(response.status));
      const data = await response.json();
      setResources(Array.isArray(data) ? data : []);
      setResourcesError("");
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setResources([]);
        setResourcesError(requestError.message || "Unable to load response resources. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setResourcesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return undefined;
    const controller = new AbortController();
    Promise.all([
      Promise.resolve().then(() => loadIncidents(controller.signal)),
      Promise.resolve().then(() => loadTeams(controller.signal)),
      Promise.resolve().then(() => loadResources(controller.signal)),
    ]);
    return () => controller.abort();
  }, [currentUser?.role, loadIncidents, loadResources, loadTeams, refreshKey]);

  const readError = async (response) => {
    try {
      return (await response.json()).message;
    } catch {
      return undefined;
    }
  };

  const updateDraft = (incident, field, value) => {
    setDrafts((current) => ({
      ...current,
      [incident.id]: {
        description: incident.description || "",
        latitude: incident.latitude,
        longitude: incident.longitude,
        severity: incident.severity,
        status: incident.status || "REPORTED",
        assigned_team_id: incident.assigned_team_id ?? "",
        ...current[incident.id],
        [field]: value,
      },
    }));
  };

  const getDraft = (incident) => drafts[incident.id] || {
    description: incident.description || "",
    latitude: incident.latitude,
    longitude: incident.longitude,
    severity: incident.severity,
    status: incident.status || "REPORTED",
    assigned_team_id: incident.assigned_team_id ?? "",
  };

  const updateIncident = async (incident) => {
    const draft = getDraft(incident);
    setError("");
    setFeedback("");
    setUpdatingId(incident.id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${incident.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: draft.description,
          latitude: Number(draft.latitude),
          longitude: Number(draft.longitude),
          severity: Number(draft.severity),
          status: draft.status,
          assigned_team_id: draft.assigned_team_id === "" ? null : Number(draft.assigned_team_id),
        }),
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readError(response)));
      }

      await Promise.all([loadIncidents(), loadTeams(), loadResources()]);
      setFeedback("Incident updated successfully.");
      onChanged();
    } catch (requestError) {
      setError(requestError.message || "Unable to update incident. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteIncident = async (incident) => {
    if (!window.confirm("Delete this incident?")) return;
    setUpdatingId(incident.id);
    setError("");
    setFeedback("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${incident.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, await readError(response)));
      }

      await loadIncidents();
      setFeedback("Incident deleted successfully.");
      onChanged();
    } catch (requestError) {
      setError(requestError.message || "Unable to update incident. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (currentUser?.role !== "ADMIN") return null;

  const responseResources = resources.filter((resource) => Number(resource.quantity) > 0);

  return (
    <section id="incident-management" className="incident-management" aria-label="Incident management">
      <div className="section-heading">
        <div><p className="eyebrow">Admin controls</p><h2>Incident management</h2></div>
        <span>{loading ? "Loading..." : `${incidents.length} records`}</span>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {feedback && <p className="auth-message" role="status">{feedback}</p>}
      {teamsLoading && <p className="muted-text">Loading rescue teams...</p>}
      {resourcesError && <p className="auth-error" role="alert">{resourcesError}</p>}
      <div className="incident-table-wrap">
        <table className="incident-table">
          <thead><tr><th>ID</th><th>Description</th><th>Severity</th><th>Disaster</th><th>Reported by</th><th>Location</th><th>Status</th><th>Assigned team</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {!loading && incidents.length === 0 && <tr><td colSpan="10">No incidents reported.</td></tr>}
            {incidents.map((incident) => {
              const draft = getDraft(incident);
              const expanded = expandedId === incident.id;
              return (
                <tr key={incident.id}>
                  <td>{incident.id}</td>
                  <td>{incident.description || "Not provided"}</td>
                  <td>{incident.severity ?? "Not provided"}</td>
                  <td>{incident.disaster_type || "Not provided"}</td>
                  <td>{incident.reporter_name || "Not provided"}</td>
                  <td>{formatCoordinate(incident.latitude)}, {formatCoordinate(incident.longitude)}</td>
                  <td><select className="incident-select" value={draft.status} onChange={(event) => updateDraft(incident, "status", event.target.value)}>{INCIDENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
                  <td><select className="incident-select" value={draft.assigned_team_id} onChange={(event) => updateDraft(incident, "assigned_team_id", event.target.value)}><option value="">Unassigned</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.status || "No status"})</option>)}</select></td>
                  <td>{formatDate(incident.created_at)}</td>
                  <td className="table-actions incident-actions">
                    <button type="button" className="text-button" onClick={() => setExpandedId(expanded ? null : incident.id)}>{expanded ? "Hide" : "Details"}</button>
                    <button type="button" className="text-button" onClick={() => updateIncident(incident)} disabled={updatingId === incident.id}>{updatingId === incident.id ? "Saving..." : "Save"}</button>
                    <button type="button" className="text-button danger" onClick={() => deleteIncident(incident)} disabled={updatingId === incident.id}>Delete</button>
                    {expanded && (
                      <div className="incident-details">
                        <strong>Incident details</strong>
                        <span>Description: {incident.description || "Not provided"}</span>
                        <span>Severity: {incident.severity ?? "Not provided"}</span>
                        <span>Disaster: {incident.disaster_type || "Not provided"}</span>
                        <span>Reporter: {incident.reporter_name || "Not provided"}</span>
                        <span>Coordinates: {formatCoordinate(incident.latitude)}, {formatCoordinate(incident.longitude)}</span>
                        <span>Assigned rescue team: {incident.rescue_team_name || "Unassigned"}</span>
                        <span>Created: {formatDate(incident.created_at)}</span>
                        <section className="incident-resource-coordination" aria-label={`Response resources for incident ${incident.id}`}>
                          <strong>Response resources</strong>
                          <p>Inventory with a positive recorded quantity is shown below. These resources are not assigned or dispatched to this incident by this view.</p>
                          {resourcesLoading && <span>Loading resource inventory...</span>}
                          {!resourcesLoading && !resourcesError && responseResources.length === 0 && <span>No resources with a positive recorded quantity are currently listed.</span>}
                          {!resourcesLoading && !resourcesError && responseResources.length > 0 && (
                            <div className="incident-resource-table-wrap">
                              <table className="incident-resource-table">
                                <thead><tr><th>Name</th><th>Type</th><th>Inventory quantity</th><th>Location</th><th>Status</th></tr></thead>
                                <tbody>
                                  {responseResources.map((resource) => (
                                    <tr key={resource.id}>
                                      <td>{resource.name || "Not provided"}</td>
                                      <td>{resource.resource_type || "Not provided"}</td>
                                      <td>{resource.quantity}</td>
                                      <td>{resource.location || "Not provided"}</td>
                                      <td>{resource.status || "Not provided"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                      </div>
                    )}
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

export default IncidentManagement;
