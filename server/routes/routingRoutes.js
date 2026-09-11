const express = require("express");

const {
    calculateRouting
} = require("../controllers/routingController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/calculate",
    authenticateToken,
    authorizeRoles("CITIZEN", "ADMIN", "RESCUE_TEAM"),
    calculateRouting
);

module.exports = router;
