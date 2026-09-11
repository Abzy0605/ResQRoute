const express = require("express");
const cors = require("cors");
const pool = require("./db");

const disasterRoutes = require("./routes/disasterRoutes");
const shelterRoutes = require("./routes/shelterRoutes");
const rescueTeamRoutes = require("./routes/rescueTeamRoutes");
const incidentRoutes = require("./routes/incidentRoutes");
const roadRoutes = require("./routes/roadRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const riskZoneRoutes = require("./routes/riskZoneRoutes");
const authRoutes = require("./routes/authRoutes");
const mlRoutes = require("./routes/mlRoutes");
const riskRoutes = require("./routes/riskRoutes");
const routingRoutes = require("./routes/routingRoutes");
const rescueTeamAssociationRoutes = require("./routes/rescueTeamAssociationRoutes");

const authenticateToken = require("./middleware/authMiddleware");
const authorizeRoles = require("./middleware/roleMiddleware");
const createRateLimit = require("./middleware/rateLimit");
const { validateEnvironment } = require("./config");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "geolocation=(self)",
        "Cross-Origin-Resource-Policy": "same-site"
    });
    next();
});
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// Normal authenticated API traffic gets a deliberately generous process-local
// limit. Auth and computational routes below retain stricter route limits.
app.use("/api", createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: "Too many API requests. Please try again later.",
    skip: (req) => !req.headers.authorization
}));

app.use("/api/disasters", disasterRoutes);
app.use("/api/shelters", shelterRoutes);
app.use("/api/rescue-teams", rescueTeamRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/roads", roadRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/risk-zones", riskZoneRoutes);
app.use("/api/auth", createRateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: "Too many authentication attempts. Please try again later." }), authRoutes);
app.use("/api/ml", createRateLimit({ windowMs: 60 * 1000, max: 30, message: "Too many prediction requests. Please try again shortly." }), mlRoutes);
app.use("/api/risk", createRateLimit({ windowMs: 60 * 1000, max: 30, message: "Too many risk requests. Please try again shortly." }), riskRoutes);
app.use("/api/routes", createRateLimit({ windowMs: 60 * 1000, max: 60, message: "Too many route requests. Please try again shortly." }), routingRoutes);
app.use("/api/admin/rescue-team-associations", rescueTeamAssociationRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "ResQRoute backend is running!"
    });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

if (process.env.NODE_ENV !== "production") {
    app.get("/api/protected", authenticateToken, (req, res) => {
        res.json({
            message: "You accessed a protected development route.",
            user: req.user
        });
    });

    app.get("/api/admin-test", authenticateToken, authorizeRoles("ADMIN"), (req, res) => {
        res.json({
            message: "You accessed an admin-only development route.",
            user: req.user
        });
    });
}

if (require.main === module) {
    const { port } = validateEnvironment();
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ message: "Malformed JSON request body" });
    if (err.type === "entity.too.large") return res.status(413).json({ message: "Request body is too large" });
    if (err.message === "Origin is not allowed by CORS") return res.status(403).json({ message: "Origin is not allowed" });
    console.error("Unhandled API error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
module.exports.validateEnvironment = validateEnvironment;
