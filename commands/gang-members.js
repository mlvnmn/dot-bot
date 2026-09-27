const {
  EmbedBuilder,
  SlashCommandBuilder,
} = require("discord.js");

const MAX_DESCRIPTION_LENGTH = 3800;
const COUNT_CHANNEL_ID = "1551652034371915907";
const COUNT_MESSAGE_MARKER = "<!-- gang-members-count -->";
const PRIORITY_ROLE_ID = "1550229790815162448";

function buildMemberLines(members) {
  return members
    .sort((left, right) => {
      const leftHasPriorityRole = left.roles.cache.has(PRIORITY_ROLE_ID);
      const rightHasPriorityRole = right.roles.cache.has(PRIORITY_ROLE_ID);

      if (leftHasPriorityRole !== rightHasPriorityRole) {
        return leftHasPriorityRole ? -1 : 1;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .map((member, index) => `${index + 1}. **${member.displayName}** - <@${member.id}>`);
}

function splitLines(lines) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    if (current && `${current}\n${line}`.length > MAX_DESCRIPTION_LENGTH) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function updateCountMessage(guild, role, total) {
  const channel = await guild.channels.fetch(COUNT_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased() || !channel.messages) return;

  const countEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${role.name} Members`)
    .setDescription(`**Total Members:** ${total}`)
    .setTimestamp();

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existingMessage = messages?.find(
    (message) => message.author.id === guild.client.user.id && message.content === COUNT_MESSAGE_MARKER
  );

  if (existingMessage) {
    await existingMessage.edit({ embeds: [countEmbed] });
    return;
  }

  await channel.send({
    content: COUNT_MESSAGE_MARKER,
    embeds: [countEmbed],
  });
}

async function deleteOldMemberLists(channel, botUserId) {
  if (!channel?.messages) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  const oldLists = messages.filter(
    (message) =>
      message.author.id === botUserId &&
      message.embeds.some(
        (embed) => embed.title?.endsWith(" Members") && embed.footer?.text?.startsWith("Page ")
      )
  );

  await Promise.all(oldLists.map((message) => message.delete().catch(() => null)));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gang-members")
    .setDescription("Show members who have a specified role")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("The role whose members should be listed")
        .setRequired(true)
    ),

  async execute(interaction) {
    const role = interaction.options.getRole("role", true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({
        content: "This command can only be used inside a server.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    await guild.members.fetch();

    const members = [...role.members.values()].filter((member) => !member.user.bot);
    const lines = buildMemberLines(members);
    const chunks = splitLines(lines);
    const total = members.length;

    await updateCountMessage(guild, role, total);
    await deleteOldMemberLists(interaction.channel, guild.client.user.id);

    if (total === 0) {
      await interaction.editReply(`No human members currently have the ${role} role.`);
      return;
    }

    const embeds = chunks.map((description, index) =>
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(index === 0 ? `📊 ${role.name} Members` : `${role.name} Members`)
        .setDescription(index === 0 ? `**Total Members:** ${total}\n\n**Member List:**\n${description}` : description)
        .setFooter({ text: `Page ${index + 1}/${chunks.length}` })
    );

    await interaction.channel.send({
      embeds,
      allowedMentions: { parse: [] },
    });

    await interaction.editReply("The gang member list was refreshed.");
  },
};
