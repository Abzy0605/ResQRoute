const express = require("express");

const {
    predictRisk
} = require("../controllers/riskController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/calculate",
    authenticateToken,
    authorizeRoles("CITIZEN", "ADMIN", "RESCUE_TEAM"),
    predictRisk
);

module.exports = router;
