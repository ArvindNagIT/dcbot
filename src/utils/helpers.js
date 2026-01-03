export function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function calculateJoinAge(joinedAt) {
  if (!joinedAt) return 999;

  const now = new Date();
  const joined = new Date(joinedAt);
  const diffMs = now - joined;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return diffMinutes;
}

export function detectLinks(content) {
  const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|co|me|tv|bot)\b)/gi;
  return urlPattern.test(content);
}

export function detectImages(message) {
  if (message.attachments.size === 0) {
    return false;
  }

  for (const attachment of message.attachments.values()) {
    const ext = attachment.name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
      return true;
    }
  }

  return false;
}

export function sanitizeUsername(username) {
  return username.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function truncateString(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function formatTimestamp(date) {
  return new Date(date).toISOString();
}

export function parseDuration(durationString) {
  const units = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const match = durationString.match(/^(\d+)([smhd])$/);
  if (!match) return null;

  const [, amount, unit] = match;
  return parseInt(amount) * units[unit];
}

export function getRiskEmoji(riskLevel) {
  switch (riskLevel) {
    case 'SAFE':
      return '✅';
    case 'SUSPICIOUS':
      return '⚠️';
    case 'DANGEROUS':
      return '🚨';
    default:
      return '❓';
  }
}

export function getActionEmoji(action) {
  switch (action) {
    case 'ALLOW':
      return '✅';
    case 'WARN':
      return '⚠️';
    case 'DELETE':
      return '🗑️';
    case 'MUTE':
      return '🔇';
    case 'KICK':
      return '🚫';
    case 'CAPTCHA':
      return '🔐';
    default:
      return '❓';
  }
}