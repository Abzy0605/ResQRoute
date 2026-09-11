const express = require("express");

const {
    getAllRiskZones,
    createRiskZone,
    updateRiskZone,
    deleteRiskZone
} = require("../controllers/riskZoneController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getAllRiskZones
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    createRiskZone
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateRiskZone
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteRiskZone
);

module.exports = router;
