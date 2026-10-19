'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/**
 * Small, dependency-free helpers shared by the LabRoute moments service.
 */

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomHex(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(header = '') {
  const cookies = {};
  if (!header) return cookies;

  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();
    if (!name) continue;

    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);

  return parts.join('; ');
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

function isValidEmail(value) {
  const email = String(value ?? '').trim();
  if (!email || email.length > 160) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function getClientIp(req, trustProxy = true) {
  let ip = req.socket?.remoteAddress || '';

  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      ip = forwarded.split(',')[0].trim();
    } else if (typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip'].trim()) {
      ip = req.headers['x-real-ip'].trim();
    }
  }

  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip.slice(0, 120);
}

function isSecureRequest(req) {
  if (req.socket?.encrypted) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
}

function requestOrigin(req, publicBaseUrl) {
  if (publicBaseUrl) return String(publicBaseUrl).replace(/\/+$/, '');

  const proto = isSecureRequest(req) ? 'https' : 'http';
  const host = String(req.headers.host || 'localhost')
    .replace(/[^A-Za-z0-9.:[\]-]/g, '')
    .slice(0, 200);

  return `${proto}://${host || 'localhost'}`;
}

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicWrite(file, data, options = {}) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomHex(4)}.tmp`;

  try {
    await fsp.writeFile(temporary, data, options.mode ? { mode: options.mode } : undefined);
    await fsp.rename(temporary, file);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function atomicWriteJson(file, value) {
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendJsonLine(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}

async function readJsonLines(file, limit = 200) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const selected = limit > 0 ? lines.slice(-limit) : lines;

    return selected.flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function toPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

class Mutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  run(task) {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

module.exports = {
  HttpError,
  Mutex,
  appendJsonLine,
  atomicWrite,
  atomicWriteJson,
  cleanText,
  escapeHtml,
  getClientIp,
  hmac,
  isSecureRequest,
  isValidEmail,
  parseCookies,
  randomHex,
  randomToken,
  readJson,
  readJsonLines,
  requestOrigin,
  safeEqual,
  serializeCookie,
  sha256,
  toPositiveInt
};
