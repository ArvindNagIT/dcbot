export function analyzeMessage(input) {
  const {
    message_content,
    message_history = [],
    user_account_age_days,
    server_join_age_minutes,
    attachments_present,
    links_present,
    image_uploaded,
    previous_warnings_count,
    captcha_verified
  } = input;

  const detectedCategories = [];
  let riskScore = 0;

  if (shouldRequireCaptcha(input)) {
    return {
      risk_score: 50,
      risk_level: 'SUSPICIOUS',
      detected_categories: ['NEW_USER_UNVERIFIED'],
      recommended_action: 'CAPTCHA',
      reasoning: 'New or flagged user has not completed CAPTCHA verification. Temporarily restricting messaging until verification is complete.'
    };
  }

  const contentAnalysis = analyzeContent(message_content);
  detectedCategories.push(...contentAnalysis.categories);
  riskScore += contentAnalysis.score;

  const behaviorAnalysis = analyzeBehavior(message_history, message_content);
  detectedCategories.push(...behaviorAnalysis.categories);
  riskScore += behaviorAnalysis.score;

  const accountAnalysis = analyzeAccount(user_account_age_days, server_join_age_minutes);
  detectedCategories.push(...accountAnalysis.categories);
  riskScore += accountAnalysis.score;

  const attachmentAnalysis = analyzeAttachments(attachments_present, links_present, image_uploaded);
  detectedCategories.push(...attachmentAnalysis.categories);
  riskScore += attachmentAnalysis.score;

  if (previous_warnings_count > 0) {
    riskScore += Math.min(previous_warnings_count * 10, 25);
    detectedCategories.push('REPEAT_OFFENDER');
  }

  riskScore = Math.min(Math.max(riskScore, 0), 100);

  const riskLevel = determineRiskLevel(riskScore);
  const recommendedAction = determineAction(riskScore, riskLevel, previous_warnings_count);
  const reasoning = generateReasoning(riskScore, riskLevel, detectedCategories, previous_warnings_count);

  return {
    risk_score: riskScore,
    risk_level: riskLevel,
    detected_categories: detectedCategories,
    recommended_action: recommendedAction,
    reasoning: reasoning
  };
}

function shouldRequireCaptcha(input) {
  const {
    user_account_age_days,
    server_join_age_minutes,
    previous_warnings_count,
    captcha_verified
  } = input;

  if (captcha_verified) {
    return false;
  }

  return (
    user_account_age_days < 7 ||
    server_join_age_minutes < 10 ||
    previous_warnings_count > 0
  );
}

function analyzeContent(content) {
  const categories = [];
  let score = 0;

  const lowerContent = content.toLowerCase();

  const spamPatterns = [
    /(.)\1{10,}/,
    /@everyone|@here/gi,
    /\b(buy|shop|discount|free|prize|winner|click here|limited time)\b/gi
  ];

  const scamPatterns = [
    /\b(free nitro|discord nitro|steam gift|gift card|prize)\b/gi,
    /\b(verify account|click link|dm me|check dm)\b/gi,
    /bit\.ly|tinyurl|shorturl/gi
  ];

  const harassmentPatterns = [
    /\b(kill yourself|kys|die|h8|fck|btch)\b/gi,
    /\b(idiot|stupid|dumb|loser|trash)\b/gi
  ];

  let spamMatches = 0;
  spamPatterns.forEach(pattern => {
    if (pattern.test(content)) spamMatches++;
  });

  if (spamMatches > 0) {
    categories.push('SPAM');
    score += spamMatches * 15;
  }

  let scamMatches = 0;
  scamPatterns.forEach(pattern => {
    if (pattern.test(content)) scamMatches++;
  });

  if (scamMatches > 0) {
    categories.push('SCAM');
    score += scamMatches * 25;
  }

  let harassmentMatches = 0;
  harassmentPatterns.forEach(pattern => {
    if (pattern.test(content)) harassmentMatches++;
  });

  if (harassmentMatches > 0) {
    categories.push('HARASSMENT');
    score += harassmentMatches * 20;
  }

  if (content.length > 1500) {
    categories.push('EXCESSIVE_LENGTH');
    score += 10;
  }

  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.7 && content.length > 20) {
    categories.push('EXCESSIVE_CAPS');
    score += 10;
  }

  return { categories, score };
}

function analyzeBehavior(messageHistory, currentMessage) {
  const categories = [];
  let score = 0;

  if (messageHistory.length >= 3) {
    const recentMessages = messageHistory.slice(0, 3);
    const allSimilar = recentMessages.every(msg =>
      msg.toLowerCase() === currentMessage.toLowerCase()
    );

    if (allSimilar) {
      categories.push('REPETITIVE_MESSAGING');
      score += 20;
    }
  }

  if (messageHistory.length >= 5) {
    categories.push('RAPID_MESSAGING');
    score += 15;
  }

  return { categories, score };
}

function analyzeAccount(accountAgeDays, joinAgeMinutes) {
  const categories = [];
  let score = 0;

  if (accountAgeDays < 1) {
    categories.push('VERY_NEW_ACCOUNT');
    score += 20;
  } else if (accountAgeDays < 7) {
    categories.push('NEW_ACCOUNT');
    score += 10;
  }

  if (joinAgeMinutes < 5) {
    categories.push('IMMEDIATE_POST_JOIN');
    score += 15;
  } else if (joinAgeMinutes < 30) {
    categories.push('RECENT_JOIN');
    score += 8;
  }

  return { categories, score };
}

function analyzeAttachments(hasAttachments, hasLinks, hasImages) {
  const categories = [];
  let score = 0;

  if (hasLinks) {
    categories.push('CONTAINS_LINKS');
    score += 10;
  }

  if (hasAttachments || hasImages) {
    categories.push('HAS_ATTACHMENTS');
    score += 5;
  }

  return { categories, score };
}

function determineRiskLevel(score) {
  if (score <= 30) return 'SAFE';
  if (score <= 65) return 'SUSPICIOUS';
  return 'DANGEROUS';
}

function determineAction(score, riskLevel, warningCount) {
  if (riskLevel === 'SAFE') {
    return 'ALLOW';
  }

  if (riskLevel === 'SUSPICIOUS') {
    if (warningCount === 0) {
      return 'WARN';
    } else if (warningCount === 1) {
      return 'DELETE';
    } else {
      return 'MUTE';
    }
  }

  if (riskLevel === 'DANGEROUS') {
    if (score >= 85 && warningCount >= 2) {
      return 'KICK';
    } else if (score >= 70) {
      return 'MUTE';
    } else {
      return 'DELETE';
    }
  }

  return 'WARN';
}

function generateReasoning(score, level, categories, warningCount) {
  let reasoning = `Risk assessment: ${score}/100 (${level}). `;

  if (categories.length === 0) {
    reasoning += 'No violations detected. Message appears safe.';
    return reasoning;
  }

  reasoning += `Detected: ${categories.join(', ')}. `;

  if (warningCount > 0) {
    reasoning += `User has ${warningCount} previous warning(s). `;
  }

  if (level === 'SUSPICIOUS') {
    reasoning += 'Monitoring user activity. Warning issued for borderline content.';
  } else if (level === 'DANGEROUS') {
    reasoning += 'High confidence violation detected. Immediate action required to protect community.';
  }

  return reasoning;
}