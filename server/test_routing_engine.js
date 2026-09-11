const assert = require("node:assert/strict");
const http = require("node:http");
const { test, before, after } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "routing-engine-test-secret";

const pool = require("./db");
const app = require("./server");
const {
    RISK_WEIGHT,
    calculateRoute,
    edgeCost,
    nodeKey
} = require("./services/routingEngine");

let server;
let serverUrl;

const road = (overrides = {}) => ({
    id: 1,
    road_name: "Test Road",
    start_latitude: 0,
    start_longitude: 0,
    end_latitude: 0,
    end_longitude: 0.01,
    distance_km: 1,
    risk_level: 1,
    status: "OPEN",
    ...overrides
});

const route = (roads, start = { latitude: 0, longitude: 0 }, destination = { latitude: 0, longitude: 0.01 }) => (
    calculateRoute(roads, start, destination)
);

const authHeader = (role = "CITIZEN") => {
    const token = jwt.sign(
        { id: 1, role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );

    return `Bearer ${token}`;
};

const request = (path, { body, authorization } = {}) => {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify(body);
        const requestUrl = new URL(path, serverUrl);
        const headers = {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(requestBody)
        };

        if (authorization) {
            headers.authorization = authorization;
        }

        const clientRequest = http.request(
            {
                hostname: requestUrl.hostname,
                port: requestUrl.port,
                path: requestUrl.pathname,
                method: "POST",
                headers
            },
            (response) => {
                let responseBody = "";

                response.on("data", (chunk) => {
                    responseBody += chunk;
                });

                response.on("end", () => {
                    resolve({
                        statusCode: response.statusCode,
                        body: JSON.parse(responseBody)
                    });
                });
            }
        );

        clientRequest.on("error", reject);
        clientRequest.write(requestBody);
        clientRequest.end();
    });
};

before(async () => {
    server = await new Promise((resolve) => {
        const runningServer = app.listen(0, "127.0.0.1", () => {
            resolve(runningServer);
        });
    });

    serverUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

test("finds a route across a simple graph", () => {
    const result = route([road()]);

    assert.equal(result.route_found, true);
    assert.deepEqual(result.roads.map((item) => item.id), [1]);
    assert.equal(result.number_of_roads, 1);
});

test("selects the shorter route when risk is equal", () => {
    const roads = [
        road({ id: 1, road_name: "Short", distance_km: 2 }),
        road({
            id: 2,
            road_name: "Long A",
            end_longitude: 0.02,
            distance_km: 3
        }),
        road({
            id: 3,
            road_name: "Long B",
            start_longitude: 0.02,
            distance_km: 3
        })
    ];

    const result = route(roads);

    assert.deepEqual(result.roads.map((item) => item.id), [1]);
});

test("selects a longer low-risk route over a shorter high-risk route", () => {
    const roads = [
        road({ id: 1, road_name: "Short Risky", distance_km: 10, risk_level: 8 }),
        road({
            id: 2,
            road_name: "Safe A",
            end_longitude: 0.02,
            distance_km: 6,
            risk_level: 1
        }),
        road({
            id: 3,
            road_name: "Safe B",
            start_longitude: 0.02,
            distance_km: 6,
            risk_level: 1
        })
    ];

    const result = route(roads);

    assert.deepEqual(result.roads.map((item) => item.id), [2, 3]);
    assert.equal(result.total_cost, edgeCost(6, 1) * 2);
});

test("never uses blocked roads and reports them", () => {
    const result = route([
        road({ id: 1, status: "BLOCKED" })
    ]);

    assert.equal(result.route_found, false);
    assert.deepEqual(result.blocked_roads, [
        { id: 1, road_name: "Test Road" }
    ]);
});

test("returns no route for disconnected components", () => {
    const result = route([
        road({ id: 1 }),
        road({
            id: 2,
            start_latitude: 1,
            start_longitude: 1,
            end_latitude: 1,
            end_longitude: 1.01
        })
    ], { latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1.01 });

    assert.equal(result.route_found, false);
    assert.equal(result.message, "No safe route available");
});

test("returns no route for an empty road dataset", () => {
    const result = route([]);

    assert.equal(result.route_found, false);
    assert.equal(result.message, "No safe route available");
    assert.deepEqual(result.blocked_roads, []);
});

test("maps coordinates to the nearest graph nodes", () => {
    const result = route(
        [road()],
        { latitude: 0.00001, longitude: 0.00001 },
        { latitude: 0.00001, longitude: 0.01001 }
    );

    assert.equal(result.route_found, true);
    assert.equal(result.nearest_start_node.key, nodeKey(0, 0));
    assert.equal(result.nearest_destination_node.key, nodeKey(0, 0.01));
});

test("traverses roads in both directions", () => {
    const result = route(
        [road()],
        { latitude: 0, longitude: 0.01 },
        { latitude: 0, longitude: 0 }
    );

    assert.equal(result.route_found, true);
    assert.deepEqual(result.roads.map((item) => item.id), [1]);
});

test("calculates route metrics", () => {
    const result = route([
        road({ distance_km: 2, risk_level: 2 }),
        road({
            id: 2,
            start_longitude: 0.01,
            end_longitude: 0.02,
            distance_km: 3,
            risk_level: 4
        })
    ], { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.02 });

    assert.equal(result.total_distance_km, 5);
    assert.equal(result.total_cost, edgeCost(2, 2) + edgeCost(3, 4));
    assert.equal(result.maximum_risk_level, 4);
    assert.equal(result.average_risk_level, 3);
    assert.equal(result.number_of_roads, 2);
});

test("handles cycles without getting stuck", () => {
    const result = route([
        road({ id: 1 }),
        road({
            id: 2,
            start_longitude: 0.01,
            end_longitude: 0.02,
            distance_km: 1
        }),
        road({
            id: 3,
            start_longitude: 0.02,
            end_longitude: 0,
            distance_km: 1
        })
    ]);

    assert.equal(result.route_found, true);
    assert.ok(result.number_of_roads <= 2);
});

test("returns a zero-road route when both coordinates map to one node", () => {
    const result = calculateRoute(
        [road({
            end_latitude: 0,
            end_longitude: 0
        })],
        { latitude: 0.00001, longitude: 0.00001 },
        { latitude: 0.00002, longitude: 0.00002 }
    );

    assert.equal(result.route_found, true);
    assert.equal(result.number_of_roads, 0);
    assert.equal(result.total_distance_km, 0);
});

test("uses the documented risk-aware cost formula", () => {
    assert.equal(edgeCost(10, 1), 12);
    assert.equal(edgeCost(10, 8), 26);
    assert.equal(RISK_WEIGHT, 2);
});

test("rejects invalid API coordinates", async () => {
    const response = await request("/api/routes/calculate", {
        body: {
            start_latitude: 91,
            start_longitude: 0,
            destination_latitude: 0,
            destination_longitude: 0
        },
        authorization: authHeader()
    });

    assert.equal(response.statusCode, 400);
});

test("rejects unauthenticated API requests", async () => {
    const response = await request("/api/routes/calculate", {
        body: {
            start_latitude: 0,
            start_longitude: 0,
            destination_latitude: 0,
            destination_longitude: 0
        }
    });

    assert.equal(response.statusCode, 401);
});

test("returns a route from database road data", async () => {
    const originalQuery = pool.query;
    pool.query = async () => ({ rows: [road()] });

    try {
        const response = await request("/api/routes/calculate", {
            body: {
                start_latitude: 0,
                start_longitude: 0,
                destination_latitude: 0,
                destination_longitude: 0.01
            },
            authorization: authHeader("RESCUE_TEAM")
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.route_found, true);
        assert.deepEqual(response.body.roads.map((item) => item.id), [1]);
    } finally {
        pool.query = originalQuery;
    }
});

test("returns no route when the database has no usable path", async () => {
    const originalQuery = pool.query;
    pool.query = async () => ({
        rows: [road({ id: 1, status: "BLOCKED" })]
    });

    try {
        const response = await request("/api/routes/calculate", {
            body: {
                start_latitude: 0,
                start_longitude: 0,
                destination_latitude: 0,
                destination_longitude: 0.01
            },
            authorization: authHeader("ADMIN")
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.route_found, false);
    } finally {
        pool.query = originalQuery;
    }
});

test("returns 500 when road loading fails", async () => {
    const originalQuery = pool.query;
    pool.query = async () => {
        throw new Error("database unavailable");
    };

    try {
        const response = await request("/api/routes/calculate", {
            body: {
                start_latitude: 0,
                start_longitude: 0,
                destination_latitude: 0,
                destination_longitude: 0.01
            },
            authorization: authHeader()
        });

        assert.equal(response.statusCode, 500);
    } finally {
        pool.query = originalQuery;
    }
});
