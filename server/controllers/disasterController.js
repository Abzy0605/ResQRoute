const pool = require("../db");
const { validateDisaster, validateId } = require("../validation");

const getAllDisasters = async (req, res) => {
    try {
        const result = await pool.query(req.user.role === "ADMIN"
            ? "SELECT * FROM disasters ORDER BY id"
            : "SELECT id, type, severity, latitude, longitude, description, status, created_at FROM disasters WHERE status = 'ACTIVE' ORDER BY id");

        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch disasters"
        });
    }
};

const createDisaster = async (req, res) => {
    try {
        const validation = validateDisaster(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { type, severity, latitude, longitude, description } = validation.value;

        const result = await pool.query(
            `INSERT INTO disasters
            (type, severity, latitude, longitude, description)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [type, severity, latitude, longitude, description]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create disaster"
        });
    }
};

const updateDisaster = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid disaster ID is required" });
        const validation = validateDisaster(req.body, true);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { type, severity, latitude, longitude, description, status } = validation.value;

        const result = await pool.query(
            `UPDATE disasters
            SET type = $1,
                severity = $2,
                latitude = $3,
                longitude = $4,
                description = $5,
                status = $6
            WHERE id = $7
            RETURNING *`,
            [
                type,
                severity,
                latitude,
                longitude,
                description,
                status,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Disaster not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update disaster"
        });
    }
};

const deleteDisaster = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid disaster ID is required" });

        const result = await pool.query(
            "DELETE FROM disasters WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Disaster not found"
            });
        }

        res.json({
            message: "Disaster deleted successfully",
            disaster: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete disaster"
        });
    }
};

module.exports = {
    getAllDisasters,
    createDisaster,
    updateDisaster,
    deleteDisaster
};
