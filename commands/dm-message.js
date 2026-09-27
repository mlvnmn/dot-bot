const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");

const config = require("../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dm-message")
    .setDescription("Send an official DM from the bot to a user or all members of a role (Admins only)")
    .addMentionableOption(option =>
      option
        .setName("target")
        .setDescription("The user or role to send the DM to")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Administrators, or anyone holding the configured management role
    const managementRoleId = config["management-role"];
    const hasManagementRole = managementRoleId && interaction.member.roles.cache.has(managementRoleId);
    const isAdministrator = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isAdministrator && !hasManagementRole) {
      return interaction.reply({
        content: "❌ Only Server Administrators or Management have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getMentionable("target");

    // Create the modal
    const modal = new ModalBuilder()
      .setCustomId(`dm_msg_modal_${target.id}`)
      .setTitle("Official DM Message");

    const headingInput = new TextInputBuilder()
      .setCustomId("dm_msg_heading")
      .setLabel("Heading")
      .setValue("🥷🏻 GANG CALL")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(200)
      .setRequired(true);

    const messageInput = new TextInputBuilder()
      .setCustomId("dm_msg_content")
      .setLabel("Message")
      .setPlaceholder("Enter the message content you want to send here...")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(3500)
      .setRequired(true);

    const bannerInput = new TextInputBuilder()
      .setCustomId("dm_msg_banner")
      .setLabel("Banner Link (Optional)")
      .setPlaceholder("Leave blank to use the default banner")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(500)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(headingInput),
      new ActionRowBuilder().addComponents(messageInput),
      new ActionRowBuilder().addComponents(bannerInput)
    );

    // Show the modal to the user
    await interaction.showModal(modal);
  },
};
