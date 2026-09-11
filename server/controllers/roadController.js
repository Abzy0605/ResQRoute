const pool = require("../db");
const { validateRoad, validateId } = require("../validation");

const getAllRoads = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM roads ORDER BY id"
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch roads"
        });
    }
};

const getRoadStatuses = async (req, res) => {
    try {
        const result = await pool.query("SELECT id, status FROM roads ORDER BY id");
        return res.json(result.rows);
    } catch (error) {
        console.error("Failed to fetch road statuses:", error.message);
        return res.status(500).json({ message: "Failed to fetch road statuses" });
    }
};

const createRoad = async (req, res) => {
    try {
        const validation = validateRoad(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { road_name, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, risk_level } = validation.value;

        const result = await pool.query(
            `INSERT INTO roads
            (
                road_name,
                start_latitude,
                start_longitude,
                end_latitude,
                end_longitude,
                distance_km,
                risk_level
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                road_name,
                start_latitude,
                start_longitude,
                end_latitude,
                end_longitude,
                distance_km,
                risk_level
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create road"
        });
    }
};

const updateRoad = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid road ID is required" });
        const validation = validateRoad(req.body, true);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { road_name, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, risk_level, status } = validation.value;

        const result = await pool.query(
            `UPDATE roads
             SET road_name = $1,
                 start_latitude = $2,
                 start_longitude = $3,
                 end_latitude = $4,
                 end_longitude = $5,
                 distance_km = $6,
                 risk_level = $7,
                 status = $8
             WHERE id = $9
             RETURNING *`,
            [
                road_name,
                start_latitude,
                start_longitude,
                end_latitude,
                end_longitude,
                distance_km,
                risk_level,
                status,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Road not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update road"
        });
    }
};

const deleteRoad = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid road ID is required" });

        const result = await pool.query(
            "DELETE FROM roads WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Road not found"
            });
        }

        res.json({
            message: "Road deleted successfully",
            road: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete road"
        });
    }
};

module.exports = {
    getAllRoads,
    getRoadStatuses,
    createRoad,
    updateRoad,
    deleteRoad
};
