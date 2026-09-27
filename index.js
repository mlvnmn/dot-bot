require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const {
  Client,
  Collection,
  GatewayIntentBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  PermissionFlagsBits,
} = require("discord.js");

const config = require("./config.json");

const DM_DELAY_MS = 750;
const LOG_CHANNEL_ID = process.env.DISCORD_LOG_CHANNEL || process.env.LOG_CHANNEL_ID;
const PANEL_COMMAND_NAME = "panel";
const ADD_BUTTON_ID = "dot_add_member";
const ADD_MODAL_ID = "dot_add_member_modal";
const MEMBER_ID_INPUT_ID = "dot_member_id";
const NAME_PREFIX = "DOT | ";
const LEGACY_NAME_PREFIX = "D O T | ";
const PANEL_IMAGE_URL = "https://cdn.discordapp.com/attachments/1187426538279420076/1551970592494718986/IMG_3579.gif?ex=6ab3e8bf&is=6ab2973f&hm=7650356396220c22317fbeee3f4001b9668c1f41c5941db99e2fe78ba84bd574&";
const AUTO_ROLE_GUILD_ID = process.env.GUILD_ID || config.guildId || null;
const AUTO_ROLE_ID = "1412071888414572574";
const INVITE_LOG_CHANNEL_ID = "1523767566613479637";
const MEMBER_JOIN_LOG_CHANNEL_ID = "1266042282210230282";
const MEMBER_LEAVE_LOG_CHANNEL_ID = "1266042222843789403";

const panelConfig = {
  guildId: process.env.GUILD_ID || config.guildId || null,
  roleId: process.env.ROLE_ID || config.roleId || null,
  panelChannelId: process.env.PANEL_CHANNEL_ID || config.panelChannelId || null,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || config.welcomeChannelId || null,
  panelAdminUserId: process.env.PANEL_ADMIN_USER_ID || config.panelAdminUserId || null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites],
  presence: {
    status: "dnd",
  },
});

client.commands = new Collection();
const inviteCache = new Map();

// --- Render Keep-Alive Web Server & 4-Minute Auto-Ping ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        bot: client.user ? client.user.tag : "connecting",
        uptime: Math.floor(process.uptime()),
      })
    );
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`Keep-Alive HTTP server listening on port ${PORT}`);
});

// Auto-ping every 4 minutes (240,000 ms) to prevent Render free instance from sleeping
const PING_INTERVAL = 4 * 60 * 1000;
const autoPingUrl = process.env.RENDER_EXTERNAL_URL || process.env.PING_URL;

function triggerAutoPing() {
  const targetUrl = process.env.RENDER_EXTERNAL_URL || process.env.PING_URL || `http://localhost:${PORT}/health`;
  const pinger = targetUrl.startsWith("https") ? https : http;

  pinger
    .get(targetUrl, (res) => {
      console.log(`[Auto-Ping] Ping sent to ${targetUrl} - Status: ${res.statusCode}`);
    })
    .on("error", (err) => {
      console.error(`[Auto-Ping] Ping to ${targetUrl} failed:`, err.message);
    });
}

setInterval(triggerAutoPing, PING_INTERVAL);
if (autoPingUrl) {
  console.log(`[Auto-Ping] Configured to ping ${autoPingUrl} every 4 minutes.`);
} else {
  console.log(`[Auto-Ping] Local fallback active on port ${PORT}. Set RENDER_EXTERNAL_URL or PING_URL on Render for public pings.`);
}

const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data && command?.execute) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`Skipping commands/${file}: missing "data" or "execute" export.`);
  }
}

client.once("clientReady", () => {
  client.user.setPresence({
    status: "dnd",
  });

  console.log(`Bot online: ${client.user.tag}`);
  console.log(`Loaded commands: ${[...client.commands.keys()].join(", ") || "(none)"}`);

  for (const guild of client.guilds.cache.values()) {
    guild.invites.fetch()
      .then((invites) => inviteCache.set(guild.id, new Map(invites.map((invite) => [invite.code, invite]))))
      .catch((error) => console.error(`Could not cache invites for ${guild.name}:`, error.message));
  }
});

client.on("inviteCreate", (invite) => {
  const invites = inviteCache.get(invite.guild.id) || new Map();
  invites.set(invite.code, invite);
  inviteCache.set(invite.guild.id, invites);
});

client.on("inviteDelete", (invite) => {
  inviteCache.get(invite.guild.id)?.delete(invite.code);
});

async function logMemberInvite(member) {
  const oldInvites = inviteCache.get(member.guild.id) || new Map();
  const newInvites = await member.guild.invites.fetch().catch((error) => {
    console.error(`Could not fetch invites for ${member.guild.name}:`, error.message);
    return null;
  });

  let usedInvite = null;
  if (newInvites) {
    usedInvite = newInvites.find((invite) => {
      const oldInvite = oldInvites.get(invite.code);
      return oldInvite && typeof invite.uses === "number" && invite.uses > (oldInvite.uses || 0);
    });

    if (!usedInvite) {
      usedInvite = [...oldInvites.values()].find(
        (invite) => invite.maxUses === 1 && !newInvites.has(invite.code)
      );
    }

    inviteCache.set(member.guild.id, new Map(newInvites.map((invite) => [invite.code, invite])));
  }

  const logChannel = await client.channels.fetch(INVITE_LOG_CHANNEL_ID).catch((error) => {
    console.error(`Could not fetch invite log channel ${INVITE_LOG_CHANNEL_ID}:`, error.message);
    return null;
  });
  if (!logChannel?.isTextBased() || typeof logChannel.send !== "function") return;

  const inviter = usedInvite?.inviter;
  const inviteText = usedInvite && inviter
    ? `They were invited by <@${inviter.id}> using code **${usedInvite.code}**. <@${inviter.id}> now has **${usedInvite.uses || 0}** invites.`
    : usedInvite
      ? `They joined using invite code **${usedInvite.code}**, but the inviter could not be identified.`
    : "The invite could not be identified. It may be an expired, vanity, or one-use invite.";

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("📊 Member Joined")
    .setDescription(`<@${member.id}> (**${member.user.username}**) joined the server. ${inviteText}`)
    .addFields({ name: "User ID", value: `${member.id}`, inline: true })
    .setTimestamp();

  if (member.user.displayAvatarURL()) embed.setThumbnail(member.user.displayAvatarURL({ size: 128 }));
  await logChannel.send({ embeds: [embed] }).catch((error) => {
    console.error(`Could not send invite log for ${member.user.tag}:`, error.message);
  });
}

function accountAgeText(createdTimestamp) {
  const ageInDays = Math.max(0, Math.floor((Date.now() - createdTimestamp) / 86400000));
  const years = Math.floor(ageInDays / 365);
  const months = Math.floor((ageInDays % 365) / 30);

  if (years > 0) return `${years} year${years === 1 ? "" : "s"}${months ? `, ${months} month${months === 1 ? "" : "s"}` : ""} ago`;
  if (months > 0) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${ageInDays} day${ageInDays === 1 ? "" : "s"} ago`;
}

async function sendMemberLog(member, channelId, action) {
  const channel = await client.channels.fetch(channelId).catch((error) => {
    console.error(`Could not fetch ${action} log channel ${channelId}:`, error.message);
    return null;
  });

  if (!channel?.isTextBased() || typeof channel.send !== "function") {
    console.error(`${action} log channel ${channelId} is not a writable text channel.`);
    return;
  }

  const isJoin = action === "joined";
  const embed = new EmbedBuilder()
    .setColor(isJoin ? 0x57f287 : 0xed4245)
    .setTitle(member.user.username)
    .setDescription(`<@${member.id}> ${action} the server.`)
    .addFields({
      name: "◉ Age of account:",
      value: `${member.user.createdAt.toLocaleDateString("en-GB")}\n${accountAgeText(member.user.createdTimestamp)}`,
      inline: false,
    })
    .setFooter({
      text: `${member.guild.name} • ${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
    })
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }));

  if (isJoin && member.joinedAt) {
    embed.addFields({
      name: "Joined at:",
      value: member.joinedAt.toLocaleString("en-GB"),
      inline: false,
    });
  }

  await channel.send({ embeds: [embed] }).catch((error) => {
    console.error(`Could not send member ${action} log for ${member.user.tag}:`, error.message);
  });
}

client.on("guildMemberAdd", async (member) => {
  await logMemberInvite(member);
  await sendMemberLog(member, MEMBER_JOIN_LOG_CHANNEL_ID, "joined");

  if (member.guild.id !== AUTO_ROLE_GUILD_ID) return;

  const role = await member.guild.roles.fetch(AUTO_ROLE_ID).catch((error) => {
    console.error(`Could not fetch auto-join role ${AUTO_ROLE_ID}:`, error.message);
    return null;
  });

  if (!role) return;

  const botMember = await member.guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.error(`Cannot assign auto-join role ${role.name}: missing Manage Roles permission.`);
    return;
  }

  if (role.managed || role.position >= botMember.roles.highest.position) {
    console.error(`Cannot assign auto-join role ${role.name}: role is managed or above the bot's highest role.`);
    return;
  }

  await member.roles.add(role, "Automatic role assignment on server join").catch((error) => {
    console.error(`Could not assign auto-join role to ${member.user.tag}:`, error.message);
  });
});

client.on("guildMemberRemove", async (member) => {
  await sendMemberLog(member, MEMBER_LEAVE_LOG_CHANNEL_ID, "left");
});

function buildPanelMessage() {
  const addButton = new ButtonBuilder()
    .setCustomId(ADD_BUTTON_ID)
    .setLabel("RECRUIT")
    .setStyle(ButtonStyle.Danger);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setDescription("RECRUIT A MEMBER TO D O T")
    .setImage(PANEL_IMAGE_URL);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(addButton)],
  };
}

function isPanelAdmin(interaction) {
  if (panelConfig.panelAdminUserId && interaction.user.id === panelConfig.panelAdminUserId) {
    return true;
  }

  return Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.Administrator));
}

function memberNameWithoutPrefix(member) {
  const currentName = member.nickname || member.user.globalName || member.user.username;

  if (currentName.startsWith(NAME_PREFIX)) {
    return currentName.slice(NAME_PREFIX.length).trim() || member.user.username;
  }

  if (currentName.startsWith(LEGACY_NAME_PREFIX)) {
    return currentName.slice(LEGACY_NAME_PREFIX.length).trim() || member.user.username;
  }

  return currentName;
}

async function broadcast(members, embed, label) {
  let sent = 0;
  let failed = 0;
  let index = 0;

  console.log(`Sending DM to ${members.size} member(s) of ${label}...`);

  for (const member of members.values()) {
    index += 1;
    try {
      await member.send({ embeds: [embed] });
      sent += 1;
      console.log(`[${index}/${members.size}] Sent to ${member.user.tag}`);
    } catch (error) {
      failed += 1;
      console.error(`[${index}/${members.size}] Failed to DM ${member.user.tag}:`, error.message);
    }
    if (index < members.size) await sleep(DM_DELAY_MS);
  }

  return { sent, failed };
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === ADD_BUTTON_ID) {
      if (!isPanelAdmin(interaction)) {
        await interaction.reply({
          content: "Only authorized staff can use this panel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const memberIdInput = new TextInputBuilder()
        .setCustomId(MEMBER_ID_INPUT_ID)
        .setLabel("Discord member ID")
        .setPlaceholder("Example: 123456789012345678")
        .setStyle(TextInputStyle.Short)
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true);

      const modal = new ModalBuilder()
        .setCustomId(ADD_MODAL_ID)
        .setTitle("Add D O T role")
        .addComponents(new ActionRowBuilder().addComponents(memberIdInput));

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === ADD_MODAL_ID) {
      if (!isPanelAdmin(interaction)) {
        await interaction.reply({
          content: "Only authorized staff can submit this panel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const memberId = interaction.fields.getTextInputValue(MEMBER_ID_INPUT_ID).trim();
      if (!/^\d{17,20}$/.test(memberId)) {
        await interaction.reply({
          content: "That does not look like a valid Discord member ID.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guild = interaction.guild || (await client.guilds.fetch(panelConfig.guildId).catch(() => null));
      if (!guild) {
        await interaction.editReply("I could not find the configured guild.");
        return;
      }

      const role = await guild.roles.fetch(panelConfig.roleId).catch(() => null);
      if (!role) {
        await interaction.editReply("The configured role could not be found. Check ROLE_ID.");
        return;
      }

      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        await interaction.editReply("I need the Manage Roles permission to assign the configured role.");
        return;
      }

      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        await interaction.editReply("I need the Manage Nicknames permission to update the member name.");
        return;
      }

      if (role.managed) {
        await interaction.editReply("The configured role is managed by an integration and cannot be assigned by this bot.");
        return;
      }

      if (role.position >= botMember.roles.highest.position) {
        await interaction.editReply("I cannot assign this role because it is above or equal to my highest role.");
        return;
      }

      const member = await guild.members.fetch(memberId).catch(() => null);
      if (!member) {
        await interaction.editReply("I could not find that member in the configured server.");
        return;
      }

      await member.roles.add(role, `Added by ${interaction.user.tag}`);

      if (!member.manageable) {
        await interaction.editReply(`Role assigned to **${member.user.tag}**, but I could not change the nickname. The member may be above my highest role.`);
        return;
      }

      const baseName = memberNameWithoutPrefix(member).toUpperCase();
      const nickname = `${NAME_PREFIX}${baseName}`.slice(0, 32);
      await member.setNickname(nickname, `D O T role assigned by ${interaction.user.tag}`);

      const welcomeChannel = panelConfig.welcomeChannelId
        ? await guild.channels.fetch(panelConfig.welcomeChannelId).catch(() => null)
        : null;

      if (!welcomeChannel || !welcomeChannel.isTextBased() || typeof welcomeChannel.send !== "function") {
        await interaction.editReply(`Role assigned and nickname changed to **${nickname}**, but I could not find a writable welcome channel.`);
        return;
      }

      await welcomeChannel.send(`Welcome <@${member.id}> to <@&${role.id}> as ${nickname}`);
      await interaction.editReply(`Role assigned and nickname changed to **${nickname}** for **${member.user.tag}**.`);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("dm_msg_modal_")) {
      const targetId = interaction.customId.replace("dm_msg_modal_", "");
      const heading = interaction.fields.getTextInputValue("dm_msg_heading");
      const content = interaction.fields.getTextInputValue("dm_msg_content");
      const banner = interaction.fields.getTextInputValue("dm_msg_banner");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guild = interaction.guild;
      let recipientCount = 0;
      let failedCount = 0;
      let targetRepresentation = "";

      const guildIcon = guild.iconURL({ size: 512 });
      const logo = config.serverLogo || guildIcon;
      const footerName = config.serverFullName || guild.name;

      const officialEmbed = new EmbedBuilder()
        .setColor(config.embedColor || "#00e1ff")
        .setDescription(`# ${heading}\n\n${content}`)
        .setTimestamp();

      const typedBanner = (banner || "").trim();
      const bannerUrl = /^https?:\/\//i.test(typedBanner)
        ? typedBanner
        : config.defaultBanner || "";
      if (/^https?:\/\//i.test(bannerUrl)) {
        officialEmbed.setImage(bannerUrl);
      }

      if (logo) officialEmbed.setThumbnail(logo);
      officialEmbed.setFooter({ text: footerName, iconURL: logo || undefined });

      const role = await guild.roles.fetch(targetId).catch(() => null);

      if (role) {
        targetRepresentation = `@${role.name} (${role.id})`;

        const members = await guild.members.fetch().catch(() => guild.members.cache);
        const roleMembers = members.filter((m) => m.roles.cache.has(role.id) && !m.user.bot);

        const result = await broadcast(roleMembers, officialEmbed, role.name);
        recipientCount = result.sent;
        failedCount = result.failed;
      } else {
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          return interaction.editReply("❌ Target user or role not found.");
        }

        targetRepresentation = `<@${member.id}> (${member.user.tag})`;
        try {
          await member.send({ embeds: [officialEmbed] });
          recipientCount = 1;
        } catch (error) {
          console.error(`Failed to DM user ${member.id}:`, error);
          failedCount = 1;
        }
      }

      if (LOG_CHANNEL_ID) {
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isTextBased()) {
          const logged = content.length > 1000 ? `${content.slice(0, 1000)}…` : content;

          const logEmbed = new EmbedBuilder()
            .setColor("#ff0000")
            .setTitle("DM SENT 😎")
            .addFields(
              { name: "Sender", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
              { name: "Target", value: targetRepresentation, inline: true },
              { name: "Sent Successfully", value: `\`${recipientCount}\``, inline: true },
              { name: "Failed (Closed DMs)", value: `\`${failedCount}\``, inline: true },
              { name: "Message Content", value: `\`\`\`${logged}\`\`\``, inline: false }
            )
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
      }

      const summary =
        recipientCount === 0 && failedCount > 0
          ? "❌ Failed to send DM. The target user(s) probably have DMs closed."
          : `✅ Official DM dispatch completed!\n📥 **Sent successfully:** \`${recipientCount}\` member(s)\n⚠️ **Failed (DMs closed):** \`${failedCount}\` member(s)`;

      await interaction.editReply(summary).catch(() => {
        console.log(`Interaction expired. Result: ${recipientCount} sent, ${failedCount} failed.`);
      });
      return;
    }
  } catch (error) {
    console.error("Interaction error:", error);

    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "An error occurred.",
          flags: MessageFlags.Ephemeral,
        });
      } else if (interaction.deferred) {
        await interaction.editReply("An error occurred.");
      }
    } catch (err) {
      console.error("Failed to send error message:", err);
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "TokenInvalid") {
    console.error("Discord rejected DISCORD_TOKEN. Reset the bot token and save the raw replacement token without `Bot `, quotes, or extra spaces.");
  } else {
    console.error("Could not log in to Discord:", error);
  }

  process.exitCode = 1;
});
