const express = require("express");

const {
    getAllResources,
    createResource,
    updateResource,
    deleteResource
} = require("../controllers/resourceController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getAllResources
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("ADMIN"),
    createResource
);

router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateResource
);

router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deleteResource
);

module.exports = router;
