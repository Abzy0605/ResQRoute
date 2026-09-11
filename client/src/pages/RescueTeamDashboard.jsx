import { useCallback, useEffect, useState } from "react";
import AppHeader from "../components/AppHeader";
import OperationalMap from "../components/OperationalMap";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";

function RescueTeamDashboard() {
  const { token } = useAuth();
  const [team, setTeam] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const getErrorMessage = async (response, fallback) => {
    let message;

    try {
      message = (await response.json()).message;
    } catch {
      // Use the safe fallback when the API does not return JSON.
    }

    if (response.status === 401) return "Please sign in again.";
    if (response.status === 403) return "You are not authorized to update this incident.";
    if (response.status === 404) return "Incident not found.";
    if (response.status === 400) return message || fallback;
    return fallback;
  };

  const loadOperationalData = useCallback(async (signal) => {
    setLoading(true);
    setError("");

    try {
      const teamResponse = await fetch(`${API_BASE_URL}/api/rescue-teams/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!teamResponse.ok) {
        throw new Error(await getErrorMessage(
          teamResponse,
          "Unable to load rescue team information. Please try again."
        ));
      }

      const teamData = await teamResponse.json();
      const incidentsResponse = await fetch(`${API_BASE_URL}/api/incidents/my-assigned`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!incidentsResponse.ok) {
        throw new Error(await getErrorMessage(
          incidentsResponse,
          "Unable to load assigned incidents. Please try again."
        ));
      }

      const incidentData = await incidentsResponse.json();

      if (!signal?.aborted) {
        setTeam(teamData);
        setIncidents(Array.isArray(incidentData) ? incidentData : []);
      }
    } catch (requestError) {
      if (requestError.name !== "AbortError" && !signal?.aborted) {
        setTeam(null);
        setIncidents([]);
        setError(requestError.message || "Unable to load rescue team information. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadOperationalData(controller.signal));
    return () => controller.abort();
  }, [loadOperationalData]);

  const nextAction = {
    ASSIGNED: { label: "Start En Route", status: "EN_ROUTE" },
    EN_ROUTE: { label: "Mark On Scene", status: "ON_SCENE" },
    ON_SCENE: { label: "Mark Completed", status: "COMPLETED" },
  };

  const updateIncidentStatus = async (incident) => {
    const action = nextAction[incident.status];
    if (!action) return;

    setUpdatingId(incident.id);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${incident.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: action.status }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(
          response,
          "Unable to update incident. Please try again."
        ));
      }

      await loadOperationalData();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message || "Unable to update incident. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatCoordinate = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(5) : "Not provided";
  };

  const formatDate = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Not provided";
  };

  const activeIncidentCount = incidents.filter(
    (incident) => incident.status !== "COMPLETED"
  ).length;
  const completedIncidentCount = incidents.filter(
    (incident) => incident.status === "COMPLETED"
  ).length;
  const statusClass = (status) => String(status || "AVAILABLE").toLowerCase().replace(/[^a-z]+/g, "-");

  return (
    <>
      <AppHeader subtitle="Rescue team response" />
      <section className="role-intro">
        <p className="eyebrow">Rescue team view</p>
        <p>Review only your assigned incidents and update response progress securely.</p>
      </section>
      {loading && <p className="muted-text">Loading rescue team operations...</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!loading && !error && team && (
        <section className="team-operational-summary" aria-label="Authenticated rescue team information">
          <div><span>Team</span><strong>{team.name}</strong></div>
          <div><span>Contact</span><strong>{team.contact_number || "Not provided"}</strong></div>
          <div><span>Current status</span><strong className={`status-chip ${statusClass(team.status)}`}>{team.status || "AVAILABLE"}</strong></div>
          <div><span>Active incidents</span><strong>{activeIncidentCount}</strong></div>
          <div><span>Completed incidents</span><strong>{completedIncidentCount}</strong></div>
        </section>
      )}
      <section className="incident-panel" aria-label="Reported incidents">
        <div className="section-heading">
          <h2>Assigned incidents</h2>
          {!loading && !error && team && <span>{incidents.length} total</span>}
        </div>
        {!loading && !error && team && incidents.length === 0 && (
          <p className="muted-text">No incidents are assigned to your rescue team.</p>
        )}
        {!loading && !error && team && incidents.length > 0 && (
          <div className="incident-list">
            {incidents.map((incident) => (
              <article className="incident-card" key={incident.id}>
                <div>
                  <strong>Incident #{incident.id}: {incident.description || "Incident without description"}</strong>
                  <span>Severity: {incident.severity ?? "Not provided"}</span>
                  <span>Disaster: {incident.disaster_type || "Not provided"}</span>
                  <span>Status: <strong className={`status-chip ${statusClass(incident.status)}`}>{incident.status || "Not provided"}</strong></span>
                </div>
                <div>
                  <span>Location: {formatCoordinate(incident.latitude)}, {formatCoordinate(incident.longitude)}</span>
                  <span>Reported by: {incident.reporter_name || "Not provided"}</span>
                  <span>Created: {formatDate(incident.created_at)}</span>
                  <span>Assigned team: {incident.rescue_team_name || team.name}</span>
                  {nextAction[incident.status] ? (
                    <button
                      type="button"
                      onClick={() => updateIncidentStatus(incident)}
                      disabled={updatingId === incident.id}
                    >
                      {updatingId === incident.id ? "Updating..." : nextAction[incident.status].label}
                    </button>
                  ) : incident.status === "COMPLETED" ? <span>Completed</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <OperationalMap refreshKey={refreshKey} />
    </>
  );
}

export default RescueTeamDashboard;
