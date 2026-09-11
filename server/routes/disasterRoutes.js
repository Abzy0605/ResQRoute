const express = require("express");

const {
    getAllDisasters,
    createDisaster,
    updateDisaster,
    deleteDisaster
} = require("../controllers/disasterController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/",
    authenticateToken,
    getAllDisasters
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    createDisaster
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateDisaster
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteDisaster
);

module.exports = router;