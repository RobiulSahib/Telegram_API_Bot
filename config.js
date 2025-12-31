// Telegram Bot Configuration

module.exports = {
    // Bot token from @BotFather (@GBhelpcenterbot)
    BOT_TOKEN: "8154534518:AAGSsDbUBjNM-CPikwJt5eSesN1WuOOTS28",

    // No hardcoded admin - add admins from the dashboard
    ADMIN_ID: null,

    // No hardcoded agents - add agents from the dashboard
    INITIAL_AGENTS: [],

    // OpenAI API Key for Voice-to-Text (Whisper)
    // Get one from https://platform.openai.com/
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY",
};
