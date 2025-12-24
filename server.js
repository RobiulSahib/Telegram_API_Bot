/**
 * Express.js Web Server for Admin Panel
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3010;

// Admin credentials (in production, use environment variables and hashed passwords)
const ADMIN_EMAIL = "adminapibot@gmail.com";
const ADMIN_PASSWORD = "gohelp123";

app.use(cors());
app.use(express.json());

// Prevent caching for all routes to ensure login logic always runs
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Serve login page as default
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Serve dashboard (protected by client-side session check)
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

// ============ AUTH ROUTES ============

// Login endpoint
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password required" });
    }

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        return res.json({ success: true, message: "Login successful" });
    }

    return res.status(401).json({ success: false, message: "Invalid email or password" });
});

// ============ API ROUTES ============

// Get all agents
app.get("/api/agents", (req, res) => {
    const agents = db.getAllAgents();
    const activeAgent = db.getActiveAgent();
    res.json({
        agents,
        activeAgentId: activeAgent ? activeAgent.id : null,
    });
});

// Set agent as active
app.post("/api/agents/:id/activate", (req, res) => {
    const agentId = parseInt(req.params.id);
    const result = db.setActiveAgent(agentId);
    res.json(result);
});

// Add new agent
app.post("/api/agents", (req, res) => {
    const { telegramId, name } = req.body;
    if (!telegramId || !name) {
        return res.status(400).json({ success: false, message: "telegramId and name required" });
    }
    const success = db.addAgent(parseInt(telegramId), name);
    res.json({ success, message: success ? "Agent added" : "Agent already exists" });
});

// Remove agent
app.delete("/api/agents/:id", (req, res) => {
    const agentId = parseInt(req.params.id);
    const result = db.removeAgent(agentId);
    res.json(result);
});

// Get conversation logs
app.get("/api/logs", (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const logs = db.getLogs(userId, 50);
    res.json(logs);
});

// Get all admins
app.get("/api/admins", (req, res) => {
    const admins = db.getAllAdmins();
    res.json(admins);
});

// Add new admin
app.post("/api/admins", (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) {
        return res.status(400).json({ success: false, message: "telegramId required" });
    }
    const success = db.addAdmin(parseInt(telegramId));
    res.json({ success, message: success ? "Admin added" : "Admin already exists" });
});

// Remove admin
app.delete("/api/admins/:telegramId", (req, res) => {
    const telegramId = parseInt(req.params.telegramId);
    const success = db.removeAdmin(telegramId);
    res.json({ success, message: success ? "Admin removed" : "Admin not found" });
});

// Start server
function startServer() {
    app.listen(PORT, () => {
        console.log(`🌐 Admin Panel running on port ${PORT}`);
    });
}

// Allow running server independently causing no conflict with bot instance
if (require.main === module) {
    db.initDb().then(startServer);
}

module.exports = { startServer };
