import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function getOrCreateUser(discordUser, accountCreatedAt) {
  const { data: existingUser, error: fetchError } = await supabase
    .from('discord_users')
    .select('*')
    .eq('discord_user_id', discordUser.id)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching user:', fetchError);
    throw fetchError;
  }

  if (existingUser) {
    return existingUser;
  }

  const { data: newUser, error: insertError } = await supabase
    .from('discord_users')
    .insert({
      discord_user_id: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator || '0',
      account_created_at: accountCreatedAt,
      first_seen_at: new Date().toISOString()
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating user:', insertError);
    throw insertError;
  }

  return newUser;
}

export async function getOrCreateServerMember(userId, guildId, joinedAt) {
  const { data: existingMember, error: fetchError } = await supabase
    .from('server_members')
    .select('*')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching server member:', fetchError);
    throw fetchError;
  }

  if (existingMember) {
    return existingMember;
  }

  const { data: newMember, error: insertError } = await supabase
    .from('server_members')
    .insert({
      user_id: userId,
      guild_id: guildId,
      joined_at: joinedAt
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating server member:', insertError);
    throw insertError;
  }

  return newMember;
}

export async function logMessage(messageData) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      message_id: messageData.messageId,
      user_id: messageData.userId,
      guild_id: messageData.guildId,
      channel_id: messageData.channelId,
      content_hash: hashContent(messageData.content),
      has_attachments: messageData.hasAttachments,
      has_links: messageData.hasLinks,
      has_images: messageData.hasImages,
      message_length: messageData.content.length
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging message:', error);
    throw error;
  }

  return data;
}

export async function getRecentMessages(userId, guildId, limit = 10) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent messages:', error);
    throw error;
  }

  return data || [];
}

export async function getUserWarnings(userId, guildId) {
  const { data, error } = await supabase
    .from('user_warnings')
    .select('*')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching warnings:', error);
    throw error;
  }

  return data || [];
}

export async function logModerationAction(actionData) {
  const { data, error } = await supabase
    .from('moderation_actions')
    .insert({
      message_id: actionData.messageId,
      user_id: actionData.userId,
      guild_id: actionData.guildId,
      risk_score: actionData.riskScore,
      risk_level: actionData.riskLevel,
      detected_categories: actionData.detectedCategories,
      recommended_action: actionData.recommendedAction,
      action_taken: actionData.actionTaken,
      reasoning: actionData.reasoning
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging moderation action:', error);
    throw error;
  }

  return data;
}

export async function addWarning(userId, guildId, moderationActionId, reason, severity) {
  const { data, error } = await supabase
    .from('user_warnings')
    .insert({
      user_id: userId,
      guild_id: guildId,
      moderation_action_id: moderationActionId,
      warning_reason: reason,
      severity: severity
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding warning:', error);
    throw error;
  }

  await updateUserWarningCount(userId, guildId);

  return data;
}

export async function updateUserWarningCount(userId, guildId) {
  const warnings = await getUserWarnings(userId, guildId);

  const { error: userError } = await supabase
    .from('discord_users')
    .update({ total_warnings: warnings.length })
    .eq('id', userId);

  if (userError) {
    console.error('Error updating user warning count:', userError);
  }

  const { error: memberError } = await supabase
    .from('server_members')
    .update({ server_warnings: warnings.length })
    .eq('user_id', userId)
    .eq('guild_id', guildId);

  if (memberError) {
    console.error('Error updating member warning count:', memberError);
  }
}

export async function updateCaptchaStatus(userId, verified) {
  const { data, error } = await supabase
    .from('discord_users')
    .update({
      captcha_verified: verified,
      captcha_verified_at: verified ? new Date().toISOString() : null
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating CAPTCHA status:', error);
    throw error;
  }

  return data;
}

export async function updateAverageRiskScore(userId) {
  const { data: actions, error } = await supabase
    .from('moderation_actions')
    .select('risk_score')
    .eq('user_id', userId);

  if (error || !actions || actions.length === 0) {
    return;
  }

  const avgScore = actions.reduce((sum, action) => sum + action.risk_score, 0) / actions.length;

  await supabase
    .from('discord_users')
    .update({ average_risk_score: avgScore.toFixed(2) })
    .eq('id', userId);
}