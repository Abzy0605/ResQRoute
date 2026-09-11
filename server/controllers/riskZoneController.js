const pool = require("../db");
const { validateRiskZone, validateId } = require("../validation");

const getAllRiskZones = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                rz.*,
                d.type AS disaster_type
             FROM risk_zones rz
             LEFT JOIN disasters d ON rz.disaster_id = d.id
             ORDER BY rz.id`
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch risk zones"
        });
    }
};

const createRiskZone = async (req, res) => {
    try {
        const validation = validateRiskZone(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { disaster_id, zone_name, risk_score, risk_level, center_latitude, center_longitude, radius_km } = validation.value;

        const result = await pool.query(
            `INSERT INTO risk_zones
            (
                disaster_id,
                zone_name,
                risk_score,
                risk_level,
                center_latitude,
                center_longitude,
                radius_km
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                disaster_id || null,
                zone_name,
                risk_score,
                risk_level,
                center_latitude,
                center_longitude,
                radius_km
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create risk zone"
        });
    }
};

const updateRiskZone = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid risk zone ID is required" });
        const validation = validateRiskZone(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { disaster_id, zone_name, risk_score, risk_level, center_latitude, center_longitude, radius_km } = validation.value;

        const result = await pool.query(
            `UPDATE risk_zones
             SET disaster_id = $1,
                 zone_name = $2,
                 risk_score = $3,
                 risk_level = $4,
                 center_latitude = $5,
                 center_longitude = $6,
                 radius_km = $7
             WHERE id = $8
             RETURNING *`,
            [
                disaster_id || null,
                zone_name,
                risk_score,
                risk_level,
                center_latitude,
                center_longitude,
                radius_km,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Risk zone not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update risk zone"
        });
    }
};

const deleteRiskZone = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid risk zone ID is required" });

        const result = await pool.query(
            "DELETE FROM risk_zones WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Risk zone not found"
            });
        }

        res.json({
            message: "Risk zone deleted successfully",
            riskZone: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete risk zone"
        });
    }
};

module.exports = {
    getAllRiskZones,
    createRiskZone,
    updateRiskZone,
    deleteRiskZone
};
