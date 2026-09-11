const {
    RescueTeamAssociationError,
    associateRescueTeam
} = require("../services/rescueTeamAssociationService");

const setRescueTeamAssociation = async (req, res) => {
    const userId = Number(req.params.userId);
    const requestedTeamId = req.body?.rescue_team_id;
    const rescueTeamId = requestedTeamId === null
        ? null
        : Number(requestedTeamId);

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
            message: "A valid user ID is required"
        });
    }

    if (
        rescueTeamId !== null
        && (!Number.isInteger(rescueTeamId) || rescueTeamId <= 0)
    ) {
        return res.status(400).json({
            message: "A valid rescue team ID is required"
        });
    }

    if (!Object.prototype.hasOwnProperty.call(req.body || {}, "rescue_team_id")) {
        return res.status(400).json({
            message: "rescue_team_id is required"
        });
    }

    try {
        const user = await associateRescueTeam(userId, rescueTeamId);

        return res.json({
            message: rescueTeamId === null
                ? "Rescue team association cleared"
                : "Rescue team associated successfully",
            user
        });
    } catch (error) {
        if (error instanceof RescueTeamAssociationError) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        console.error("Rescue team association failed:", error.message);

        return res.status(500).json({
            message: "Failed to update rescue team association"
        });
    }
};

module.exports = {
    setRescueTeamAssociation
};
