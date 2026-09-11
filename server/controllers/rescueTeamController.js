const pool = require("../db");
const { validateTeam, validateId } = require("../validation");

const getAllRescueTeams = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM rescue_teams ORDER BY id"
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch rescue teams"
        });
    }
};

const createRescueTeam = async (req, res) => {
    try {
        const validation = validateTeam(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { name, contact_number, latitude, longitude } = validation.value;

        const result = await pool.query(
            `INSERT INTO rescue_teams
            (name, contact_number, latitude, longitude)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [
                name,
                contact_number,
                latitude,
                longitude
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create rescue team"
        });
    }
};

const updateRescueTeam = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid rescue team ID is required" });
        const validation = validateTeam(req.body, true);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { name, contact_number, latitude, longitude, status } = validation.value;

        const result = await pool.query(
            `UPDATE rescue_teams
            SET name = $1,
                contact_number = $2,
                latitude = $3,
                longitude = $4,
                status = $5
            WHERE id = $6
            RETURNING *`,
            [
                name,
                contact_number,
                latitude,
                longitude,
                status,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Rescue team not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update rescue team"
        });
    }
};

const deleteRescueTeam = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid rescue team ID is required" });

        const result = await pool.query(
            "DELETE FROM rescue_teams WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Rescue team not found"
            });
        }

        res.json({
            message: "Rescue team deleted successfully",
            rescueTeam: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete rescue team"
        });
    }
};

module.exports = {
    getAllRescueTeams,
    createRescueTeam,
    updateRescueTeam,
    deleteRescueTeam
};
