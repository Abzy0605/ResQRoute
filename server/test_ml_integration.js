const assert = require("node:assert/strict");
const http = require("node:http");
const { test, before, after } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "ml-integration-test-secret";
process.env.ML_API_URL = "http://127.0.0.1:8000";

const app = require("./server");
const { requiredFeatures } = require("./controllers/mlController");

let server;
let serverUrl;

const validPayload = Object.fromEntries(
    requiredFeatures.map((feature) => [feature, 1.5])
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
        const requestBody = body === undefined
            ? undefined
            : JSON.stringify(body);
        const requestUrl = new URL(path, serverUrl);
        const requestOptions = {
            hostname: requestUrl.hostname,
            port: requestUrl.port,
            path: requestUrl.pathname,
            method: "POST",
            headers: {}
        };

        if (authorization) {
            requestOptions.headers.authorization = authorization;
        }

        if (requestBody !== undefined) {
            requestOptions.headers["content-type"] = "application/json";
            requestOptions.headers["content-length"] = Buffer.byteLength(
                requestBody
            );
        }

        const clientRequest = http.request(requestOptions, (response) => {
            let responseBody = "";

            response.on("data", (chunk) => {
                responseBody += chunk;
            });

            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode,
                    body: responseBody ? JSON.parse(responseBody) : null
                });
            });
        });

        clientRequest.on("error", reject);

        if (requestBody !== undefined) {
            clientRequest.write(requestBody);
        }

        clientRequest.end();
    });
};

before(async () => {
    server = await new Promise((resolve) => {
        const runningServer = app.listen(0, "127.0.0.1", () => {
            resolve(runningServer);
        });
    });

    const address = server.address();
    serverUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

test("rejects unauthenticated ML prediction requests", async () => {
    const originalFetch = global.fetch;
    let fetchCalled = false;
    global.fetch = async () => {
        fetchCalled = true;
        throw new Error("fetch should not be called");
    };

    try {
        const response = await request("/api/ml/predict", {
            body: validPayload
        });

        assert.equal(response.statusCode, 401);
        assert.equal(fetchCalled, false);
    } finally {
        global.fetch = originalFetch;
    }
});

test("forwards valid authenticated data and returns the ML response", async () => {
    const originalFetch = global.fetch;
    let forwardedRequest;
    const mlResponse = {
        severe_flood_score: 0.72,
        threshold: 0.4,
        classification: "SEVERE_FLOOD"
    };

    global.fetch = async (url, options) => {
        forwardedRequest = {
            url,
            options,
            body: JSON.parse(options.body)
        };

        return {
            ok: true,
            json: async () => mlResponse
        };
    };

    try {
        const response = await request("/api/ml/predict", {
            body: validPayload,
            authorization: authHeader("RESCUE_TEAM")
        });

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, mlResponse);
        assert.equal(forwardedRequest.url, "http://127.0.0.1:8000/predict");
        assert.deepEqual(forwardedRequest.body, validPayload);
    } finally {
        global.fetch = originalFetch;
    }
});

test("rejects missing ML feature data", async () => {
    const payload = { ...validPayload };
    delete payload[requiredFeatures[0]];

    const response = await request("/api/ml/predict", {
        body: payload,
        authorization: authHeader()
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body.features, [requiredFeatures[0]]);
});

test("handles an unavailable ML service", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error("connection refused");
    };

    try {
        const response = await request("/api/ml/predict", {
            body: validPayload,
            authorization: authHeader("ADMIN")
        });

        assert.equal(response.statusCode, 502);
        assert.equal(response.body.message, "ML service is unavailable");
    } finally {
        global.fetch = originalFetch;
    }
});
