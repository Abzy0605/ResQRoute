const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, beforeEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "rescue-team-workflow-test-secret";

const pool = require("./db");
const app = require("./server");

let server;
let serverUrl;
let originalQuery;
let originalConnect;
let state;
let transactionSnapshot;
let clientLog;

const makeState = () => ({
    associations: {
        10: { role: "RESCUE_TEAM", rescue_team_id: 1 },
        20: { role: "RESCUE_TEAM", rescue_team_id: 2 },
        30: { role: "RESCUE_TEAM", rescue_team_id: null }
    },
    teams: {
        1: { id: 1, name: "Team One", contact_number: "111", status: "ASSIGNED" },
        2: { id: 2, name: "Team Two", contact_number: "222", status: "ASSIGNED" }
    },
    incidents: {
        101: { id: 101, assigned_team_id: 1, status: "ASSIGNED", description: "Team one incident", severity: 5, latitude: 12.1, longitude: 77.1, disaster_type: "FLOOD", reporter_name: "Citizen", created_at: "2026-01-01T00:00:00.000Z" },
        102: { id: 102, assigned_team_id: 2, status: "ASSIGNED", description: "Team two incident", severity: 7, latitude: 12.2, longitude: 77.2, disaster_type: "FLOOD", reporter_name: "Other Citizen", created_at: "2026-01-02T00:00:00.000Z" }
    },
    failTeamUpdate: false
});

const cloneTransactionState = () => ({
    incidents: structuredClone(state.incidents),
    teams: structuredClone(state.teams)
});

const fakeQuery = async (sql, params = []) => {
    if (sql.startsWith("SELECT role, rescue_team_id FROM users")) {
        const association = state.associations[params[0]];
        return { rows: association ? [association] : [] };
    }

    if (sql.includes("FROM incidents i") && sql.includes("WHERE i.assigned_team_id")) {
        return {
            rows: Object.values(state.incidents)
                .filter((incident) => incident.assigned_team_id === params[0])
                .map((incident) => ({
                    ...incident,
                    rescue_team_name: state.teams[incident.assigned_team_id].name
                }))
        };
    }

    if (sql.startsWith("SELECT id, name, contact_number, latitude")) {
        const team = state.teams[params[0]];
        return { rows: team ? [{ ...team }] : [] };
    }

    throw new Error(`Unexpected pool query: ${sql}`);
};

const fakeClientQuery = async (sql, params = []) => {
    clientLog.push(sql);

    if (sql === "BEGIN") {
        transactionSnapshot = cloneTransactionState();
        return { rows: [] };
    }
    if (sql === "COMMIT") {
        transactionSnapshot = null;
        return { rows: [] };
    }
    if (sql === "ROLLBACK") {
        if (transactionSnapshot) {
            state.incidents = transactionSnapshot.incidents;
            state.teams = transactionSnapshot.teams;
        }
        transactionSnapshot = null;
        return { rows: [] };
    }
    if (sql.startsWith("SELECT id FROM rescue_teams")) {
        const team = state.teams[params[0]];
        return { rows: team ? [{ id: team.id }] : [] };
    }
    if (sql.startsWith("SELECT id, status\n             FROM incidents")) {
        const incident = state.incidents[params[0]];
        return {
            rows: incident && incident.assigned_team_id === params[1]
                ? [{ id: incident.id, status: incident.status }]
                : []
        };
    }
    if (sql.startsWith("UPDATE incidents")) {
        const incident = state.incidents[params[1]];
        incident.status = params[0];
        return { rows: [{ ...incident }] };
    }
    if (sql.startsWith("SELECT status\n             FROM incidents")) {
        return {
            rows: Object.values(state.incidents)
                .filter((incident) => incident.assigned_team_id === params[0]
                    && params[1].includes(incident.status))
                .map((incident) => ({ status: incident.status }))
        };
    }
    if (sql.startsWith("UPDATE rescue_teams")) {
        if (state.failTeamUpdate) throw new Error("team update failed");
        const team = state.teams[params[1]];
        team.status = params[0];
        return { rows: [{ ...team }] };
    }

    throw new Error(`Unexpected client query: ${sql}`);
};

const authHeader = (id, role = "RESCUE_TEAM") => `Bearer ${jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
)}`;

const request = (method, path, { body, authorization } = {}) => new Promise((resolve, reject) => {
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    const url = new URL(path, serverUrl);
    const headers = {};
    if (authorization) headers.authorization = authorization;
    if (requestBody !== undefined) {
        headers["content-type"] = "application/json";
        headers["content-length"] = Buffer.byteLength(requestBody);
    }

    const clientRequest = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers
    }, (response) => {
        let responseBody = "";
        response.on("data", (chunk) => { responseBody += chunk; });
        response.on("end", () => resolve({
            statusCode: response.statusCode,
            body: responseBody ? JSON.parse(responseBody) : null
        }));
    });

    clientRequest.on("error", reject);
    if (requestBody !== undefined) clientRequest.write(requestBody);
    clientRequest.end();
});

before(async () => {
    originalQuery = pool.query;
    originalConnect = pool.connect;
    server = await new Promise((resolve) => {
        const runningServer = app.listen(0, "127.0.0.1", () => resolve(runningServer));
    });
    serverUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
    state = makeState();
    clientLog = [];
    transactionSnapshot = null;
    pool.query = fakeQuery;
    pool.connect = async () => ({
        query: fakeClientQuery,
        release() {}
    });
});

after(async () => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

test("rejects unauthenticated team incident requests", async () => {
    const response = await request("GET", "/api/incidents/my-assigned");
    assert.equal(response.statusCode, 401);
});

test("rejects Citizen and Admin access to rescue team endpoints", async () => {
    const citizen = await request("GET", "/api/incidents/my-assigned", {
        authorization: authHeader(1, "CITIZEN")
    });
    const admin = await request("PATCH", "/api/incidents/101/status", {
        authorization: authHeader(2, "ADMIN"),
        body: { status: "EN_ROUTE" }
    });
    assert.equal(citizen.statusCode, 403);
    assert.equal(admin.statusCode, 403);
});

test("rejects an unassociated rescue team user", async () => {
    const response = await request("GET", "/api/incidents/my-assigned", {
        authorization: authHeader(30)
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, "Your account is not associated with a rescue team.");
});

test("returns only the authenticated team's assigned incidents and team profile", async () => {
    const incidents = await request("GET", "/api/incidents/my-assigned", {
        authorization: authHeader(10)
    });
    const team = await request("GET", "/api/rescue-teams/me", {
        authorization: authHeader(10)
    });

    assert.equal(incidents.statusCode, 200);
    assert.deepEqual(incidents.body.map((incident) => incident.id), [101]);
    assert.equal(incidents.body[0].rescue_team_name, "Team One");
    assert.equal(team.statusCode, 200);
    assert.equal(team.body.id, 1);
    assert.equal(team.body.name, "Team One");
});

test("does not reveal or update another team's incident", async () => {
    const response = await request("PATCH", "/api/incidents/102/status", {
        authorization: authHeader(10),
        body: { status: "EN_ROUTE" }
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.message, "Incident not found.");
    assert.equal(state.incidents[102].status, "ASSIGNED");
});

test("only accepts the dedicated status field", async () => {
    const response = await request("PATCH", "/api/incidents/101/status", {
        authorization: authHeader(10),
        body: {
            status: "EN_ROUTE",
            assigned_team_id: 2,
            description: "changed",
            latitude: 0,
            longitude: 0,
            severity: 10,
            disaster_id: 99
        }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(state.incidents[101].status, "EN_ROUTE");
    assert.equal(state.incidents[101].assigned_team_id, 1);
    assert.equal(state.incidents[101].description, "Team one incident");
    assert.equal(state.incidents[101].latitude, 12.1);
    assert.equal(state.incidents[101].severity, 5);
});

test("enforces ASSIGNED to EN_ROUTE and synchronizes the team", async () => {
    const response = await request("PATCH", "/api/incidents/101/status", {
        authorization: authHeader(10),
        body: { status: "EN_ROUTE" }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.incident.status, "EN_ROUTE");
    assert.equal(response.body.team.status, "EN_ROUTE");
    assert.equal(state.teams[1].status, "EN_ROUTE");
});

test("enforces the complete valid operational progression", async () => {
    for (const status of ["EN_ROUTE", "ON_SCENE", "COMPLETED"]) {
        const response = await request("PATCH", "/api/incidents/101/status", {
            authorization: authHeader(10),
            body: { status }
        });
        assert.equal(response.statusCode, 200);
    }

    assert.equal(state.incidents[101].status, "COMPLETED");
    assert.equal(state.teams[1].status, "AVAILABLE");
});

test("rejects skipped, backward, reported, and completed transitions", async () => {
    const attempts = [
        ["ASSIGNED", "ON_SCENE"],
        ["ASSIGNED", "COMPLETED"],
        ["REPORTED", "EN_ROUTE"],
        ["EN_ROUTE", "COMPLETED"],
        ["ON_SCENE", "EN_ROUTE"],
        ["COMPLETED", "ON_SCENE"]
    ];

    for (const [currentStatus, requestedStatus] of attempts) {
        state.incidents[101].status = currentStatus;
        const response = await request("PATCH", "/api/incidents/101/status", {
            authorization: authHeader(10),
            body: { status: requestedStatus }
        });
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.message, "Invalid incident status transition.");
        assert.equal(state.incidents[101].status, currentStatus);
    }
});

test("handles an unknown incident without leaking ownership", async () => {
    const response = await request("PATCH", "/api/incidents/999/status", {
        authorization: authHeader(10),
        body: { status: "EN_ROUTE" }
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.message, "Incident not found.");
});

test("keeps a team operational when another active incident remains", async () => {
    state.incidents[103] = {
        ...state.incidents[101],
        id: 103,
        status: "ON_SCENE",
        description: "Another active incident"
    };
    state.incidents[101].status = "ON_SCENE";

    const response = await request("PATCH", "/api/incidents/101/status", {
        authorization: authHeader(10),
        body: { status: "COMPLETED" }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(state.teams[1].status, "ON_SCENE");
});

test("rolls back the incident update when team synchronization fails", async () => {
    state.failTeamUpdate = true;
    const response = await request("PATCH", "/api/incidents/101/status", {
        authorization: authHeader(10),
        body: { status: "EN_ROUTE" }
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.message, "Unable to update incident. Please try again.");
    assert.equal(state.incidents[101].status, "ASSIGNED");
    assert.equal(state.teams[1].status, "ASSIGNED");
    assert.ok(clientLog.includes("BEGIN"));
    assert.ok(clientLog.includes("ROLLBACK"));
});
