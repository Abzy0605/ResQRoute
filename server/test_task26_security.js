const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, beforeEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "task-26-security-test-secret-that-is-long-enough";
process.env.CORS_ORIGIN = "http://allowed.example";
process.env.ML_API_URL = "http://127.0.0.1:8000";

const app = require("./server");
const pool = require("./db");
const createRateLimit = require("./middleware/rateLimit");
const { validateEnvironment } = require("./config");
const { requestMlPrediction, requiredFeatures } = require("./services/mlService");
const { calculateRoute } = require("./services/routingEngine");
const { updateIncidentByAdmin, AdminIncidentError } = require("./services/adminIncidentService");
const { validateDisaster } = require("./validation");

let server;
let serverUrl;
let originalQuery;
let originalConnect;

const token = (id, role, expiresIn = "1h") => `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn })}`;
const payload = Object.fromEntries(requiredFeatures.map((feature) => [feature, 1]));

const request = (method, path, { body, authorization, origin, rawBody, headers = {} } = {}) => new Promise((resolve, reject) => {
    const content = rawBody === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : rawBody;
    const url = new URL(path, serverUrl);
    const requestHeaders = { ...headers };
    if (authorization) requestHeaders.authorization = authorization;
    if (origin) requestHeaders.origin = origin;
    if (content !== undefined) {
        requestHeaders["content-type"] ||= "application/json";
        requestHeaders["content-length"] = Buffer.byteLength(content);
    }
    const client = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method, headers: requestHeaders }, (response) => {
        let contentBody = "";
        response.on("data", (chunk) => { contentBody += chunk; });
        response.on("end", () => {
            let parsed;
            try { parsed = contentBody ? JSON.parse(contentBody) : null; } catch { parsed = contentBody; }
            resolve({ statusCode: response.statusCode, body: parsed, headers: response.headers });
        });
    });
    client.on("error", reject);
    if (content !== undefined) client.write(content);
    client.end();
});

before(async () => {
    originalQuery = pool.query;
    originalConnect = pool.connect;
    server = await new Promise((resolve) => {
        const running = app.listen(0, "127.0.0.1", () => resolve(running));
    });
    serverUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
    pool.query = async (sql, params = []) => {
        if (sql.includes("FROM incidents i") && sql.includes("WHERE i.reported_by")) {
            return { rows: [{ id: 11, reported_by: params[0], description: "Own report" }] };
        }
        if (sql.includes("FROM incidents i")) return { rows: [{ id: 99, description: "Admin incident" }] };
        if (sql.includes("FROM disasters")) return { rows: [{ id: 1, type: "FLOOD", status: "ACTIVE" }] };
        if (sql.includes("FROM shelters")) return { rows: [{ id: 2, name: "Safe shelter", status: "AVAILABLE" }] };
        throw new Error(`Unexpected query: ${sql}`);
    };
});

after(async () => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("enforces incident and operational read authorization while retaining reduced public operational reads", async () => {
    assert.equal((await request("GET", "/api/incidents", { authorization: token(1, "CITIZEN") })).statusCode, 403);
    assert.equal((await request("GET", "/api/incidents", { authorization: token(2, "RESCUE_TEAM") })).statusCode, 403);
    assert.equal((await request("GET", "/api/resources", { authorization: token(1, "CITIZEN") })).statusCode, 403);
    assert.equal((await request("GET", "/api/roads", { authorization: token(2, "RESCUE_TEAM") })).statusCode, 403);
    const reports = await request("GET", "/api/incidents/my-reports", { authorization: token(41, "CITIZEN") });
    const disasters = await request("GET", "/api/disasters", { authorization: token(41, "CITIZEN") });
    const shelters = await request("GET", "/api/shelters", { authorization: token(41, "CITIZEN") });
    assert.equal(reports.statusCode, 200);
    assert.equal(reports.body[0].reported_by, 41);
    assert.equal(disasters.statusCode, 200);
    assert.equal(shelters.statusCode, 200);
});

test("rejects absent, invalid, non-Bearer, malformed, and expired authorization", async () => {
    assert.equal((await request("GET", "/api/disasters")).statusCode, 401);
    assert.equal((await request("GET", "/api/disasters", { authorization: "Basic abc" })).statusCode, 401);
    assert.equal((await request("GET", "/api/disasters", { authorization: "Bearer one two" })).statusCode, 401);
    assert.equal((await request("GET", "/api/disasters", { authorization: "Bearer invalid.token.value" })).statusCode, 403);
    assert.equal((await request("GET", "/api/disasters", { authorization: token(1, "CITIZEN", -1) })).statusCode, 403);
});

test("rejects invalid CRUD values before database access", async () => {
    const admin = token(1, "ADMIN");
    const cases = [
        ["POST", "/api/disasters", { type: "Flood", severity: 11, latitude: 0, longitude: 0 }],
        ["POST", "/api/disasters", { type: "Flood", severity: 5, latitude: 91, longitude: 0 }],
        ["POST", "/api/resources", { name: "Water", resource_type: "water", quantity: -1 }],
        ["POST", "/api/shelters", { name: "Shelter", latitude: 0, longitude: 0, capacity: 4, current_occupancy: 5 }],
        ["POST", "/api/roads", { road_name: "Road", start_latitude: 0, start_longitude: 0, end_latitude: 0, end_longitude: 1, distance_km: 0, risk_level: 1 }],
        ["POST", "/api/risk-zones", { zone_name: "Zone", risk_score: 101, risk_level: "HIGH", center_latitude: 0, center_longitude: 0, radius_km: 1 }],
        ["PUT", "/api/resources/not-an-id", { name: "Water", resource_type: "water", quantity: 1, status: "AVAILABLE" }],
        ["PUT", "/api/resources/1", { name: "Water", resource_type: "water", quantity: 1, status: "INVALID" }],
        ["POST", "/api/disasters", { type: "x".repeat(101), severity: 5, latitude: 0, longitude: 0 }]
    ];
    for (const [method, path, body] of cases) {
        const response = await request(method, path, { body, authorization: admin });
        assert.equal(response.statusCode, 400, `${method} ${path}`);
    }
    assert.match(validateDisaster({ type: "Flood", severity: Number.NaN, latitude: 0, longitude: 0 }).error, /finite number/);
});

test("registration and login validation reject unsafe inputs", async () => {
    assert.equal((await request("POST", "/api/auth/register", { body: { name: "A", email: "not-an-email", password: "short" } })).statusCode, 400);
    assert.equal((await request("POST", "/api/auth/login", { body: { email: "", password: "" } })).statusCode, 400);
});

test("server-owned incident fields cannot be overridden by a citizen", async () => {
    let insertParams;
    pool.query = async (sql, params) => {
        if (sql.startsWith("INSERT INTO incidents")) {
            insertParams = params;
            return { rows: [{ id: 50, reported_by: params[1], status: "REPORTED" }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    const response = await request("POST", "/api/incidents", {
        authorization: token(77, "CITIZEN"),
        body: { description: "Need help", latitude: 0, longitude: 0, severity: 4, reported_by: 999, status: "COMPLETED", assigned_team_id: 2 }
    });
    assert.equal(response.statusCode, 201);
    assert.equal(insertParams[1], 77);
    assert.equal(response.body.reported_by, 77);
});

test("safe API hardening behavior is observable", async () => {
    const allowed = await request("GET", "/api/health", { origin: "http://allowed.example" });
    const blocked = await request("GET", "/api/health", { origin: "http://blocked.example" });
    const malformed = await request("POST", "/api/auth/login", { rawBody: "{not-json" });
    const tooLarge = await request("POST", "/api/auth/login", { rawBody: JSON.stringify({ email: "a@b.com", password: "x".repeat(101 * 1024) }) });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.body.status, "ok");
    assert.equal(allowed.headers["x-content-type-options"], "nosniff");
    assert.equal(allowed.headers["x-frame-options"], "DENY");
    assert.equal(allowed.headers["referrer-policy"], "no-referrer");
    assert.equal(allowed.headers["access-control-allow-origin"], "http://allowed.example");
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.body.message, "Origin is not allowed");
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.body.message, "Malformed JSON request body");
    assert.equal(tooLarge.statusCode, 413);
    assert.equal(tooLarge.body.message, "Request body is too large");
});

test("internal errors are sanitized", async () => {
    pool.query = async () => { throw new Error("database password leaked"); };
    const response = await request("GET", "/api/disasters", { authorization: token(1, "ADMIN") });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.message, "Failed to fetch disasters");
    assert.equal(JSON.stringify(response.body).includes("password"), false);
});

test("process-local rate limiter produces a safe 429 response", () => {
    const limit = createRateLimit({ windowMs: 1000, max: 1, message: "Slow down" });
    const makeResponse = () => ({ statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
    let nextCalls = 0;
    limit({ ip: "127.0.0.1", socket: {} }, makeResponse(), () => { nextCalls += 1; });
    const second = makeResponse();
    limit({ ip: "127.0.0.1", socket: {} }, second, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(second.statusCode, 429);
    assert.deepEqual(second.body, { message: "Slow down" });
    assert.ok(second.headers["Retry-After"]);
});

test("environment validation rejects unsafe deployment configuration", () => {
    const valid = { DB_USER: "user", DB_HOST: "localhost", DB_NAME: "db", DB_PASSWORD: "password", DB_PORT: "5432", JWT_SECRET: "x".repeat(32), ML_API_URL: "http://127.0.0.1:8000", ML_API_TIMEOUT_MS: "8000", PORT: "5000", NODE_ENV: "production", CORS_ORIGIN: "https://app.example" };
    assert.equal(validateEnvironment(valid).port, 5000);
    assert.throws(() => validateEnvironment({ ...valid, JWT_SECRET: "short" }), /JWT_SECRET/);
    assert.throws(() => validateEnvironment({ ...valid, PORT: "70000" }), /PORT/);
    assert.throws(() => validateEnvironment({ ...valid, ML_API_TIMEOUT_MS: "0" }), /ML_API_TIMEOUT_MS/);
    assert.throws(() => validateEnvironment({ ...valid, CORS_ORIGIN: "" }), /CORS_ORIGIN/);
});

test("ML timeout and malformed upstream responses are safely rejected", async () => {
    const originalFetch = global.fetch;
    const originalTimeout = process.env.ML_API_TIMEOUT_MS;
    process.env.ML_API_TIMEOUT_MS = "1";
    global.fetch = async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    await assert.rejects(() => requestMlPrediction(payload), (error) => error.statusCode === 502 && error.message === "ML service is unavailable");
    global.fetch = async () => ({ ok: true, json: async () => ({ severe_flood_score: 2, threshold: 0.4, classification: "UNKNOWN" }) });
    await assert.rejects(() => requestMlPrediction(payload), (error) => error.statusCode === 502 && error.message === "ML service returned an invalid response");
    process.env.ML_API_TIMEOUT_MS = originalTimeout;
    global.fetch = originalFetch;
});

test("routing refuses points beyond the maximum graph snap distance while preserving normal routes", () => {
    const road = { id: 1, road_name: "Road", start_latitude: 0, start_longitude: 0, end_latitude: 0, end_longitude: 0.01, distance_km: 1, risk_level: 1, status: "OPEN" };
    assert.equal(calculateRoute([road], { latitude: 10, longitude: 10 }, { latitude: 0, longitude: 0.01 }).route_found, false);
    assert.equal(calculateRoute([road], { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 }).route_found, true);
});

test("admin incident workflow enforces assignment invariants and rolls back consistently", async () => {
    const state = { incidents: { 1: { id: 1, assigned_team_id: 1, status: "ASSIGNED" } }, teams: { 1: { id: 1, status: "ASSIGNED" }, 2: { id: 2, status: "AVAILABLE" } } };
    let snapshot;
    pool.connect = async () => ({
        query: async (sql, params = []) => {
            if (sql === "BEGIN") { snapshot = structuredClone(state); return { rows: [] }; }
            if (sql === "COMMIT") return { rows: [] };
            if (sql === "ROLLBACK") { Object.assign(state, snapshot); return { rows: [] }; }
            if (sql.startsWith("SELECT id, assigned_team_id")) return { rows: [state.incidents[params[0]]] };
            if (sql.startsWith("SELECT id FROM rescue_teams")) return { rows: state.teams[params[0]] ? [{ id: params[0] }] : [] };
            if (sql.startsWith("UPDATE incidents")) { Object.assign(state.incidents[params[6]], { description: params[0], latitude: params[1], longitude: params[2], severity: params[3], status: params[4], assigned_team_id: params[5] }); return { rows: [state.incidents[params[6]]] }; }
            if (sql.startsWith("SELECT status FROM incidents")) return { rows: Object.values(state.incidents).filter((incident) => incident.assigned_team_id === params[0] && params[1].includes(incident.status)).map((incident) => ({ status: incident.status })) };
            if (sql.startsWith("UPDATE rescue_teams")) { state.teams[params[1]].status = params[0]; return { rows: [state.teams[params[1]]] }; }
            throw new Error(`Unexpected workflow query: ${sql}`);
        },
        release() {}
    });
    const input = { description: "Updated", latitude: 1, longitude: 2, severity: 5, status: "EN_ROUTE", assigned_team_id: 2 };
    const result = await updateIncidentByAdmin(1, input);
    assert.equal(result.incident.assigned_team_id, 2);
    assert.equal(state.teams[1].status, "AVAILABLE");
    assert.equal(state.teams[2].status, "EN_ROUTE");
    const unassigned = await updateIncidentByAdmin(1, { ...input, assigned_team_id: null, status: "COMPLETED" });
    assert.equal(unassigned.incident.assigned_team_id, null);
    assert.equal(state.teams[2].status, "AVAILABLE");
    const beforeInvalid = structuredClone(state);
    await assert.rejects(() => updateIncidentByAdmin(1, { ...input, assigned_team_id: null, status: "ON_SCENE" }), (error) => error instanceof AdminIncidentError && error.statusCode === 400);
    assert.deepEqual(state, beforeInvalid);
});
