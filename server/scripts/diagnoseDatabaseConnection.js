const dns = require("dns");
const net = require("net");
const dotenv = require("dotenv");
const { Client } = require("pg");

const environmentKeys = [
    "DB_USER",
    "DB_HOST",
    "DB_NAME",
    "DB_PASSWORD",
    "DB_PORT",
    "DB_SSL",
    "DB_SSL_REJECT_UNAUTHORIZED",
];
const initialEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, Boolean(process.env[key])]),
);
const dotenvResult = dotenv.config();

const redactSensitiveText = (value) => String(value)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1<redacted>@")
    .replace(/(password\s*=\s*)[^\s,;]+/gi, "$1<redacted>")
    .replace(/(jwt[_ -]?secret\s*=\s*)[^\s,;]+/gi, "$1<redacted>");

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

const sourceFor = (key) => {
    if (initialEnvironment[key]) return "process environment";
    if (dotenvResult.parsed && Object.hasOwn(dotenvResult.parsed, key)) return ".env";
    return "unset";
};

const probeTcp = (address, family, port, timeoutMs) => new Promise((resolve) => {
    const socket = net.createConnection({ host: address, port, family });
    let settled = false;
    const finish = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
    };

    socket.setTimeout(timeoutMs, () => finish({ success: false, code: "ETIMEDOUT" }));
    socket.once("connect", () => finish({ success: true }));
    socket.once("error", (error) => finish({
        success: false,
        code: error.code || "UNKNOWN",
        message: error.message || undefined,
    }));
});

const resultForDns = async (label, operation) => {
    try {
        return { label, result: await operation() };
    } catch (error) {
        return {
            label,
            error: {
                code: error.code || "UNKNOWN",
                message: redactSensitiveText(error.message || "Unknown error"),
            },
        };
    }
};

const main = async () => {
    const host = process.env.DB_HOST;
    const port = readPort(process.env.DB_PORT);
    const useSsl = readBoolean(process.env.DB_SSL, "DB_SSL", false);
    const rejectUnauthorized = readBoolean(
        process.env.DB_SSL_REJECT_UNAUTHORIZED,
        "DB_SSL_REJECT_UNAUTHORIZED",
        true,
    );
    const timeoutMs = 10000;
    const configuration = {
        host,
        port,
        ssl: useSsl,
        rejectUnauthorized: useSsl ? rejectUnauthorized : null,
        node: process.version,
        pg: require("pg/package.json").version,
        environmentSources: Object.fromEntries(environmentKeys.map((key) => [key, sourceFor(key)])),
        requiredValuesPresent: Object.fromEntries(
            ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD"].map((key) => [key, Boolean(process.env[key])]),
        ),
    };
    console.log("Database diagnostic configuration (no credentials are printed):");
    console.log(JSON.stringify(configuration, null, 2));

    if (!host) throw new Error("DB_HOST is required for the database diagnostic");

    const dnsResults = await Promise.all([
        resultForDns("lookup(all)", () => dns.promises.lookup(host, { all: true })),
        resultForDns("resolve4", () => dns.promises.resolve4(host)),
        resultForDns("resolve6", () => dns.promises.resolve6(host)),
    ]);
    console.log("DNS results:");
    console.log(JSON.stringify(dnsResults, null, 2));

    const addresses = new Map();
    for (const entry of dnsResults) {
        if (!entry.result) continue;
        if (entry.label === "lookup(all)") {
            entry.result.forEach(({ address, family }) => addresses.set(`${address}/${family}`, { address, family }));
        } else {
            const family = entry.label === "resolve4" ? 4 : 6;
            entry.result.forEach((address) => addresses.set(`${address}/${family}`, { address, family }));
        }
    }

    const probes = await Promise.all(
        [...addresses.values()].map(async ({ address, family }) => ({
            address,
            family,
            port,
            ...(await probeTcp(address, family, port, timeoutMs)),
        })),
    );
    console.log(`Raw TCP probes (each has a ${timeoutMs} ms timeout):`);
    console.log(JSON.stringify(probes, null, 2));

    const client = new Client({
        user: process.env.DB_USER,
        host,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port,
        ssl: useSsl ? { rejectUnauthorized } : undefined,
        connectionTimeoutMillis: timeoutMs,
    });
    try {
        await client.connect();
        console.log("pg connection: succeeded (no SQL was executed).");
    } catch (error) {
        console.log(`pg connection: failed; code: ${error.code || "UNKNOWN"}; message: ${redactSensitiveText(error.message || "Unknown error")}`);
        process.exitCode = 1;
    } finally {
        await client.end().catch(() => {});
    }
};

main().catch((error) => {
    console.error(`Database diagnostic failed: code: ${error.code || "UNKNOWN"}; message: ${redactSensitiveText(error.message || "Unknown error")}`);
    process.exitCode = 1;
});
