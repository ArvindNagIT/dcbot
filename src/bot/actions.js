import { PermissionFlagsBits } from 'discord.js';

export async function executeAction(message, member, moderationResult) {
  const { recommended_action, risk_level, reasoning, detected_categories } = moderationResult;

  try {
    switch (recommended_action) {
      case 'ALLOW':
        return 'ALLOW';

      case 'CAPTCHA':
        await handleCaptchaRequired(message, member);
        return 'CAPTCHA';

      case 'WARN':
        await handleWarn(message, reasoning);
        return 'WARN';

      case 'DELETE':
        await handleDelete(message, reasoning);
        return 'DELETE';

      case 'MUTE':
        await handleMute(message, member, reasoning);
        return 'MUTE';

      case 'KICK':
        await handleKick(message, member, reasoning);
        return 'KICK';

      default:
        console.warn(`Unknown action: ${recommended_action}`);
        return 'ALLOW';
    }
  } catch (error) {
    console.error(`Error executing action ${recommended_action}:`, error);
    return 'ERROR';
  }
}

async function handleCaptchaRequired(message, member) {
  try {
    if (message.deletable) {
      await message.delete();
    }

    const captchaMessage = await message.channel.send(
      `⚠️ <@${message.author.id}>, your account is new or has been flagged. Please complete CAPTCHA verification before posting.\n\n` +
      `To verify, use the command: \`!verify\`\n\n` +
      `This is a safety measure to protect our community from spam and malicious activity.`
    );

    setTimeout(() => {
      captchaMessage.delete().catch(console.error);
    }, 30000);

    if (member && member.moderatable) {
      await member.timeout(5 * 60 * 1000, 'CAPTCHA verification required');
    }
  } catch (error) {
    console.error('Error handling CAPTCHA requirement:', error);
  }
}

async function handleWarn(message, reasoning) {
  try {
    const warningMessage = await message.channel.send(
      `⚠️ Warning <@${message.author.id}>: Your message has been flagged by our moderation system.\n\n` +
      `**Reason:** ${reasoning}\n\n` +
      `Please review our community guidelines. Repeated violations may result in further action.`
    );

    setTimeout(() => {
      warningMessage.delete().catch(console.error);
    }, 20000);
  } catch (error) {
    console.error('Error sending warning:', error);
  }
}

async function handleDelete(message, reasoning) {
  try {
    if (message.deletable) {
      await message.delete();
    }

    const notificationMessage = await message.channel.send(
      `🗑️ A message from <@${message.author.id}> was removed by our moderation system.\n\n` +
      `**Reason:** Violation detected\n\n` +
      `This action has been logged. Continued violations may result in timeout or removal from the server.`
    );

    setTimeout(() => {
      notificationMessage.delete().catch(console.error);
    }, 15000);

    try {
      await message.author.send(
        `Your message in **${message.guild.name}** was automatically removed.\n\n` +
        `**Reason:** ${reasoning}\n\n` +
        `Please be mindful of our community guidelines. If you believe this was an error, contact a moderator.`
      );
    } catch (dmError) {
      console.log('Could not DM user about deletion');
    }
  } catch (error) {
    console.error('Error deleting message:', error);
  }
}

async function handleMute(message, member, reasoning) {
  try {
    if (message.deletable) {
      await message.delete();
    }

    if (!member || !member.moderatable) {
      console.warn('Cannot mute user: insufficient permissions or user is moderator');
      await handleDelete(message, reasoning);
      return;
    }

    const muteDuration = 10 * 60 * 1000;

    await member.timeout(muteDuration, `Moderation system: ${reasoning}`);

    const muteMessage = await message.channel.send(
      `🔇 <@${message.author.id}> has been temporarily muted for 10 minutes.\n\n` +
      `**Reason:** ${reasoning}\n\n` +
      `This action has been logged. Repeated violations will result in longer timeouts or removal.`
    );

    setTimeout(() => {
      muteMessage.delete().catch(console.error);
    }, 15000);

    try {
      await message.author.send(
        `You have been temporarily muted in **${message.guild.name}** for 10 minutes.\n\n` +
        `**Reason:** ${reasoning}\n\n` +
        `Please review our community guidelines. Repeated violations may result in permanent removal.`
      );
    } catch (dmError) {
      console.log('Could not DM user about mute');
    }
  } catch (error) {
    console.error('Error muting user:', error);
    await handleDelete(message, reasoning);
  }
}

async function handleKick(message, member, reasoning) {
  try {
    if (message.deletable) {
      await message.delete();
    }

    if (!member || !member.kickable) {
      console.warn('Cannot kick user: insufficient permissions or user is moderator');
      await handleMute(message, member, reasoning);
      return;
    }

    try {
      await message.author.send(
        `You have been removed from **${message.guild.name}**.\n\n` +
        `**Reason:** ${reasoning}\n\n` +
        `Our AI moderation system detected severe violations of community guidelines. ` +
        `If you believe this was an error, please contact the server administrators.`
      );
    } catch (dmError) {
      console.log('Could not DM user about kick');
    }

    await member.kick(`Moderation system: ${reasoning}`);

    const kickMessage = await message.channel.send(
      `🚫 A user has been removed from the server by our moderation system.\n\n` +
      `**Reason:** Severe violation detected\n\n` +
      `This action has been logged and reviewed.`
    );

    setTimeout(() => {
      kickMessage.delete().catch(console.error);
    }, 20000);

    const modChannel = await findModLogChannel(message.guild);
    if (modChannel) {
      await modChannel.send(
        `**[AUTO-KICK]**\n` +
        `User: ${message.author.tag} (${message.author.id})\n` +
        `Reason: ${reasoning}\n` +
        `Channel: ${message.channel.name}\n` +
        `Time: ${new Date().toISOString()}`
      );
    }
  } catch (error) {
    console.error('Error kicking user:', error);
    await handleMute(message, member, reasoning);
  }
}

async function findModLogChannel(guild) {
  const possibleNames = ['mod-log', 'modlog', 'mod-logs', 'audit-log', 'logs'];

  for (const name of possibleNames) {
    const channel = guild.channels.cache.find(
      ch => ch.name === name && ch.isTextBased()
    );
    if (channel) return channel;
  }

  return null;
}