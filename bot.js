/**
 * Telegram Bot with Manual Agent Routing
 * Built with Telegraf.js for Node.js/MERN developers
 */
const { Telegraf } = require("telegraf");
const config = require("./config");
const db = require("./database");
const { startServer } = require("./server");

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

// ============ MAIN ============

async function main() {
    // Initialize database first
    await db.initDb();
    console.log("Database ready");

    // Set up initial data
    setupInitialData();

    const bot = new Telegraf(config.BOT_TOKEN);

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

        // Skip commands
        if (messageText.startsWith("/")) return;

        // Admin messages - just inform
        if (db.isAdmin(senderId)) {
            return ctx.reply(
                "ℹ️ As an admin, your messages aren't routed. Use /start for commands."
            );
        }

        // Agent message - route reply to user
        if (db.isAgent(senderId)) {
            const session = db.getAgentSession(senderId);

            if (!session) {
                return ctx.reply("❌ No user to reply to. Wait for a user message first.");
            }

            const agent = db.getAgentByTelegramId(senderId);

            try {
                await bot.telegram.sendMessage(session.userId, messageText);
                // Use the stored user name from the session
                db.logMessage(session.userId, session.userName || "User", agent.id, agent.name, "agent_to_user", messageText);
                await ctx.reply(`✅ Reply sent to user ${session.userId}`);
            } catch (e) {
                await ctx.reply(`❌ Failed to send: ${e.message}`);
            }
            return;
        }

        // Regular user - route to active agent
        const activeAgent = db.getActiveAgent();

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

            await bot.telegram.sendMessage(activeAgent.telegram_id, forwardText, {
                parse_mode: "Markdown",
            });

            // Store user name in session so we can use it when agent replies
            db.setAgentSession(activeAgent.telegram_id, senderId, userDisplayName);
            db.logMessage(senderId, userDisplayName, activeAgent.id, activeAgent.name, "user_to_agent", messageText);

            await ctx.reply("✅ Your message has been received. An agent will respond shortly.");
        } catch (e) {
            await ctx.reply("Sorry, there was an error sending your message. Please try again.");
            console.error("Error forwarding message:", e);
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

    bot.launch();

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

// Run
main().catch(console.error);
