'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { toPositiveInt } = require('./util');

const DEFAULT_FORM_ENDPOINT = 'https://formspree.io/f/xvkoraeq';

function parseEmailList(value) {
  if (Array.isArray(value)) {
    return value.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  }

  return String(value ?? '')
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function loadSecret(runtimeDir, override) {
  if (override) return String(override);
  if (process.env.MOMENTS_SECRET) return process.env.MOMENTS_SECRET;

  const secretFile = path.join(runtimeDir, 'secret.key');

  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // A first run (or an ephemeral disk) simply gets a fresh secret.
  }

  const secret = crypto.randomBytes(32).toString('hex');

  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch (error) {
    console.warn(`[labroute] Could not persist the cookie secret: ${error.message}`);
  }

  return secret;
}

function normaliseEmailProvider(value) {
  const provider = String(value || 'auto').trim().toLowerCase();
  if (['auto', 'resend', 'webhook', 'formspree', 'none'].includes(provider)) return provider;
  return 'auto';
}

function loadConfig(overrides = {}) {
  const rootDir = path.resolve(overrides.rootDir || path.join(__dirname, '..'));
  const contentDir = path.resolve(overrides.contentDir || path.join(rootDir, 'content'));
  const dataDir = path.resolve(overrides.dataDir || path.join(rootDir, 'data'));
  const runtimeDir = path.resolve(overrides.runtimeDir || path.join(dataDir, 'runtime'));
  const uploadDir = path.resolve(
    overrides.uploadDir || path.join(rootDir, 'assets', 'gallery', 'moments')
  );
  const pendingDir = path.resolve(overrides.pendingDir || path.join(dataDir, 'pending'));

  const galleryFile = path.resolve(
    overrides.galleryFile || path.join(contentDir, 'gallery.json')
  );
  const adminsFile = path.resolve(overrides.adminsFile || path.join(dataDir, 'admins.json'));

  const cooldownMinutes = toPositiveInt(
    overrides.cooldownMinutes ?? process.env.MOMENTS_COOLDOWN_MINUTES,
    30
  );
  const maxUploadBytes = toPositiveInt(
    overrides.maxUploadBytes ?? process.env.MOMENTS_MAX_UPLOAD_BYTES,
    8 * 1024 * 1024
  );

  const emailOverrides = overrides.email || {};
  const envFormEndpoint =
    process.env.MOMENTS_FORM_ENDPOINT === undefined
      ? DEFAULT_FORM_ENDPOINT
      : process.env.MOMENTS_FORM_ENDPOINT.trim();
  const formEndpoint =
    emailOverrides.formEndpoint !== undefined
      ? emailOverrides.formEndpoint
      : envFormEndpoint && envFormEndpoint.toLowerCase() !== 'off'
        ? envFormEndpoint
        : null;

  const email = {
    provider: normaliseEmailProvider(
      emailOverrides.provider ?? process.env.MOMENTS_EMAIL_PROVIDER
    ),
    resendApiKey: emailOverrides.resendApiKey ?? process.env.RESEND_API_KEY ?? '',
    resendFrom:
      emailOverrides.resendFrom ??
      process.env.RESEND_FROM ??
      'LabRoute <onboarding@resend.dev>',
    adminEmails: parseEmailList(
      emailOverrides.adminEmails ?? process.env.MOMENTS_ADMIN_EMAILS
    ),
    webhookUrl: emailOverrides.webhookUrl ?? process.env.MOMENTS_WEBHOOK_URL ?? '',
    formEndpoint,
    timeoutMs: toPositiveInt(emailOverrides.timeoutMs, 7000)
  };

  return {
    rootDir,
    contentDir,
    dataDir,
    runtimeDir,
    uploadDir,
    pendingDir,
    galleryFile,
    adminsFile,
    pendingFile: path.join(pendingDir, 'pending.json'),
    notificationsFile: path.join(runtimeDir, 'notifications.jsonl'),
    rateLimitFile: path.join(runtimeDir, 'rate-limits.json'),
    secret: loadSecret(runtimeDir, overrides.secret),

    port: toPositiveInt(overrides.port ?? process.env.PORT, 3000),
    host: overrides.host || process.env.HOST || '0.0.0.0',
    publicBaseUrl: overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '',
    trustProxy:
      overrides.trustProxy !== undefined
        ? Boolean(overrides.trustProxy)
        : process.env.TRUST_PROXY !== 'false',

    publicUploadPrefix: '/assets/gallery/moments',
    visitorCookieName: 'labroute_visitor',
    adminCookieName: 'labroute_admin',
    visitorCookieMaxAge: 365 * 24 * 60 * 60,
    adminSessionTtlMs: 8 * 60 * 60 * 1000,

    cooldownMinutes,
    maxUploadBytes,
    maxJsonBytes: Math.ceil(maxUploadBytes * 1.45) + 64 * 1024,
    maxImageDimension: 10000,
    maxImagePixels: 40 * 1000 * 1000,
    captionMaxLength: 160,
    contributorMaxLength: 60,

    rateLimit: {
      cooldownMs: cooldownMinutes * 60 * 1000,
      windowMs: cooldownMinutes * 60 * 1000,
      ipLimit: toPositiveInt(overrides.ipLimit ?? process.env.MOMENTS_IP_LIMIT, 50),
      retentionMs: 24 * 60 * 60 * 1000,
      maxKeys: 5000
    },

    email
  };
}

module.exports = { loadConfig, parseEmailList };
