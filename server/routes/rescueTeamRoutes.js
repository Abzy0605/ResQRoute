const express = require("express");

const {
    getAllRescueTeams,
    createRescueTeam,
    updateRescueTeam,
    deleteRescueTeam
} = require("../controllers/rescueTeamController");
const { getMyRescueTeam } = require("../controllers/rescueTeamIncidentController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/me",
    authenticateToken,
    authorizeRoles("RESCUE_TEAM"),
    getMyRescueTeam
);

router.get(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getAllRescueTeams
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    createRescueTeam
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateRescueTeam
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteRescueTeam
);

module.exports = router;
