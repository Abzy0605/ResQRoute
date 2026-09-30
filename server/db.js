const { Pool } = require("pg");
require("dotenv").config();

const readBoolean = (value, name, defaultValue) => {
    if (value === undefined || value === "") return defaultValue;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${name} must be either true or false`);
};

const readPort = (value) => {
    const port = Number(value || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("DB_PORT must be an integer between 1 and 65535");
    }
    return port;
};

const useSsl = readBoolean(process.env.DB_SSL, "DB_SSL", false);
const rejectUnauthorized = readBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
    "DB_SSL_REJECT_UNAUTHORIZED",
    true,
);

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: readPort(process.env.DB_PORT),
    ssl: useSsl ? { rejectUnauthorized } : undefined,
});

module.exports = pool;
