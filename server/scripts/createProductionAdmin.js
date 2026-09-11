const bcrypt = require("bcryptjs");
const pool = require("../db");
const { validateRegistration } = require("../validation");

const requiredEnvironmentVariables = ["ADMIN_NAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"];

const createProductionAdmin = async () => {
    const missing = requiredEnvironmentVariables.filter((name) => !process.env[name]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    const validation = validateRegistration({
        name: process.env.ADMIN_NAME,
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
    });

    if (validation.error) {
        throw new Error(`Invalid production admin input: ${validation.error}`);
    }

    const { name, email, password } = validation.value;
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);

    if (existing.rows.length > 0) {
        console.log(`Admin account already exists for ${email}. No changes were made.`);
        return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
        await pool.query(
            "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)",
            [name, email, passwordHash, "ADMIN"],
        );
    } catch (error) {
        if (error.code === "23505") {
            console.log(`Admin account already exists for ${email}. No changes were made.`);
            return;
        }

        throw error;
    }

    const createdUser = await pool.query(
        "SELECT id, name, email, role FROM users WHERE email = $1",
        [email],
    );

    if (createdUser.rows.length !== 1) {
        throw new Error("Admin account was inserted but could not be verified");
    }

    console.log("Production admin account created and verified:");
    console.table(createdUser.rows);
};

createProductionAdmin()
    .catch((error) => {
        console.error("Production admin setup failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
