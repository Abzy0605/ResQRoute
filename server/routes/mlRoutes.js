const express = require("express");

const {
    predictFloodSeverity
} = require("../controllers/mlController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/predict",
    authenticateToken,
    authorizeRoles("CITIZEN", "ADMIN", "RESCUE_TEAM"),
    predictFloodSeverity
);

module.exports = router;
