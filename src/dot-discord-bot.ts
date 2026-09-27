import "dotenv/config";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const config = {
  token: process.env.DISCORD_TOKEN?.trim(),
  guildId: process.env.GUILD_ID || "896624506687356928",
  roleId: process.env.ROLE_ID || "1515302781853106318",
  panelChannelId: process.env.PANEL_CHANNEL_ID || "1552032078688681994",
  welcomeChannelId:
    process.env.WELCOME_CHANNEL_ID || "1551650849082580992",
  panelAdminUserId: process.env.PANEL_ADMIN_USER_ID,
};

if (!config.token) {
  throw new Error(
    "DISCORD_TOKEN is not configured. Add it as a project secret before starting the bot."
  );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const PANEL_COMMAND_NAME = "panel";
const ADD_BUTTON_ID = "dot_add_member";
const ADD_MODAL_ID = "dot_add_member_modal";
const MEMBER_ID_INPUT_ID = "dot_member_id";
const NAME_PREFIX = "DOT | ";
const LEGACY_NAME_PREFIX = "D O T | ";
const PANEL_IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1187426538279420076/1551970592494718986/IMG_3579.gif?ex=6ab3e8bf&is=6ab2973f&hm=7650356396220c22317fbeee3f4001b9668c1f41c5941db99e2fe78ba84bd574&";

function isPanelAdmin(interaction: {
  user: { id: string };
  memberPermissions: Readonly<PermissionsBitField> | null;
}) {
  if (
    config.panelAdminUserId &&
    interaction.user.id === config.panelAdminUserId
  ) {
    return true;
  }

  return Boolean(
    interaction.memberPermissions?.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

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
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(addButton)],
  };
}

function memberNameWithoutPrefix(member: {
  nickname: string | null;
  user: { globalName: string | null; username: string };
}) {
  const currentName =
    member.nickname || member.user.globalName || member.user.username;

  if (currentName.startsWith(NAME_PREFIX)) {
    return currentName.slice(NAME_PREFIX.length).trim() || member.user.username;
  }

  return currentName.startsWith(LEGACY_NAME_PREFIX)
    ? currentName.slice(LEGACY_NAME_PREFIX.length).trim() ||
        member.user.username
    : currentName;
}

async function registerPanelCommandForGuild(guild: {
  id: string;
  name: string;
  commands: {
    set: (commands: {
      name: string;
      description: string;
    }[]) => Promise<unknown>;
  };
}) {
  await guild.commands.set([
    {
      name: PANEL_COMMAND_NAME,
      description: "Send the D O T role assignment panel",
    },
  ]);

  console.log(
    `Registered /${PANEL_COMMAND_NAME} in ${guild.name} (${guild.id}).`
  );
}

async function registerPanelCommand() {
  const guild =
    client.guilds.cache.get(config.guildId) ||
    (await client.guilds.fetch(config.guildId).catch(() => null));

  if (!guild) {
    const visibleGuilds =
      client.guilds.cache
        .map((visibleGuild) => `${visibleGuild.name} (${visibleGuild.id})`)
        .join(", ") || "none";

    throw new Error(
      `The bot is not in GUILD_ID ${config.guildId}. ` +
        `Invite this bot to that server, or update GUILD_ID. ` +
        `Servers currently visible to the bot: ${visibleGuilds}`
    );
  }

  await registerPanelCommandForGuild(guild);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
  console.log(`Bot user ID: ${readyClient.user.id}`);
  console.log(
    `Invite URL: https://discord.com/oauth2/authorize?client_id=${readyClient.user.id}&permissions=2550205440&scope=bot%20applications.commands`
  );

  try {
    await registerPanelCommand();
  } catch (error) {
    console.error("Could not register /panel:", error);
    process.exitCode = 1;
  }
});

client.on(Events.GuildCreate, async (guild) => {
  if (guild.id !== config.guildId) return;

  try {
    await registerPanelCommandForGuild(guild);
  } catch (error) {
    console.error("Could not register /panel after joining the server:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== PANEL_COMMAND_NAME) return;

      if (!isPanelAdmin(interaction)) {
        await interaction.reply({
          content: "Only administrators can send the panel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.channelId !== config.panelChannelId) {
        await interaction.reply({
          content: `Use this command in <#${config.panelChannelId}>.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = interaction.channel;
      if (
        !channel ||
        !channel.isTextBased() ||
        !("send" in channel) ||
        typeof channel.send !== "function"
      ) {
        await interaction.reply({
          content: "This command can only be used in a text channel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await channel.send(buildPanelMessage());
      await interaction.reply({
        content: "The role assignment panel was sent.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId !== ADD_BUTTON_ID) return;

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
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(memberIdInput)
        );

      await interaction.showModal(modal);
      return;
    }

    if (!interaction.isModalSubmit() || interaction.customId !== ADD_MODAL_ID) {
      return;
    }

    if (!isPanelAdmin(interaction)) {
      await interaction.reply({
        content: "Only authorized staff can submit this panel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberId = interaction.fields
      .getTextInputValue(MEMBER_ID_INPUT_ID)
      .trim();

    if (!/^\d{17,20}$/.test(memberId)) {
      await interaction.reply({
        content: "That does not look like a valid Discord member ID.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = await client.guilds.fetch(config.guildId);
    const role = await guild.roles.fetch(config.roleId);

    if (!role) {
      await interaction.editReply(
        "The configured role could not be found. Check ROLE_ID."
      );
      return;
    }

    const botMember = await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.editReply(
        "I need the Manage Roles permission to assign the configured role."
      );
      return;
    }

    if (
      !botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)
    ) {
      await interaction.editReply(
        "I need the Manage Nicknames permission to update the member name."
      );
      return;
    }

    if (role.managed) {
      await interaction.editReply(
        "The configured role is managed by an integration and cannot be assigned by this bot."
      );
      return;
    }

    if (role.position >= botMember.roles.highest.position) {
      await interaction.editReply(
        "I cannot assign this role because it is above or equal to my highest role. Move the bot role above the target role."
      );
      return;
    }

    const member = await guild.members.fetch(memberId).catch(() => null);
    if (!member) {
      await interaction.editReply(
        "I could not find that member in the configured server."
      );
      return;
    }

    await member.roles.add(role, `Added by ${interaction.user.tag}`);

    if (!member.manageable) {
      await interaction.editReply(
        `Role assigned to **${member.user.tag}**, but I could not change the nickname. The member may be above my highest role.`
      );
      return;
    }

    const baseName = memberNameWithoutPrefix(member).toUpperCase();
    const nickname = `${NAME_PREFIX}${baseName}`.slice(0, 32);

    await member.setNickname(
      nickname,
      `D O T role assigned by ${interaction.user.tag}`
    );

    const welcomeChannel = await guild.channels.fetch(
      config.welcomeChannelId
    );

    if (
      !welcomeChannel ||
      !welcomeChannel.isTextBased() ||
      !("send" in welcomeChannel) ||
      typeof welcomeChannel.send !== "function"
    ) {
      await interaction.editReply(
        `Role assigned and nickname changed to **${nickname}**, but I could not find a writable welcome channel.`
      );
      return;
    }

    await welcomeChannel.send(
      `Welcome <@${member.id}> to <@&${config.roleId}> as ${nickname}`
    );

    await interaction.editReply(
      `Role assigned and nickname changed to **${nickname}** for **${member.user.tag}**.`
    );
  } catch (error) {
    console.error("Interaction error:", error);

    const errorCode =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    const message =
      errorCode === 50001
        ? `I cannot send messages in <#${config.panelChannelId}>. Give the bot View Channel, Send Messages, and Read Message History permissions there.`
        : errorCode === 50013
          ? "Discord denied this action. Check the bot's Manage Roles, Manage Nicknames, and role hierarchy."
          : "Something went wrong. Check the bot permissions and role hierarchy.";

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(message).catch(() => {});
      } else {
        await interaction
          .reply({ content: message, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

void client.login(config.token).catch((error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "TokenInvalid"
  ) {
    console.error(
      "Discord rejected DISCORD_TOKEN. Reset the bot token and save the raw replacement token without `Bot `, quotes, or extra spaces."
    );
  } else {
    console.error("Could not log in to Discord:", error);
  }

  process.exitCode = 1;
});