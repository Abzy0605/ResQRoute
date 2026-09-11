const express = require("express");

const {
    setRescueTeamAssociation
} = require("../controllers/rescueTeamAssociationController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.put(
    "/:userId",
    authenticateToken,
    authorizeRoles("ADMIN"),
    setRescueTeamAssociation
);

module.exports = router;
