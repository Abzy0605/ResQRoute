const pool = require("../db");
const { validateShelter, validateId } = require("../validation");

const getAllShelters = async (req, res) => {
    try {
        const result = await pool.query(req.user.role === "ADMIN"
            ? "SELECT * FROM shelters ORDER BY id"
            : "SELECT id, name, address, latitude, longitude, capacity, current_occupancy, status FROM shelters ORDER BY id");

        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch shelters"
        });
    }
};

const createShelter = async (req, res) => {
    try {
        const validation = validateShelter(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { name, address, latitude, longitude, capacity } = validation.value;

        const result = await pool.query(
            `INSERT INTO shelters
            (name, address, latitude, longitude, capacity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [name, address, latitude, longitude, capacity]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create shelter"
        });
    }
};

const updateShelter = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid shelter ID is required" });
        const validation = validateShelter(req.body, true);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { name, address, latitude, longitude, capacity, current_occupancy, status } = validation.value;

        const result = await pool.query(
            `UPDATE shelters
            SET name = $1,
                address = $2,
                latitude = $3,
                longitude = $4,
                capacity = $5,
                current_occupancy = $6,
                status = $7
            WHERE id = $8
            RETURNING *`,
            [
                name,
                address,
                latitude,
                longitude,
                capacity,
                current_occupancy,
                status,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Shelter not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update shelter"
        });
    }
};

const deleteShelter = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid shelter ID is required" });

        const result = await pool.query(
            "DELETE FROM shelters WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Shelter not found"
            });
        }

        res.json({
            message: "Shelter deleted successfully",
            shelter: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete shelter"
        });
    }
};

module.exports = {
    getAllShelters,
    createShelter,
    updateShelter,
    deleteShelter
};
