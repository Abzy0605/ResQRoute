const pool = require("../db");
const { validateId, validateIncidentCreate, validateIncidentUpdate } = require("../validation");
const { AdminIncidentError, updateIncidentByAdmin } = require("../services/adminIncidentService");

const incidentSelect = `SELECT i.*, d.type AS disaster_type, u.name AS reporter_name, r.name AS rescue_team_name
 FROM incidents i LEFT JOIN disasters d ON i.disaster_id = d.id
 LEFT JOIN users u ON i.reported_by = u.id LEFT JOIN rescue_teams r ON i.assigned_team_id = r.id`;

const getAllIncidents = async (req, res) => {
    try {
        const result = await pool.query(`${incidentSelect} ORDER BY i.id`);
        return res.json(result.rows);
    } catch (error) {
        console.error("Failed to fetch incidents:", error.message);
        return res.status(500).json({ message: "Failed to fetch incidents" });
    }
};

const getMyReportedIncidents = async (req, res) => {
    try {
        const result = await pool.query(`SELECT i.id, i.disaster_id, i.description, i.latitude, i.longitude, i.severity, i.status, i.created_at, d.type AS disaster_type FROM incidents i LEFT JOIN disasters d ON i.disaster_id = d.id WHERE i.reported_by = $1 ORDER BY i.id`, [req.user.id]);
        return res.json(result.rows);
    } catch (error) {
        console.error("Failed to fetch citizen incidents:", error.message);
        return res.status(500).json({ message: "Failed to fetch incidents" });
    }
};

const createIncident = async (req, res) => {
    const validation = validateIncidentCreate(req.body);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const input = validation.value;
    try {
        const result = await pool.query(`INSERT INTO incidents (disaster_id, reported_by, description, latitude, longitude, severity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [input.disaster_id, req.user.id, input.description, input.latitude, input.longitude, input.severity]);
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Failed to create incident:", error.message);
        return res.status(error.code === "23503" ? 400 : 500).json({ message: error.code === "23503" ? "Disaster not found" : "Failed to create incident" });
    }
};

const updateIncident = async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ message: "A valid incident ID is required" });
    const validation = validateIncidentUpdate(req.body);
    if (validation.error) return res.status(400).json({ message: validation.error });
    try {
        return res.json(await updateIncidentByAdmin(id, validation.value));
    } catch (error) {
        if (error instanceof AdminIncidentError) return res.status(error.statusCode).json({ message: error.message });
        console.error("Failed to update incident:", error.message);
        return res.status(500).json({ message: "Failed to update incident" });
    }
};

const deleteIncident = async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ message: "A valid incident ID is required" });
    try {
        const result = await pool.query("DELETE FROM incidents WHERE id = $1 RETURNING *", [id]);
        if (!result.rows.length) return res.status(404).json({ message: "Incident not found" });
        return res.json({ message: "Incident deleted successfully", incident: result.rows[0] });
    } catch (error) {
        console.error("Failed to delete incident:", error.message);
        return res.status(500).json({ message: "Failed to delete incident" });
    }
};

module.exports = { getAllIncidents, getMyReportedIncidents, createIncident, updateIncident, deleteIncident };
