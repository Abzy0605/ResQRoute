const pool = require("../db");
const { validateResource, validateId } = require("../validation");

const getAllResources = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM resources ORDER BY id"
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch resources"
        });
    }
};

const createResource = async (req, res) => {
    try {
        const validation = validateResource(req.body);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { name, resource_type, quantity, location } = validation.value;

        const result = await pool.query(
            `INSERT INTO resources
            (name, resource_type, quantity, location)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [
                name,
                resource_type,
                quantity,
                location
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create resource"
        });
    }
};

const updateResource = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid resource ID is required" });
        const validation = validateResource(req.body, true);
        if (validation.error) return res.status(400).json({ message: validation.error });
        const { name, resource_type, quantity, location, status } = validation.value;

        const result = await pool.query(
            `UPDATE resources
             SET name = $1,
                 resource_type = $2,
                 quantity = $3,
                 location = $4,
                 status = $5
             WHERE id = $6
             RETURNING *`,
            [
                name,
                resource_type,
                quantity,
                location,
                status,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Resource not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update resource"
        });
    }
};

const deleteResource = async (req, res) => {
    try {
        const id = validateId(req.params.id);
        if (!id) return res.status(400).json({ message: "A valid resource ID is required" });

        const result = await pool.query(
            "DELETE FROM resources WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Resource not found"
            });
        }

        res.json({
            message: "Resource deleted successfully",
            resource: result.rows[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete resource"
        });
    }
};

module.exports = {
    getAllResources,
    createResource,
    updateResource,
    deleteResource
};
