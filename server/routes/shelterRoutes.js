const express = require("express");

const {
    getAllShelters,
    createShelter,
    updateShelter,
    deleteShelter
} = require("../controllers/shelterController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/",
    authenticateToken,
    getAllShelters
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    createShelter
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateShelter
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteShelter
);

module.exports = router;