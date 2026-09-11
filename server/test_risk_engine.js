const assert = require("node:assert/strict");
const http = require("node:http");
const { test, before, after } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "risk-engine-test-secret";
process.env.ML_API_URL = "http://127.0.0.1:8000";

const app = require("./server");
const { requiredFeatures } = require("./services/mlService");
const {
    calculateRiskScore,
    WEIGHTS
} = require("./services/riskEngine");

let server;
let serverUrl;

const mlFeatures = Object.fromEntries(
    requiredFeatures.map((feature) => [feature, 1.5])
);

const operationalInputs = {
    disaster_severity: 5,
    hazard_distance_km: 25,
    population_exposure: 0.5,
    road_accessibility: 0.5,
    shelter_available_capacity: 50,
    shelter_required_capacity: 100
};

const makeInputs = (overrides = {}) => ({
    ml_severe_flood_score: 0.4,
    ...operationalInputs,
    ...overrides
});

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

test("calculates a low-risk scenario", () => {
    const result = calculateRiskScore(makeInputs({
        ml_severe_flood_score: 0,
        disaster_severity: 1,
        hazard_distance_km: 50,
        population_exposure: 0,
        road_accessibility: 1,
        shelter_available_capacity: 100
    }));

    assert.equal(result.risk_score, 0);
    assert.equal(result.risk_level, "LOW");
});

test("calculates a moderate-risk scenario", () => {
    const result = calculateRiskScore(makeInputs());

    assert.equal(result.risk_level, "MODERATE");
    assert.ok(result.risk_score >= 31 && result.risk_score <= 60);
});

test("calculates a high-risk scenario", () => {
    const result = calculateRiskScore(makeInputs({
        ml_severe_flood_score: 0.7,
        disaster_severity: 8,
        hazard_distance_km: 10,
        population_exposure: 0.8,
        road_accessibility: 0.2,
        shelter_available_capacity: 20
    }));

    assert.equal(result.risk_level, "HIGH");
    assert.ok(result.risk_score >= 61 && result.risk_score <= 80);
});

test("calculates a critical-risk scenario and clamps at 100", () => {
    const result = calculateRiskScore(makeInputs({
        ml_severe_flood_score: 1,
        disaster_severity: 10,
        hazard_distance_km: 0,
        population_exposure: 1,
        road_accessibility: 0,
        shelter_available_capacity: 0
    }));

    assert.equal(result.risk_score, 100);
    assert.equal(result.risk_level, "CRITICAL");
});

test("fully accessible roads contribute no road risk", () => {
    const accessible = calculateRiskScore(makeInputs({
        road_accessibility: 1
    }));
    const inaccessible = calculateRiskScore(makeInputs({
        road_accessibility: 0
    }));

    assert.equal(accessible.factor_scores.road_accessibility, 0);
    assert.equal(inaccessible.factor_scores.road_accessibility, 100);
    assert.ok(inaccessible.risk_score > accessible.risk_score);
});

test("shelter availability reduces risk", () => {
    const highAvailability = calculateRiskScore(makeInputs({
        shelter_available_capacity: 100
    }));
    const noAvailability = calculateRiskScore(makeInputs({
        shelter_available_capacity: 0
    }));

    assert.equal(highAvailability.factor_scores.shelter_availability, 0);
    assert.equal(noAvailability.factor_scores.shelter_availability, 100);
    assert.ok(noAvailability.risk_score > highAvailability.risk_score);
});

test("uses the ML score endpoints", () => {
    const noMlRisk = calculateRiskScore(makeInputs({
        ml_severe_flood_score: 0
    }));
    const fullMlRisk = calculateRiskScore(makeInputs({
        ml_severe_flood_score: 1
    }));

    assert.equal(noMlRisk.factor_scores.ml_severe_flood_score, 0);
    assert.equal(fullMlRisk.factor_scores.ml_severe_flood_score, 100);
    assert.equal(
        fullMlRisk.risk_score - noMlRisk.risk_score,
        WEIGHTS.ml_severe_flood_score * 100
    );
});

test("rejects invalid or missing risk inputs", () => {
    assert.throws(
        () => calculateRiskScore({}),
        /ml_severe_flood_score must be a finite number/
    );

    assert.throws(
        () => calculateRiskScore(makeInputs({ road_accessibility: 2 })),
        /road_accessibility must be between 0 and 1/
    );

    assert.throws(
        () => calculateRiskScore(makeInputs({ shelter_required_capacity: 0 })),
        /shelter_required_capacity must be greater than 0/
    );
});

test("rejects unauthenticated risk requests", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error("fetch should not be called");
    };

    try {
        const response = await request("/api/risk/calculate", {
            body: { ...mlFeatures, ...operationalInputs }
        });

        assert.equal(response.statusCode, 401);
    } finally {
        global.fetch = originalFetch;
    }
});

test("returns a calculated risk result for authenticated clients", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            severe_flood_score: 0.72,
            threshold: 0.4,
            classification: "SEVERE_FLOOD"
        })
    });

    try {
        const response = await request("/api/risk/calculate", {
            body: { ...mlFeatures, ...operationalInputs },
            authorization: authHeader("RESCUE_TEAM")
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.risk_level, "MODERATE");
        assert.equal(response.body.inputs.ml.classification, "SEVERE_FLOOD");
        assert.equal(response.body.inputs.operational.road_accessibility, 0.5);
    } finally {
        global.fetch = originalFetch;
    }
});

test("rejects invalid API input before calling the ML service", async () => {
    const originalFetch = global.fetch;
    let fetchCalled = false;
    global.fetch = async () => {
        fetchCalled = true;
        throw new Error("fetch should not be called");
    };

    try {
        const response = await request("/api/risk/calculate", {
            body: {
                ...mlFeatures,
                ...operationalInputs,
                population_exposure: 2
            },
            authorization: authHeader()
        });

        assert.equal(response.statusCode, 400);
        assert.equal(fetchCalled, false);
    } finally {
        global.fetch = originalFetch;
    }
});

test("returns 502 when the ML service fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error("connection refused");
    };

    try {
        const response = await request("/api/risk/calculate", {
            body: { ...mlFeatures, ...operationalInputs },
            authorization: authHeader("ADMIN")
        });

        assert.equal(response.statusCode, 502);
        assert.equal(response.body.message, "ML service is unavailable");
    } finally {
        global.fetch = originalFetch;
    }
});
