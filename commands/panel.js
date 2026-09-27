const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const config = require("../config.json");

const PANEL_IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1187426538279420076/1551970592494718986/IMG_3579.gif?ex=6ab3e8bf&is=6ab2973f&hm=7650356396220c22317fbeee3f4001b9668c1f41c5941db99e2fe78ba84bd574&";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send the D O T recruitment panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = process.env.GUILD_ID || config.guildId || interaction.guildId;
    const panelChannelId = process.env.PANEL_CHANNEL_ID || config.panelChannelId;
    const panelAdminUserId = process.env.PANEL_ADMIN_USER_ID || config.panelAdminUserId;

    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isPanelAdmin = panelAdminUserId && interaction.user.id === panelAdminUserId;

    if (!isAdmin && !isPanelAdmin) {
      return interaction.reply({
        content: "Only administrators can send the panel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (panelChannelId && interaction.channelId !== panelChannelId) {
      return interaction.reply({
        content: `Use this command in <#${panelChannelId}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = interaction.guild;
    if (!guild || guild.id !== guildId) {
      return interaction.reply({
        content: "This command can only be used in the configured guild.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const addButton = new ButtonBuilder()
      .setCustomId("dot_add_member")
      .setLabel("RECRUIT")
      .setStyle(ButtonStyle.Danger);

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription("RECRUIT A MEMBER TO D O T")
      .setImage(PANEL_IMAGE_URL);

    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(addButton)],
    });

    await interaction.reply({
      content: "The role assignment panel was sent.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
