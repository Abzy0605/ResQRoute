const pool = require("../db");

const ACTIVE_INCIDENT_STATUSES = ["ASSIGNED", "EN_ROUTE", "ON_SCENE"];

const TEAM_STATUS_PRIORITY = ["ON_SCENE", "EN_ROUTE", "ASSIGNED"];

const allowedTransitions = {
    ASSIGNED: "EN_ROUTE",
    EN_ROUTE: "ON_SCENE",
    ON_SCENE: "COMPLETED"
};

class RescueTeamIncidentError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "RescueTeamIncidentError";
        this.statusCode = statusCode;
    }
}

const getDerivedTeamStatus = (statuses) => (
    TEAM_STATUS_PRIORITY.find((status) => statuses.includes(status))
    || "AVAILABLE"
);

const updateAssignedIncidentStatus = async (incidentId, rescueTeamId, status) => {
    if (!Number.isInteger(incidentId) || incidentId <= 0) {
        throw new RescueTeamIncidentError("Incident not found.", 404);
    }

    if (typeof status !== "string" || !Object.values(allowedTransitions).includes(status)) {
        throw new RescueTeamIncidentError("Invalid incident status.", 400);
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Locking the team serializes operational status changes made by its members.
        const teamResult = await client.query(
            "SELECT id FROM rescue_teams WHERE id = $1 FOR UPDATE",
            [rescueTeamId]
        );

        if (teamResult.rows.length === 0) {
            throw new RescueTeamIncidentError("Your account is not associated with a rescue team.", 400);
        }

        const incidentResult = await client.query(
            `SELECT id, status
             FROM incidents
             WHERE id = $1 AND assigned_team_id = $2
             FOR UPDATE`,
            [incidentId, rescueTeamId]
        );

        if (incidentResult.rows.length === 0) {
            throw new RescueTeamIncidentError("Incident not found.", 404);
        }

        const incident = incidentResult.rows[0];

        if (allowedTransitions[incident.status] !== status) {
            throw new RescueTeamIncidentError(
                "Invalid incident status transition.",
                400
            );
        }

        const updatedIncident = await client.query(
            `UPDATE incidents
             SET status = $1
             WHERE id = $2 AND assigned_team_id = $3
             RETURNING *`,
            [status, incidentId, rescueTeamId]
        );

        const activeIncidents = await client.query(
            `SELECT status
             FROM incidents
             WHERE assigned_team_id = $1
               AND status = ANY($2::varchar[])`,
            [rescueTeamId, ACTIVE_INCIDENT_STATUSES]
        );

        const teamStatus = getDerivedTeamStatus(
            activeIncidents.rows.map((activeIncident) => activeIncident.status)
        );

        const updatedTeam = await client.query(
            `UPDATE rescue_teams
             SET status = $1
             WHERE id = $2
             RETURNING id, name, contact_number, latitude, longitude, status, created_at`,
            [teamStatus, rescueTeamId]
        );

        await client.query("COMMIT");

        return {
            incident: updatedIncident.rows[0],
            team: updatedTeam.rows[0]
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Rescue team incident rollback failed:", rollbackError.message);
        }

        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    ACTIVE_INCIDENT_STATUSES,
    RescueTeamIncidentError,
    allowedTransitions,
    getDerivedTeamStatus,
    updateAssignedIncidentStatus
};
