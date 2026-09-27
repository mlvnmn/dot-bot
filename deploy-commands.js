const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
require("dotenv").config();

// Build the command list from every module in ./commands
const commands = [];
const commandsPath = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`Skipping commands/${file}: missing "data" export.`);
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} command(s): ${commands.map((c) => c.name).join(", ")}`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log("Slash commands registered successfully.");
  } catch (error) {
    console.error("Error registering commands:", error);
    process.exit(1);
  }
})();
