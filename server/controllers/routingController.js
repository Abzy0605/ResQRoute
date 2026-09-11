const pool = require("../db");
const { calculateRoute } = require("../services/routingEngine");

const coordinateFields = [
    "start_latitude",
    "start_longitude",
    "destination_latitude",
    "destination_longitude"
];

const validateCoordinates = (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return "Request body must be a JSON object";
    }

    for (const field of coordinateFields) {
        const value = payload[field];

        if (typeof value !== "number" || !Number.isFinite(value)) {
            return `${field} must be a finite number`;
        }
    }

    if (payload.start_latitude < -90 || payload.start_latitude > 90) {
        return "start_latitude must be between -90 and 90";
    }

    if (payload.destination_latitude < -90 || payload.destination_latitude > 90) {
        return "destination_latitude must be between -90 and 90";
    }

    if (payload.start_longitude < -180 || payload.start_longitude > 180) {
        return "start_longitude must be between -180 and 180";
    }

    if (payload.destination_longitude < -180 || payload.destination_longitude > 180) {
        return "destination_longitude must be between -180 and 180";
    }

    return null;
};

const calculateRouting = async (req, res) => {
    const validationError = validateCoordinates(req.body);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    try {
        const result = await pool.query(
            `SELECT
                id,
                road_name,
                start_latitude,
                start_longitude,
                end_latitude,
                end_longitude,
                distance_km,
                risk_level,
                status
             FROM roads
             ORDER BY id`
        );

        const start = {
            latitude: req.body.start_latitude,
            longitude: req.body.start_longitude
        };
        const destination = {
            latitude: req.body.destination_latitude,
            longitude: req.body.destination_longitude
        };

        return res.json(calculateRoute(result.rows, start, destination));
    } catch (error) {
        console.error("Route calculation failed:", error.message);

        return res.status(500).json({
            message: "Failed to calculate route"
        });
    }
};

module.exports = {
    calculateRouting,
    validateCoordinates
};
