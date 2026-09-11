// Process-local limiter: suitable for this single-process project, but not a
// substitute for shared rate limiting when the API is horizontally scaled.
const createRateLimit = ({ windowMs, max, message, skip = () => false }) => {
    const hits = new Map();
    return (req, res, next) => {
        if (skip(req)) return next();
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || "unknown";
        const entry = hits.get(key);
        const current = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + windowMs } : entry;
        current.count += 1;
        hits.set(key, current);
        if (current.count > max) {
            res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
            return res.status(429).json({ message });
        }
        return next();
    };
};
module.exports = createRateLimit;
