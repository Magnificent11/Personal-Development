const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Stores user info inside request
        next();
    } catch (error) {
        // Distinguish an expired token from a genuinely malformed/tampered one.
        // Both are "not authenticated" from the client's point of view, so both
        // return 401 — that's the status the frontend's apiCall() checks for
        // to trigger a token refresh (or, failing that, a redirect to login).
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expired" });
        }
        return res.status(401).json({ error: "Invalid token" });
    }
}