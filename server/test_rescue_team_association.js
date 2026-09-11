const assert = require("node:assert/strict");
const http = require("node:http");
const { test, before, after } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "association-test-secret";

const pool = require("./db");
const app = require("./server");
const {
    RescueTeamAssociationError,
    associateRescueTeam,
    getRescueTeamIdForUser
} = require("./services/rescueTeamAssociationService");

let server;
let serverUrl;
let originalQuery;

const authHeader = (role) => `Bearer ${jwt.sign(
    { id: 10, role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
)}`;

const request = (path, { body, authorization } = {}) => new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(body ?? {});
    const url = new URL(path, serverUrl);
    const headers = {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(requestBody)
    };

    if (authorization) headers.authorization = authorization;

    const clientRequest = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "PUT",
        headers
    }, (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
            responseBody += chunk;
        });
        response.on("end", () => resolve({
            statusCode: response.statusCode,
            body: JSON.parse(responseBody)
        }));
    });

    clientRequest.on("error", reject);
    clientRequest.write(requestBody);
    clientRequest.end();
});

before(async () => {
    originalQuery = pool.query;
    server = await new Promise((resolve) => {
        const runningServer = app.listen(0, "127.0.0.1", () => resolve(runningServer));
    });
    serverUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    pool.query = originalQuery;
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

test("resolves a rescue team association for a RESCUE_TEAM user", async () => {
    pool.query = async () => ({
        rows: [{ role: "RESCUE_TEAM", rescue_team_id: 7 }]
    });

    assert.equal(await getRescueTeamIdForUser(10), 7);
});

test("does not resolve a CITIZEN with a null association", async () => {
    pool.query = async () => ({
        rows: [{ role: "CITIZEN", rescue_team_id: null }]
    });

    assert.equal(await getRescueTeamIdForUser(10), null);
});

test("does not resolve an ADMIN as a rescue team", async () => {
    pool.query = async () => ({
        rows: [{ role: "ADMIN", rescue_team_id: null }]
    });

    assert.equal(await getRescueTeamIdForUser(10), null);
});

test("rejects association to a nonexistent rescue team", async () => {
    pool.query = async (sql) => {
        if (sql.startsWith("SELECT id, name")) {
            return { rows: [{ id: 10, role: "RESCUE_TEAM" }] };
        }

        return { rows: [] };
    };

    await assert.rejects(
        associateRescueTeam(10, 999),
        (error) => error instanceof RescueTeamAssociationError
            && error.statusCode === 404
            && error.message === "Rescue team not found"
    );
});

test("rejects association for a non-RESCUE_TEAM user", async () => {
    pool.query = async () => ({
        rows: [{ id: 10, role: "CITIZEN" }]
    });

    await assert.rejects(
        associateRescueTeam(10, 7),
        (error) => error instanceof RescueTeamAssociationError
            && error.statusCode === 400
    );
});

test("rejects unauthenticated association requests", async () => {
    const response = await request("/api/admin/rescue-team-associations/10", {
        body: { rescue_team_id: 7 }
    });

    assert.equal(response.statusCode, 401);
});

test("rejects Citizen association requests", async () => {
    const response = await request("/api/admin/rescue-team-associations/10", {
        body: { rescue_team_id: 7 },
        authorization: authHeader("CITIZEN")
    });

    assert.equal(response.statusCode, 403);
});

test("rejects Rescue Team association requests", async () => {
    const response = await request("/api/admin/rescue-team-associations/10", {
        body: { rescue_team_id: 7 },
        authorization: authHeader("RESCUE_TEAM")
    });

    assert.equal(response.statusCode, 403);
});

test("rejects invalid association IDs", async () => {
    const response = await request("/api/admin/rescue-team-associations/10", {
        body: { rescue_team_id: "not-an-id" },
        authorization: authHeader("ADMIN")
    });

    assert.equal(response.statusCode, 400);
});

test("allows Admin to associate only an existing RESCUE_TEAM user and team", async () => {
    const queries = [];
    pool.query = async (sql, params) => {
        queries.push({ sql, params });

        if (sql.startsWith("SELECT id, name")) {
            return { rows: [{ id: 10, name: "Field User", email: "team@example.com", role: "RESCUE_TEAM" }] };
        }

        if (sql.startsWith("SELECT id FROM rescue_teams")) {
            return { rows: [{ id: 7 }] };
        }

        return {
            rows: [{
                id: 10,
                name: "Field User",
                email: "team@example.com",
                role: "RESCUE_TEAM",
                rescue_team_id: 7
            }]
        };
    };

    const response = await request("/api/admin/rescue-team-associations/10", {
        body: { rescue_team_id: 7 },
        authorization: authHeader("ADMIN")
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.user.rescue_team_id, 7);
    assert.deepEqual(queries.at(-1).params, [7, 10]);
});
