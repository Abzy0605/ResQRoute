const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const validatePort = (value, name = "PORT") => {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be an integer between 1 and 65535`);
    }
    return port;
};

const validateMlApiUrl = (value) => {
    if (!isNonEmptyString(value)) throw new Error("ML_API_URL is required");
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error("ML_API_URL must be an absolute HTTP(S) URL");
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error("ML_API_URL must be an absolute HTTP(S) URL");
    }
    return url.toString().replace(/\/$/, "");
};

const validateMlTimeout = (value) => {
    const timeout = Number(value);
    if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(timeout)) {
        throw new Error("ML_API_TIMEOUT_MS must be a positive integer duration in milliseconds");
    }
    return timeout;
};

const validateEnvironment = (env = process.env) => {
    const required = ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD", "DB_PORT", "JWT_SECRET", "ML_API_URL"];
    const missing = required.filter((name) => !isNonEmptyString(env[name]));
    if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    if (env.JWT_SECRET.trim().length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

    const nodeEnv = env.NODE_ENV || "development";
    if (nodeEnv === "production" && !isNonEmptyString(env.CORS_ORIGIN)) {
        throw new Error("CORS_ORIGIN is required in production");
    }

    return {
        port: env.PORT === undefined || env.PORT === "" ? 5000 : validatePort(env.PORT),
        dbPort: validatePort(env.DB_PORT, "DB_PORT"),
        mlApiUrl: validateMlApiUrl(env.ML_API_URL),
        mlTimeoutMs: validateMlTimeout(env.ML_API_TIMEOUT_MS === undefined || env.ML_API_TIMEOUT_MS === "" ? 8000 : env.ML_API_TIMEOUT_MS)
    };
};

module.exports = { validateEnvironment, validateMlApiUrl, validateMlTimeout, validatePort };
