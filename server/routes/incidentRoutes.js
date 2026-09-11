const express = require("express");

const {
    getAllIncidents,
    getMyReportedIncidents,
    createIncident,
    updateIncident,
    deleteIncident
} = require("../controllers/incidentController");
const {
    getMyAssignedIncidents,
    updateMyAssignedIncidentStatus
} = require("../controllers/rescueTeamIncidentController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/my-assigned",
    authenticateToken,
    authorizeRoles("RESCUE_TEAM"),
    getMyAssignedIncidents
);

router.patch(
    "/:id/status",
    authenticateToken,
    authorizeRoles("RESCUE_TEAM"),
    updateMyAssignedIncidentStatus
);

router.get(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getAllIncidents
);

router.get(
    "/my-reports",
    authenticateToken,
    authorizeRoles("CITIZEN"),
    getMyReportedIncidents
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("CITIZEN", "ADMIN"),
    createIncident
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateIncident
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteIncident
);

module.exports = router;
