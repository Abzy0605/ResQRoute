const pool = require("../db");
const { ACTIVE_INCIDENT_STATUSES, getDerivedTeamStatus } = require("./rescueTeamIncidentService");

class AdminIncidentError extends Error { constructor(message, statusCode) { super(message); this.name = "AdminIncidentError"; this.statusCode = statusCode; } }
const synchronizeTeam = async (client, teamId) => {
    if (!teamId) return null;
    const active = await client.query("SELECT status FROM incidents WHERE assigned_team_id = $1 AND status = ANY($2::varchar[])", [teamId, ACTIVE_INCIDENT_STATUSES]);
    const result = await client.query("UPDATE rescue_teams SET status = $1 WHERE id = $2 RETURNING id, name, contact_number, latitude, longitude, status, created_at", [getDerivedTeamStatus(active.rows.map((incident) => incident.status)), teamId]);
    return result.rows[0] || null;
};
const validateAdminIncidentInvariant = (input) => {
    const activeWithoutTeam = !input.assigned_team_id
        && ["ASSIGNED", "EN_ROUTE", "ON_SCENE"].includes(input.status);
    if (activeWithoutTeam) {
        throw new AdminIncidentError("An active incident must be assigned to a rescue team", 400);
    }
};
const updateIncidentByAdmin = async (incidentId, input) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const incident = await client.query("SELECT id, assigned_team_id FROM incidents WHERE id = $1 FOR UPDATE", [incidentId]);
        if (!incident.rows.length) throw new AdminIncidentError("Incident not found", 404);
        const previousTeamId = incident.rows[0].assigned_team_id;
        validateAdminIncidentInvariant(input);
        if (input.assigned_team_id) {
            const team = await client.query("SELECT id FROM rescue_teams WHERE id = $1 FOR UPDATE", [input.assigned_team_id]);
            if (!team.rows.length) throw new AdminIncidentError("Rescue team not found", 404);
        }
        if (previousTeamId && previousTeamId !== input.assigned_team_id) await client.query("SELECT id FROM rescue_teams WHERE id = $1 FOR UPDATE", [previousTeamId]);
        const updated = await client.query("UPDATE incidents SET description = $1, latitude = $2, longitude = $3, severity = $4, status = $5, assigned_team_id = $6 WHERE id = $7 RETURNING *", [input.description, input.latitude, input.longitude, input.severity, input.status, input.assigned_team_id, incidentId]);
        const teams = [];
        for (const teamId of [...new Set([previousTeamId, input.assigned_team_id].filter(Boolean))]) teams.push(await synchronizeTeam(client, teamId));
        await client.query("COMMIT");
        return { incident: updated.rows[0], teams: teams.filter(Boolean) };
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("Admin incident rollback failed:", rollbackError.message); }
        throw error;
    } finally { client.release(); }
};
module.exports = { AdminIncidentError, updateIncidentByAdmin, validateAdminIncidentInvariant };
