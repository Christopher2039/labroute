'use strict';

const fsp = require('fs').promises;
const path = require('path');
const {
  HttpError,
  Mutex,
  cleanText,
  hmac,
  isValidEmail,
  randomHex
} = require('./util');
const { decodeImageDataUrl } = require('./image');
const { isSafeImagePath, publicItem } = require('./gallery-store');

/**
 * Owns the complete upload workflow:
 *   1. validate the volunteer's contribution,
 *   2. enforce the per-visitor and per-network cooldowns,
 *   3. write the image and prepend it to the public gallery.
 *
 * The mutex makes the check-and-write sequence atomic inside the Node process,
 * which prevents two simultaneous uploads from slipping past the cooldown.
 */
class MomentsService {
  constructor({ config, galleryStore, rateLimits }) {
    this.config = config;
    this.galleryStore = galleryStore;
    this.rateLimits = rateLimits;
    this.mutex = new Mutex();
  }

  identityKeys(identity) {
    const secret = this.config.secret;
    const keys = [
      `visitor:${hmac(`visitor|${identity.visitorId}`, secret).slice(0, 32)}`
    ];

    if (identity.deviceId) {
      keys.push(`device:${hmac(`device|${identity.deviceId}`, secret).slice(0, 32)}`);
    } else {
      // Browser storage and cookies can both be wiped. Falling back to a
      // hashed network + browser signature keeps the cooldown meaningful.
      keys.push(
        `fingerprint:${hmac(
          `fingerprint|${identity.ip}|${identity.userAgent}`,
          secret
        ).slice(0, 32)}`
      );
    }

    const ipKey = identity.ip
      ? `ip:${hmac(`ip|${identity.ip}`, secret).slice(0, 32)}`
      : null;

    return { keys, ipKey };
  }

  cooldownPayload(status, now = Date.now()) {
    const nextAllowedAt = status.nextAllowedAt || null;

    return {
      canUpload: status.allowed,
      reason: status.reason || null,
      cooldownMinutes: this.config.cooldownMinutes,
      cooldownSeconds: Math.round(this.config.rateLimit.cooldownMs / 1000),
      nextAllowedAt: nextAllowedAt ? new Date(nextAllowedAt).toISOString() : null,
      retryAfterSeconds: status.retryAfterSeconds || 0,
      maxUploadBytes: this.config.maxUploadBytes,
      captionMaxLength: this.config.captionMaxLength
    };
  }

  async getStatus(identity, now = Date.now()) {
    return this.mutex.run(async () => {
      await this.rateLimits.load();
      const { keys, ipKey } = this.identityKeys(identity);
      const status = this.rateLimits.check(keys, ipKey, now);
      return this.cooldownPayload(status, now);
    });
  }

  async createMoment(input, identity, now = Date.now()) {
    if (cleanText(input?.website || '', 80)) {
      throw new HttpError(400, 'spam_rejected', 'This submission could not be accepted.');
    }

    if (input?.consent !== true) {
      throw new HttpError(
        400,
        'consent_required',
        'Please confirm that you have permission to share this photo.'
      );
    }

    const caption = cleanText(input?.caption || '', this.config.captionMaxLength);
    if (caption.length < 3) {
      throw new HttpError(
        400,
        'caption_required',
        'Please add a short caption so visitors know what the moment shows.'
      );
    }

    const contributor = cleanText(
      input?.contributor || '',
      this.config.contributorMaxLength
    );
    const uploaderEmail = cleanText(input?.email || '', this.config.emailMaxLength);

    if (uploaderEmail && !isValidEmail(uploaderEmail)) {
      throw new HttpError(
        400,
        'invalid_email',
        'That email address does not look right. You can also leave it blank.'
      );
    }

    const image = decodeImageDataUrl(input?.image, this.config);
    const id = `moment-${Date.now().toString(36)}-${randomHex(4)}`;
    const filename = `${id}.${image.ext}`;
    const relativeImage = `${this.config.publicUploadPrefix.replace(/^\/+/, '')}/${filename}`;
    const absoluteImage = path.join(this.config.uploadDir, filename);
    const uploadedAt = new Date(now).toISOString();

    const galleryItem = {
      id,
      image: relativeImage,
      caption,
      contributor,
      uploaded: true,
      uploadedAt,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      tall: true
    };

    return this.mutex.run(async () => {
      await this.rateLimits.load();

      const { keys, ipKey } = this.identityKeys(identity);
      const limit = this.rateLimits.check(keys, ipKey, now);

      if (!limit.allowed) {
        throw new HttpError(
          429,
          'cooldown_active',
          limit.reason === 'network'
            ? 'Too many moments were shared from this network recently. Please try again shortly.'
            : 'You have already shared a moment. Please wait before uploading another one.',
          this.cooldownPayload(limit, now)
        );
      }

      try {
        await fsp.mkdir(this.config.uploadDir, { recursive: true });
        await fsp.writeFile(absoluteImage, image.buffer, { mode: 0o644, flag: 'wx' });
      } catch (error) {
        throw new HttpError(
          503,
          'storage_unavailable',
          'The photo could not be saved right now. Please try again in a moment.'
        );
      }

      let gallery;
      try {
        const next = await this.galleryStore.add(galleryItem);
        gallery = next
          .filter((item) => item && isSafeImagePath(item.image))
          .map(publicItem);
      } catch (error) {
        await this.galleryStore.removeImage(relativeImage);
        throw new HttpError(
          503,
          'gallery_unavailable',
          'The gallery could not be updated right now. Please try again in a moment.'
        );
      }

      this.rateLimits.record(keys, ipKey, now);
      try {
        await this.rateLimits.save();
      } catch (error) {
        // The in-memory limiter still protects this process. A read-only disk
        // should not turn a successfully published photo into an error.
        console.warn(`[labroute] Could not persist rate-limit state: ${error.message}`);
      }

      const after = this.rateLimits.check(keys, ipKey, now);

      return {
        moment: publicItem(galleryItem, 0),
        gallery,
        uploader: {
          name: contributor || 'Anonymous contributor',
          email: uploaderEmail
        },
        image: {
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          mime: image.mime
        },
        cooldown: this.cooldownPayload(
          after.allowed
            ? {
                allowed: false,
                reason: 'visitor',
                nextAllowedAt: now + this.config.rateLimit.cooldownMs,
                retryAfterSeconds: Math.ceil(this.config.rateLimit.cooldownMs / 1000)
              }
            : after,
          now
        )
      };
    });
  }
}

module.exports = { MomentsService };
