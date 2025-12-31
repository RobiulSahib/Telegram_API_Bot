/**
 * Telegram Bot with Manual Agent Routing
 * Version: 1.1.0 (Admin Panel Update)
 * Built with Telegraf.js for Node.js/MERN developers
 */
const { Telegraf } = require("telegraf");
const config = require("./config");
const db = require("./database");
const { startServer } = require("./server");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { OpenAI } = require("openai");

// Initialize OpenAI for transcription
const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
});

// Helper for temporary files
const TEMP_DIR = path.join(__dirname, "temp");
fs.ensureDirSync(TEMP_DIR);

// ============ SETUP INITIAL DATA ============

function setupInitialData() {
    // Add initial admin
    if (config.ADMIN_ID) {
        if (db.addAdmin(config.ADMIN_ID)) {
            console.log(`✅ Added initial admin: ${config.ADMIN_ID}`);
        }
    }

    // Add initial agents
    if (config.INITIAL_AGENTS) {
        for (const agent of config.INITIAL_AGENTS) {
            if (db.addAgent(agent.telegramId, agent.name)) {
                console.log(`✅ Added initial agent: ${agent.name} (${agent.telegramId})`);
            }
        }
    }
}

// ============ VOICE HELPERS ============

/**
 * Transcribes a voice message using OpenAI Whisper
 */
async function transcribeVoice(bot, fileId) {
    if (config.OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
        console.warn("⚠️ OpenAI API key not configured. Voice transcription skipped.");
        return "[Voice message - please configure OpenAI API key to transcribe]";
    }

    const tempFilePath = path.join(TEMP_DIR, `${fileId}.ogg`);

    try {
        // Get file link
        const fileLink = await bot.telegram.getFileLink(fileId);

        // Download file
        const response = await axios({
            method: "get",
            url: fileLink.href,
            responseType: "stream",
        });

        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        // Transcribe
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
        });

        // Clean up
        await fs.remove(tempFilePath);

        return transcription.text;
    } catch (error) {
        console.error("❌ Transcription error:", error);
        if (fs.existsSync(tempFilePath)) await fs.remove(tempFilePath);
        return "[Error transcribing voice message]";
    }
}

// ============ MAIN ============

async function main() {
    // Initialize database first
    await db.initDb();
    console.log("Database ready");

    // Set up initial data
    setupInitialData();

    const bot = new Telegraf(config.BOT_TOKEN);

    // Verify bot token
    console.log("🔌 Connecting to Telegram...");
    try {
        const botInfo = await bot.telegram.getMe();
        console.log(`✅ SUCCESS: Connected as @${botInfo.username} (${botInfo.id})`);
    } catch (err) {
        console.error("❌ ERROR: Could not connect to Telegram.");
        console.error(`Check your BOT_TOKEN in config.js. Error: ${err.message}`);
        // Don't exit here, let launch() try again or log more info
    }

    // Global error handler
    bot.catch((err, ctx) => {
        console.error(`❌ Bot error for ${ctx.updateType}:`, err);
    });

    // ============ ADMIN COMMANDS ============

    bot.command("start", async (ctx) => {
        const userId = ctx.from.id;

        if (db.isAdmin(userId)) {
            await ctx.reply(
                `🔧 *Admin Commands:*

*Agent Management:*
• /addagent <telegram_id> <name> - Add new agent
• /removeagent <id> - Remove agent
• /setactive <id> - Set agent as active
• /agents - List all agents

*Admin Management:*
• /addadmin <telegram_id> - Add new admin
• /removeadmin <telegram_id> - Remove admin
• /admins - List all admins

*Logs:*
• /logs - View recent conversations
• /logs <user_id> - View specific user's conversations

*Info:*
• /myid - Get your Telegram ID`,
                { parse_mode: "Markdown" }
            );
            return;
        }

        if (db.isAgent(userId)) {
            const agent = db.getAgentByTelegramId(userId);
            const status = agent.is_active
                ? "🟢 ACTIVE - You will receive user messages"
                : "⚪ INACTIVE - You won't receive messages";
            await ctx.reply(
                `👋 Hello ${agent.name}!\n\nStatus: ${status}\n\nWhen users message the bot, you'll receive them here.\nSimply reply to respond to users.`
            );
            return;
        }

        await ctx.reply(
            "👋 Hello! How can we help you today?\n\nSend your message and an agent will respond shortly."
        );
    });

    bot.command("myid", async (ctx) => {
        await ctx.reply(`Your Telegram ID: \`${ctx.from.id}\``, {
            parse_mode: "Markdown",
        });
    });

    bot.command("addagent", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 2) {
            return ctx.reply("Usage: `/addagent <telegram_id> <name>`", {
                parse_mode: "Markdown",
            });
        }

        const telegramId = parseInt(args[0]);
        const name = args.slice(1).join(" ");

        if (isNaN(telegramId)) {
            return ctx.reply("❌ Invalid telegram_id. Must be a number.");
        }

        if (db.addAgent(telegramId, name)) {
            await ctx.reply(`✅ Agent '${name}' added successfully!`);
        } else {
            await ctx.reply("❌ Agent already exists.");
        }
    });

    bot.command("removeagent", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 1) {
            return ctx.reply("Usage: `/removeagent <agent_id>`", {
                parse_mode: "Markdown",
            });
        }

        const agentId = parseInt(args[0]);
        if (isNaN(agentId)) {
            return ctx.reply("❌ Invalid agent_id. Must be a number.");
        }

        const result = db.removeAgent(agentId);
        await ctx.reply(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    });

    bot.command("setactive", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 1) {
            return ctx.reply("Usage: `/setactive <agent_id>`", {
                parse_mode: "Markdown",
            });
        }

        const agentId = parseInt(args[0]);
        if (isNaN(agentId)) {
            return ctx.reply("❌ Invalid agent_id. Must be a number.");
        }

        const result = db.setActiveAgent(agentId);
        await ctx.reply(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    });

    bot.command("agents", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const agents = db.getAllAgents();

        if (agents.length === 0) {
            return ctx.reply("No agents registered. Use `/addagent` to add one.", {
                parse_mode: "Markdown",
            });
        }

        let text = "📋 *Registered Agents:*\n\n";
        for (const agent of agents) {
            const status = agent.is_active ? "🟢 ACTIVE" : "⚪ inactive";
            text += `• ID: \`${agent.id}\` | ${agent.name} | ${status}\n`;
            text += `  Telegram ID: \`${agent.telegram_id}\`\n`;
        }

        await ctx.reply(text, { parse_mode: "Markdown" });
    });

    bot.command("addadmin", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 1) {
            return ctx.reply("Usage: `/addadmin <telegram_id>`", {
                parse_mode: "Markdown",
            });
        }

        const adminId = parseInt(args[0]);
        if (isNaN(adminId)) {
            return ctx.reply("❌ Invalid telegram_id. Must be a number.");
        }

        if (db.addAdmin(adminId)) {
            await ctx.reply(`✅ Admin \`${adminId}\` added successfully!`, {
                parse_mode: "Markdown",
            });
        } else {
            await ctx.reply("❌ Admin already exists.");
        }
    });

    bot.command("removeadmin", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const args = ctx.message.text.split(" ").slice(1);
        if (args.length < 1) {
            return ctx.reply("Usage: `/removeadmin <telegram_id>`", {
                parse_mode: "Markdown",
            });
        }

        const adminId = parseInt(args[0]);
        if (isNaN(adminId)) {
            return ctx.reply("❌ Invalid telegram_id. Must be a number.");
        }

        if (adminId === ctx.from.id) {
            return ctx.reply("❌ You cannot remove yourself.");
        }

        if (db.removeAdmin(adminId)) {
            await ctx.reply(`✅ Admin \`${adminId}\` removed.`, {
                parse_mode: "Markdown",
            });
        } else {
            await ctx.reply("❌ Admin not found.");
        }
    });

    bot.command("admins", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const admins = db.getAllAdmins();

        if (admins.length === 0) {
            return ctx.reply("No admins registered.");
        }

        let text = "👑 *Registered Admins:*\n\n";
        for (const adminId of admins) {
            text += `• \`${adminId}\`\n`;
        }

        await ctx.reply(text, { parse_mode: "Markdown" });
    });

    bot.command("logs", async (ctx) => {
        if (!db.isAdmin(ctx.from.id)) {
            return ctx.reply("❌ Admin only command.");
        }

        const args = ctx.message.text.split(" ").slice(1);
        let filterUserId = null;

        if (args.length >= 1) {
            filterUserId = parseInt(args[0]);
            if (isNaN(filterUserId)) {
                return ctx.reply("❌ Invalid user_id. Must be a number.");
            }
        }

        const logs = db.getLogs(filterUserId, 20);

        if (logs.length === 0) {
            return ctx.reply("No conversation logs found.");
        }

        let text = "📝 *Recent Conversations:*\n\n";
        for (const log of logs) {
            const shortMsg =
                log.message.length > 50 ? log.message.slice(0, 50) + "..." : log.message;
            const arrow = log.direction === "user_to_agent" ? "→" : "←";
            const timeShort = log.timestamp.slice(11, 16);
            text += `\`${timeShort}\` User ${log.user_id} ${arrow} Agent ${log.agent_id}\n`;
            text += `  ${shortMsg}\n`;
        }

        await ctx.reply(text, { parse_mode: "Markdown" });
    });

    // ============ MESSAGE ROUTING ============

    bot.on("text", async (ctx) => {
        const senderId = ctx.from.id;
        const messageText = ctx.message.text;
        console.log(`📩 Received text message from ${senderId}: ${messageText.slice(0, 20)}...`);
        if (messageText.startsWith("/")) return;

        // Admin messages - just inform
        if (db.isAdmin(senderId)) {
            return ctx.reply(
                "ℹ️ As an admin, your messages aren't routed. Use /start for commands."
            );
        }

        // Agent message - route reply to user
        if (db.isAgent(senderId)) {
            // Check if agent is replying to a specific message
            let targetUserId = null;
            let targetUserName = "User";

            if (ctx.message.reply_to_message) {
                const mapping = db.getMessageMapping(ctx.message.reply_to_message.message_id);
                if (mapping) {
                    targetUserId = mapping.userId;
                    targetUserName = mapping.userName;
                }
            }

            // Fallback to last session if no reply target found
            if (!targetUserId) {
                const session = db.getAgentSession(senderId);
                if (session) {
                    targetUserId = session.userId;
                    targetUserName = session.userName;
                }
            }

            if (!targetUserId) {
                return ctx.reply("❌ No user to reply to. Reply to a specific message or wait for a new user message.");
            }

            const agent = db.getAgentByTelegramId(senderId);

            if (!agent || !agent.is_active) {
                return ctx.reply("❌ You are currently OFFLINE. Please ask the admin to make you active in the dashboard before replying.");
            }

            try {
                await bot.telegram.sendMessage(targetUserId, messageText);
                db.logMessage(targetUserId, targetUserName, agent.id, agent.name, "agent_to_user", messageText);
                await ctx.reply(`✅ Reply sent to ${targetUserName} (ID: ${targetUserId})`);
            } catch (e) {
                await ctx.reply(`❌ Failed to send: ${e.message}`);
            }
            return;
        }

        // Regular user - route to active agent
        const activeAgent = db.getActiveAgent();
        console.log(`🔍 Active agent: ${activeAgent ? activeAgent.name : "NONE"}`);

        if (!activeAgent) {
            return ctx.reply(
                "Sorry, no support agents are available right now. Please try again later."
            );
        }

        const userName = ctx.from.first_name || "Unknown";
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : "";
        const userDisplayName = userUsername ? `${userName} (${userUsername})` : userName;

        try {
            const forwardText =
                `📩 *New message from user:*\n\n` +
                `👤 User: ${userName} ${userUsername} (ID: \`${senderId}\`)\n` +
                `💬 Message:\n${messageText}`;

            console.log(`📤 Forwarding message to agent ${activeAgent.name} (${activeAgent.telegram_id})...`);
            const sentMsg = await bot.telegram.sendMessage(activeAgent.telegram_id, forwardText, {
                parse_mode: "Markdown",
            });
            console.log("✅ Message forwarded successfully.");

            // Store message mapping so agent can reply specifically to this user
            db.addMessageMapping(sentMsg.message_id, senderId, userDisplayName);

            // Still keep session for backward compatibility (optional)
            db.setAgentSession(activeAgent.telegram_id, senderId, userDisplayName);

            db.logMessage(senderId, userDisplayName, activeAgent.id, activeAgent.name, "user_to_agent", messageText);

            await ctx.reply("✅ Your message has been received. An agent will respond shortly.");
        } catch (e) {
            let errorMsg = "Sorry, there was an error sending your message. Please try again.";
            if (e.message.includes("chat not found") || e.message.includes("bot was blocked")) {
                errorMsg = "❌ Technical Error: The agent hasn't started the bot or has blocked it. Agents must send /start to the bot first!";
            }
            await ctx.reply(errorMsg);
            console.error("❌ Forwarding Error:", e.message);
        }
    });

    // Handle Voice Messages
    bot.on("voice", async (ctx) => {
        const senderId = ctx.from.id;

        // --- AGENT VOICE REPLY ---
        if (db.isAgent(senderId)) {
            let targetUserId = null;
            let targetUserName = "User";

            // Identify recipient from reply mapping
            if (ctx.message.reply_to_message) {
                const mapping = db.getMessageMapping(ctx.message.reply_to_message.message_id);
                if (mapping) {
                    targetUserId = mapping.userId;
                    targetUserName = mapping.userName;
                }
            }

            // Fallback to most recent session
            if (!targetUserId) {
                const session = db.getAgentSession(senderId);
                if (session) {
                    targetUserId = session.userId;
                    targetUserName = session.userName;
                }
            }

            if (!targetUserId) {
                return ctx.reply("❌ No user to reply to. Long-press a user's message and select 'Reply' to send them a voice note.");
            }

            const agent = db.getAgentByTelegramId(senderId);

            if (!agent || !agent.is_active) {
                return ctx.reply("❌ You are currently OFFLINE. Please ask the admin to make you active in the dashboard before replying.");
            }

            try {
                console.log(`📤 Routing agent voice reply to user ${targetUserId}...`);
                await bot.telegram.sendVoice(targetUserId, ctx.message.voice.file_id);
                db.logMessage(targetUserId, targetUserName, agent.id, agent.name, "agent_to_user", "[Voice Message]");
                await ctx.reply(`✅ Voice reply sent to ${targetUserName}`);
            } catch (e) {
                await ctx.reply(`❌ Failed to send voice reply: ${e.message}`);
                console.error("Agent voice routing error:", e);
            }
            return;
        }
        // --- USER VOICE MESSAGE ---
        if (db.isAdmin(senderId)) {
            return ctx.reply("Admin voice messages are not routed. Use /start for instructions.");
        }

        const activeAgent = db.getActiveAgent();
        if (!activeAgent) {
            return ctx.reply("Sorry, no support agents are available right now.");
        }

        const userName = ctx.from.first_name || "Unknown";
        const userUsername = ctx.from.username ? `@${ctx.from.username}` : "";
        const userDisplayName = userUsername ? `${userName} (${userUsername})` : userName;

        await ctx.reply("🎤 Processing your voice message...");

        const transcription = await transcribeVoice(bot, ctx.message.voice.file_id);

        try {
            const forwardHeader =
                `📩 *New VOICE message from user:*\n\n` +
                `👤 User: ${userName} ${userUsername} (ID: \`${senderId}\`)\n` +
                `📝 Transcription:\n_${transcription}_`;

            // 1. Forward the actual voice file (FREE - agent can listen to it)
            console.log(`📤 Forwarding voice file to agent ${activeAgent.name}...`);
            const sentVoice = await bot.telegram.sendVoice(activeAgent.telegram_id, ctx.message.voice.file_id, {
                caption: forwardHeader,
                parse_mode: "Markdown",
            });

            // Store mapping
            db.addMessageMapping(sentVoice.message_id, senderId, userDisplayName);
            db.setAgentSession(activeAgent.telegram_id, senderId, userDisplayName);

            db.logMessage(senderId, userDisplayName, activeAgent.id, activeAgent.name, "user_to_agent", `[Voice] ${transcription}`);

            await ctx.reply("✅ Your voice message has been sent to an agent. They can listen to it and respond shortly.");
        } catch (e) {
            await ctx.reply("Sorry, there was an error sending your voice message. If you are an agent, make sure you have started the bot!");
            console.error("Error forwarding voice:", e);
        }
    });

    // ============ START BOT + WEB SERVER ============

    // Start web admin panel
    startServer();

    console.log("\n" + "=".repeat(50));
    console.log("🤖 Bot starting...");
    console.log("=".repeat(50));
    console.log("\nAgents:", db.getAllAgents());
    console.log("Admins:", db.getAllAdmins());
    console.log("\nPress Ctrl+C to stop");
    console.log("=".repeat(50) + "\n");

    console.log("🔄 Clearing any existing webhooks...");
    await bot.telegram.deleteWebhook().catch(() => { });

    bot.launch()
        .then(() => {
            console.log("🚀 Bot is live and polling for updates!");
        })
        .catch(err => {
            console.error("❌ Bot failed to launch:", err);
            if (err.message.includes("409: Conflict")) {
                console.error("💡 Hint: This usually means another instance of the bot is running or a webhook is set.");
            }
        });

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

// Run
main().catch(console.error);
