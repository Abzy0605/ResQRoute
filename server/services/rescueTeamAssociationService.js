const pool = require("../db");

class RescueTeamAssociationError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "RescueTeamAssociationError";
        this.statusCode = statusCode;
    }
}

const getRescueTeamIdForUser = async (userId) => {
    const result = await pool.query(
        "SELECT role, rescue_team_id FROM users WHERE id = $1",
        [userId]
    );

    if (result.rows.length === 0 || result.rows[0].role !== "RESCUE_TEAM") {
        return null;
    }

    return result.rows[0].rescue_team_id ?? null;
};

const associateRescueTeam = async (userId, rescueTeamId) => {
    const userResult = await pool.query(
        "SELECT id, name, email, role FROM users WHERE id = $1",
        [userId]
    );

    if (userResult.rows.length === 0) {
        throw new RescueTeamAssociationError("User not found", 404);
    }

    if (userResult.rows[0].role !== "RESCUE_TEAM") {
        throw new RescueTeamAssociationError(
            "Only RESCUE_TEAM users can be associated with a rescue team",
            400
        );
    }

    if (rescueTeamId !== null) {
        const teamResult = await pool.query(
            "SELECT id FROM rescue_teams WHERE id = $1",
            [rescueTeamId]
        );

        if (teamResult.rows.length === 0) {
            throw new RescueTeamAssociationError(
                "Rescue team not found",
                404
            );
        }
    }

    const updateResult = await pool.query(
        `UPDATE users
         SET rescue_team_id = $1
         WHERE id = $2 AND role = 'RESCUE_TEAM'
         RETURNING id, name, email, role, rescue_team_id`,
        [rescueTeamId, userId]
    );

    if (updateResult.rows.length === 0) {
        throw new RescueTeamAssociationError(
            "Only RESCUE_TEAM users can be associated with a rescue team",
            400
        );
    }

    return updateResult.rows[0];
};

module.exports = {
    RescueTeamAssociationError,
    associateRescueTeam,
    getRescueTeamIdForUser
};
