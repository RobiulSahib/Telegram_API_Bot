/**
 * Database module using sql.js (pure JavaScript, no native compilation)
 */
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "bot_database.db");

let db = null;

// Initialize database
async function initDb() {
    const SQL = await initSqlJs();

    // Load existing database or create new
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 0
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      telegram_id INTEGER PRIMARY KEY
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS conversation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      agent_id INTEGER,
      agent_name TEXT,
      direction TEXT NOT NULL,
      message TEXT NOT NULL
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      agent_telegram_id INTEGER PRIMARY KEY,
      current_user_id INTEGER NOT NULL,
      current_user_name TEXT
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS message_mappings (
      agent_message_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      user_name TEXT
    )
  `);

    saveDb();
    console.log("Database initialized");
}

// Save database to file
function saveDb() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// ============ ADMIN MANAGEMENT ============

function addAdmin(telegramId) {
    try {
        db.run("INSERT INTO admins (telegram_id) VALUES (?)", [telegramId]);
        saveDb();
        return true;
    } catch (e) {
        return false;
    }
}

function removeAdmin(telegramId) {
    const result = db.run("DELETE FROM admins WHERE telegram_id = ?", [telegramId]);
    saveDb();
    return db.getRowsModified() > 0;
}

function isAdmin(telegramId) {
    const result = db.exec("SELECT telegram_id FROM admins WHERE telegram_id = ?", [telegramId]);
    return result.length > 0 && result[0].values.length > 0;
}

function getAllAdmins() {
    const result = db.exec("SELECT telegram_id FROM admins");
    if (result.length === 0) return [];
    return result[0].values.map((r) => r[0]);
}

// ============ AGENT MANAGEMENT ============

function addAgent(telegramId, name) {
    try {
        db.run("INSERT INTO agents (telegram_id, name, is_active) VALUES (?, ?, 0)", [telegramId, name]);
        saveDb();
        return true;
    } catch (e) {
        return false;
    }
}

function removeAgent(agentId) {
    const result = db.exec("SELECT telegram_id FROM agents WHERE id = ?", [agentId]);

    if (result.length === 0 || result[0].values.length === 0) {
        return { success: false, message: "Agent not found" };
    }

    const telegramId = result[0].values[0][0];

    // Remove from agents table
    db.run("DELETE FROM agents WHERE id = ?", [agentId]);

    // Also remove from admins table if they exist there (cleanup)
    db.run("DELETE FROM admins WHERE telegram_id = ?", [telegramId]);

    // Also remove any sessions for this agent
    db.run("DELETE FROM agent_sessions WHERE agent_telegram_id = ?", [telegramId]);

    saveDb();
    return { success: true, message: "Agent removed successfully" };
}

function setActiveAgent(agentId) {
    const result = db.exec("SELECT name FROM agents WHERE id = ?", [agentId]);

    if (result.length === 0 || result[0].values.length === 0) {
        return { success: false, message: "Agent not found" };
    }

    const agentName = result[0].values[0][0];

    db.run("UPDATE agents SET is_active = 0");
    db.run("UPDATE agents SET is_active = 1 WHERE id = ?", [agentId]);
    saveDb();

    return { success: true, message: `Agent '${agentName}' is now active` };
}

function deactivateAgent(agentId) {
    const result = db.exec("SELECT name FROM agents WHERE id = ?", [agentId]);

    if (result.length === 0 || result[0].values.length === 0) {
        return { success: false, message: "Agent not found" };
    }

    const agentName = result[0].values[0][0];

    db.run("UPDATE agents SET is_active = 0 WHERE id = ?", [agentId]);
    saveDb();

    return { success: true, message: `Agent '${agentName}' is now offline` };
}

function getActiveAgent() {
    const result = db.exec("SELECT id, telegram_id, name FROM agents WHERE is_active = 1");
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { id: row[0], telegram_id: row[1], name: row[2] };
}

function getAllAgents() {
    const result = db.exec("SELECT id, telegram_id, name, is_active FROM agents");
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
        id: row[0],
        telegram_id: row[1],
        name: row[2],
        is_active: row[3],
    }));
}

function isAgent(telegramId) {
    const result = db.exec("SELECT id FROM agents WHERE telegram_id = ?", [telegramId]);
    return result.length > 0 && result[0].values.length > 0;
}

function getAgentByTelegramId(telegramId) {
    const result = db.exec(
        "SELECT id, telegram_id, name, is_active FROM agents WHERE telegram_id = ?",
        [telegramId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    const row = result[0].values[0];
    return { id: row[0], telegram_id: row[1], name: row[2], is_active: row[3] };
}

// ============ SESSION TRACKING ============

function setAgentSession(agentTelegramId, userId, userName) {
    db.run("DELETE FROM agent_sessions WHERE agent_telegram_id = ?", [agentTelegramId]);
    db.run("INSERT INTO agent_sessions (agent_telegram_id, current_user_id, current_user_name) VALUES (?, ?, ?)", [
        agentTelegramId,
        userId,
        userName,
    ]);
    saveDb();
}

function getAgentSession(agentTelegramId) {
    const result = db.exec(
        "SELECT current_user_id, current_user_name FROM agent_sessions WHERE agent_telegram_id = ?",
        [agentTelegramId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return { userId: result[0].values[0][0], userName: result[0].values[0][1] };
}

// ============ MESSAGE MAPPING (MULTI-USER) ============

function addMessageMapping(agentMessageId, userId, userName) {
    db.run("INSERT OR REPLACE INTO message_mappings (agent_message_id, user_id, user_name) VALUES (?, ?, ?)", [
        agentMessageId,
        userId,
        userName,
    ]);
    saveDb();
}

function getMessageMapping(agentMessageId) {
    const result = db.exec(
        "SELECT user_id, user_name FROM message_mappings WHERE agent_message_id = ?",
        [agentMessageId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return { userId: result[0].values[0][0], userName: result[0].values[0][1] };
}

// ============ CONVERSATION LOGGING ============

function logMessage(userId, userName, agentId, agentName, direction, message) {
    const timestamp = new Date().toISOString();
    db.run(
        "INSERT INTO conversation_logs (timestamp, user_id, user_name, agent_id, agent_name, direction, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [timestamp, userId, userName, agentId, agentName, direction, message]
    );
    saveDb();
}

function getLogs(userId = null, limit = 50) {
    let query, params;
    if (userId) {
        query = "SELECT timestamp, user_id, user_name, agent_id, agent_name, direction, message FROM conversation_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?";
        params = [userId, limit];
    } else {
        query = "SELECT timestamp, user_id, user_name, agent_id, agent_name, direction, message FROM conversation_logs ORDER BY timestamp DESC LIMIT ?";
        params = [limit];
    }

    const result = db.exec(query, params);
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
        timestamp: row[0],
        user_id: row[1],
        user_name: row[2],
        agent_id: row[3],
        agent_name: row[4],
        direction: row[5],
        message: row[6],
    }));
}

module.exports = {
    initDb,
    addAdmin,
    removeAdmin,
    isAdmin,
    getAllAdmins,
    addAgent,
    removeAgent,
    setActiveAgent,
    deactivateAgent,
    getActiveAgent,
    getAllAgents,
    isAgent,
    getAgentByTelegramId,
    setAgentSession,
    getAgentSession,
    addMessageMapping,
    getMessageMapping,
    logMessage,
    getLogs,
};
