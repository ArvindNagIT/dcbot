import { Client, GatewayIntentBits, Partials } from 'discord.js';
import {
  getOrCreateUser,
  getOrCreateServerMember,
  logMessage,
  getRecentMessages,
  getUserWarnings,
  logModerationAction,
  addWarning,
  updateAverageRiskScore
} from '../database/supabase.js';
import { analyzeMessage } from '../moderation/engine.js';
import { executeAction } from './actions.js';
import { calculateAccountAge, calculateJoinAge, detectLinks, detectImages } from '../utils/helpers.js';

export function createBot(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
  });

  client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    console.log(`Monitoring ${client.guilds.cache.size} server(s)`);
    console.log('AI Moderation Engine: ACTIVE');
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    try {
      await handleMessage(message);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  return client;
}

async function handleMessage(message) {
  const discordUser = message.author;
  const member = message.member;
  const guild = message.guild;

  const accountAgeDays = calculateAccountAge(discordUser.createdAt);
  const joinAgeMinutes = member ? calculateJoinAge(member.joinedAt) : 999;

  const dbUser = await getOrCreateUser(discordUser, discordUser.createdAt.toISOString());

  if (member) {
    await getOrCreateServerMember(dbUser.id, guild.id, member.joinedAt.toISOString());
  }

  const recentMessages = await getRecentMessages(dbUser.id, guild.id, 5);
  const messageHistory = recentMessages.map(msg => `[${msg.message_length} chars]`);

  const warnings = await getUserWarnings(dbUser.id, guild.id);

  const hasAttachments = message.attachments.size > 0;
  const hasLinks = detectLinks(message.content);
  const hasImages = detectImages(message);

  const messageLog = await logMessage({
    messageId: message.id,
    userId: dbUser.id,
    guildId: guild.id,
    channelId: message.channel.id,
    content: message.content,
    hasAttachments: hasAttachments,
    hasLinks: hasLinks,
    hasImages: hasImages
  });

  const moderationInput = {
    message_content: message.content,
    message_history: messageHistory,
    user_account_age_days: accountAgeDays,
    server_join_age_minutes: joinAgeMinutes,
    attachments_present: hasAttachments,
    links_present: hasLinks,
    image_uploaded: hasImages,
    previous_warnings_count: warnings.length,
    captcha_verified: dbUser.captcha_verified
  };

  const moderationResult = analyzeMessage(moderationInput);

  console.log(`[MODERATION] User: ${discordUser.tag} | Risk: ${moderationResult.risk_score} (${moderationResult.risk_level}) | Action: ${moderationResult.recommended_action}`);

  const actionTaken = await executeAction(message, member, moderationResult);

  const moderationAction = await logModerationAction({
    messageId: messageLog.id,
    userId: dbUser.id,
    guildId: guild.id,
    riskScore: moderationResult.risk_score,
    riskLevel: moderationResult.risk_level,
    detectedCategories: moderationResult.detected_categories,
    recommendedAction: moderationResult.recommended_action,
    actionTaken: actionTaken,
    reasoning: moderationResult.reasoning
  });

  if (actionTaken !== 'ALLOW' && actionTaken !== 'CAPTCHA') {
    const severity = moderationResult.risk_level === 'DANGEROUS' ? 'HIGH' : 'MEDIUM';
    await addWarning(dbUser.id, guild.id, moderationAction.id, moderationResult.reasoning, severity);
  }

  await updateAverageRiskScore(dbUser.id);
}