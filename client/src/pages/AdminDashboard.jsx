import { useEffect, useMemo, useState } from "react";
import AppHeader from "../components/AppHeader";
import DisasterManagement from "../components/admin/DisasterManagement";
import ShelterManagement from "../components/admin/ShelterManagement";
import RescueTeamManagement from "../components/admin/RescueTeamManagement";
import RoadManagement from "../components/admin/RoadManagement";
import IncidentManagement from "../components/admin/IncidentManagement";
import ResourceManagement from "../components/admin/ResourceManagement";
import RiskZoneManagement from "../components/admin/RiskZoneManagement";
import RiskAssessment from "../components/admin/RiskAssessment";
import OperationalMap from "../components/OperationalMap";
import useAuth from "../context/useAuth";
import { API_BASE_URL } from "../config";
const summaryResources = [["disasters", "/api/disasters"], ["shelters", "/api/shelters"], ["rescueTeams", "/api/rescue-teams"], ["roads", "/api/roads"], ["resources", "/api/resources"], ["riskZones", "/api/risk-zones"], ["incidents", "/api/incidents"]];
const emptySummary = Object.fromEntries(summaryResources.map(([name]) => [name, null]));
const ACTIVE_TEAM_STATUSES = ["ASSIGNED", "EN_ROUTE", "ON_SCENE"];
const INCIDENT_URGENCY = { ON_SCENE: 4, EN_ROUTE: 3, ASSIGNED: 2, REPORTED: 1, COMPLETED: 0 };

const normalize = (value) => String(value || "").trim().toUpperCase();
const recordsFor = (value) => Array.isArray(value) ? value : [];
const countStatus = (records, status, field = "status") => records.filter((record) => normalize(record[field]) === status).length;
const formatCoordinate = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "Not provided";
const incidentTimestamp = (incident) => {
  const timestamp = new Date(incident.created_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

function MetricCard({ label, value, detail, unavailable }) {
  return <article className="command-metric-card"><span>{label}</span><strong>{unavailable ? "Unable to load" : value}</strong>{detail && <small>{detail}</small>}</article>;
}

function AdminDashboard() {
  const { token } = useAuth();
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadSummary = async () => {
      const results = await Promise.all(summaryResources.map(async ([name, endpoint]) => {
        try {
          const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
          if (!response.ok) return [name, null];
          const data = await response.json();
          return [name, Array.isArray(data) ? data : null];
        } catch {
          return [name, null];
        }
      }));
      if (!controller.signal.aborted) {
        setSummary(Object.fromEntries(results));
        setLoading(false);
      }
    };
    loadSummary();
    return () => controller.abort();
  }, [token, refreshKey]);

  const commandData = useMemo(() => {
    const disasters = recordsFor(summary.disasters);
    const shelters = recordsFor(summary.shelters);
    const teams = recordsFor(summary.rescueTeams);
    const roads = recordsFor(summary.roads);
    const resources = recordsFor(summary.resources);
    const riskZones = recordsFor(summary.riskZones);
    const incidents = recordsFor(summary.incidents);
    const activeDisasters = disasters.filter((disaster) => normalize(disaster.status) === "ACTIVE");
    const priorityIncidents = [...incidents].sort((first, second) => {
      const severityDifference = Number(second.severity || 0) - Number(first.severity || 0);
      if (severityDifference !== 0) return severityDifference;
      const urgencyDifference = (INCIDENT_URGENCY[normalize(second.status)] ?? 0) - (INCIDENT_URGENCY[normalize(first.status)] ?? 0);
      return urgencyDifference || incidentTimestamp(second) - incidentTimestamp(first);
    }).slice(0, 5);
    const remainingShelterCapacity = shelters.reduce((total, shelter) => {
      const capacity = Number(shelter.capacity);
      const occupancy = Number(shelter.current_occupancy ?? 0);
      return Number.isFinite(capacity) && Number.isFinite(occupancy) ? total + Math.max(0, capacity - occupancy) : total;
    }, 0);
    const resourceTypes = resources.reduce((counts, resource) => {
      const type = resource.resource_type || "Unspecified";
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
    return { disasters, shelters, teams, roads, resources, riskZones, incidents, activeDisasters, priorityIncidents, remainingShelterCapacity, resourceTypes,
      highCriticalIncidents: incidents.filter((incident) => Number(incident.severity) >= 8).length,
      availableTeams: countStatus(teams, "AVAILABLE"),
      activeTeams: teams.filter((team) => ACTIVE_TEAM_STATUSES.includes(normalize(team.status))).length,
      positiveResources: resources.filter((resource) => Number(resource.quantity) > 0).length,
      zeroResources: resources.filter((resource) => !(Number(resource.quantity) > 0)).length,
      openRoads: countStatus(roads, "OPEN"), blockedRoads: countStatus(roads, "BLOCKED"), availableShelters: countStatus(shelters, "AVAILABLE") };
  }, [summary]);

  const changeData = () => setRefreshKey((current) => current + 1);
  const endpointUnavailable = (name) => !loading && !Array.isArray(summary[name]);
  const mostSevereActiveDisaster = [...commandData.activeDisasters].sort((first, second) => Number(second.severity || 0) - Number(first.severity || 0))[0];

  return (
    <>
      <AppHeader subtitle="Disaster Command Center" />
      <section className="role-intro"><p className="eyebrow">Administrator view</p><p>Review current operational records, prioritize response, and use the management tools below to coordinate disaster operations.</p></section>
      <section className="command-center" aria-label="Disaster command center">
        <div className="command-section-heading"><div><p className="eyebrow">Operational summary</p><h2>Current response picture</h2></div><span>{loading ? "Loading operational data..." : "Derived from current application records"}</span></div>
        <div className="command-metric-grid">
          <MetricCard label="Active disasters" value={commandData.activeDisasters.length} detail={mostSevereActiveDisaster ? `Most severe: ${mostSevereActiveDisaster.type} (${mostSevereActiveDisaster.severity})` : "No active disaster listed"} unavailable={endpointUnavailable("disasters")} />
          <MetricCard label="Total incidents" value={commandData.incidents.length} detail={`${commandData.highCriticalIncidents} high/critical severity (8–10)`} unavailable={endpointUnavailable("incidents")} />
          <MetricCard label="Available rescue teams" value={commandData.availableTeams} detail={`${commandData.activeTeams} handling active incidents`} unavailable={endpointUnavailable("rescueTeams")} />
          <MetricCard label="Available resource inventory" value={commandData.positiveResources} detail={`${commandData.zeroResources} records have no positive quantity`} unavailable={endpointUnavailable("resources")} />
          <MetricCard label="Road network" value={`${commandData.openRoads} open`} detail={`${commandData.blockedRoads} blocked of ${commandData.roads.length} total`} unavailable={endpointUnavailable("roads")} />
          <MetricCard label="Available shelters" value={commandData.availableShelters} detail={`${commandData.remainingShelterCapacity} remaining capacity`} unavailable={endpointUnavailable("shelters")} />
          <MetricCard label="Risk zones" value={commandData.riskZones.length} detail={`High: ${countStatus(commandData.riskZones, "HIGH", "risk_level")} · Critical: ${countStatus(commandData.riskZones, "CRITICAL", "risk_level")}`} unavailable={endpointUnavailable("riskZones")} />
        </div>
        <div className="command-detail-grid">
          <section className="command-panel" aria-label="Priority incidents">
            <div className="command-panel-heading"><div><p className="eyebrow">Incident priority</p><h3>Priority incidents</h3></div><a href="#incident-management">Open incident management</a></div>
            {endpointUnavailable("incidents") && <p className="muted-text">Unable to load incidents.</p>}
            {!loading && !endpointUnavailable("incidents") && commandData.priorityIncidents.length === 0 && <p className="muted-text">No incidents are currently listed.</p>}
            {commandData.priorityIncidents.length > 0 && <div className="priority-incident-list">{commandData.priorityIncidents.map((incident) => <article key={incident.id} className="priority-incident"><div><strong>Incident #{incident.id}</strong><span>Severity {incident.severity ?? "Not provided"} · {incident.status || "Not provided"}</span></div><p>{incident.description || "No description provided."}</p><small>Location: {formatCoordinate(incident.latitude)}, {formatCoordinate(incident.longitude)} · Team: {incident.rescue_team_name || "Unassigned"}</small></article>)}</div>}
          </section>
          <section className="command-panel" aria-label="Operational breakdowns">
            <div className="command-panel-heading"><div><p className="eyebrow">Response readiness</p><h3>Operational breakdowns</h3></div></div>
            <div className="command-breakdown"><strong>Rescue teams</strong><span>Available {countStatus(commandData.teams, "AVAILABLE")} · Assigned {countStatus(commandData.teams, "ASSIGNED")} · En route {countStatus(commandData.teams, "EN_ROUTE")} · On scene {countStatus(commandData.teams, "ON_SCENE")}</span></div>
            <div className="command-breakdown"><strong>Shelters</strong><span>Available {countStatus(commandData.shelters, "AVAILABLE")} · Full {countStatus(commandData.shelters, "FULL")} · Closed {countStatus(commandData.shelters, "CLOSED")}</span></div>
            <div className="command-breakdown"><strong>Risk zones</strong><span>Low {countStatus(commandData.riskZones, "LOW", "risk_level")} · Moderate {countStatus(commandData.riskZones, "MODERATE", "risk_level")} · High {countStatus(commandData.riskZones, "HIGH", "risk_level")} · Critical {countStatus(commandData.riskZones, "CRITICAL", "risk_level")}</span></div>
            <div className="command-breakdown"><strong>Resource types</strong><span>{Object.entries(commandData.resourceTypes).length > 0 ? Object.entries(commandData.resourceTypes).map(([type, count]) => `${type}: ${count}`).join(" · ") : "No resource records listed"}</span></div>
            <p className="command-disclaimer">Resource inventory is not an incident-dispatch record. Use the existing incident and resource management tools to coordinate operations.</p>
          </section>
        </div>
      </section>
      <section className="command-map-section" aria-label="Operational map overview"><div className="command-section-heading"><div><p className="eyebrow">Operational map</p><h2>Live response layers</h2></div><span>Disasters, shelters, teams, roads, and risk zones</span></div><OperationalMap refreshKey={refreshKey} /></section>
      <RiskAssessment />
      <section className="management-heading" aria-label="Management tools"><p className="eyebrow">Management tools</p><h2>Maintain operational records</h2><p>Use the existing controls below to update authoritative disaster, incident, team, shelter, road, resource, and risk-zone records.</p></section>
      <DisasterManagement onChanged={changeData} />
      <IncidentManagement onChanged={changeData} refreshKey={refreshKey} />
      <RescueTeamManagement onChanged={changeData} />
      <ShelterManagement onChanged={changeData} />
      <RoadManagement onChanged={changeData} />
      <ResourceManagement onChanged={changeData} />
      <RiskZoneManagement onChanged={changeData} />
    </>
  );
}

export default AdminDashboard;
