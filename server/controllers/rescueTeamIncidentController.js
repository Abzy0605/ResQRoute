const pool = require("../db");
const { getRescueTeamIdForUser } = require("../services/rescueTeamAssociationService");
const {
    RescueTeamIncidentError,
    updateAssignedIncidentStatus
} = require("../services/rescueTeamIncidentService");

const ASSOCIATION_MESSAGE = "Your account is not associated with a rescue team.";

const getAuthenticatedRescueTeamId = async (userId) => {
    const rescueTeamId = await getRescueTeamIdForUser(userId);

    if (!rescueTeamId) {
        throw new RescueTeamIncidentError(ASSOCIATION_MESSAGE, 400);
    }

    return rescueTeamId;
};

const getMyAssignedIncidents = async (req, res) => {
    try {
        const rescueTeamId = await getAuthenticatedRescueTeamId(req.user.id);
        const result = await pool.query(
            `SELECT
                i.*,
                d.type AS disaster_type,
                u.name AS reporter_name,
                r.name AS rescue_team_name
             FROM incidents i
             LEFT JOIN disasters d ON i.disaster_id = d.id
             LEFT JOIN users u ON i.reported_by = u.id
             INNER JOIN rescue_teams r ON i.assigned_team_id = r.id
             WHERE i.assigned_team_id = $1
             ORDER BY i.id`,
            [rescueTeamId]
        );

        return res.json(result.rows);
    } catch (error) {
        if (error instanceof RescueTeamIncidentError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error("Failed to fetch assigned incidents:", error.message);
        return res.status(500).json({ message: "Failed to fetch assigned incidents" });
    }
};

const updateMyAssignedIncidentStatus = async (req, res) => {
    try {
        const rescueTeamId = await getAuthenticatedRescueTeamId(req.user.id);
        const result = await updateAssignedIncidentStatus(
            Number(req.params.id),
            rescueTeamId,
            req.body?.status
        );

        return res.json(result);
    } catch (error) {
        if (error instanceof RescueTeamIncidentError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error("Failed to update assigned incident:", error.message);
        return res.status(500).json({ message: "Unable to update incident. Please try again." });
    }
};

const getMyRescueTeam = async (req, res) => {
    try {
        const rescueTeamId = await getAuthenticatedRescueTeamId(req.user.id);
        const result = await pool.query(
            `SELECT id, name, contact_number, latitude, longitude, status, created_at
             FROM rescue_teams
             WHERE id = $1`,
            [rescueTeamId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: ASSOCIATION_MESSAGE });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof RescueTeamIncidentError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error("Failed to fetch authenticated rescue team:", error.message);
        return res.status(500).json({ message: "Failed to fetch rescue team" });
    }
};

module.exports = {
    ASSOCIATION_MESSAGE,
    getMyAssignedIncidents,
    getMyRescueTeam,
    updateMyAssignedIncidentStatus
};
