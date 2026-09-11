const express = require("express");

const {
    getAllRoads,
    getRoadStatuses,
    createRoad,
    updateRoad,
    deleteRoad
} = require("../controllers/roadController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/route-status",
    authenticateToken,
    authorizeRoles("CITIZEN", "ADMIN", "RESCUE_TEAM"),
    getRoadStatuses
);

router.get(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getAllRoads
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    createRoad
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateRoad
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteRoad
);

module.exports = router;
