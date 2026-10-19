'use strict';

const path = require('path');
const { atomicWriteJson, readJson } = require('./util');

const FALLBACK_CAPTION = 'A moment from the LabRoute engineering archive';

function isSafeImagePath(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith('assets/')) return !value.includes('..') && !value.includes('\\');
  return false;
}

function publicItem(item, index) {
  const caption =
    typeof item.caption === 'string' && item.caption.trim()
      ? item.caption.trim()
      : typeof item.title === 'string' && item.title.trim()
        ? item.title.trim()
        : FALLBACK_CAPTION;

  return {
    id: typeof item.id === 'string' && item.id ? item.id : `gallery-${index + 1}`,
    image: isSafeImagePath(item.image) ? item.image : '',
    caption,
    contributor: typeof item.contributor === 'string' ? item.contributor.trim() : '',
    uploadedAt: typeof item.uploadedAt === 'string' ? item.uploadedAt : null,
    uploaded: Boolean(item.uploaded || item.uploadedAt),
    tall: item.tall !== false
  };
}

class GalleryStore {
  constructor(config) {
    this.file = config.galleryFile;
    this.uploadDir = config.uploadDir;
  }

  async read() {
    const data = await readJson(this.file, []);

    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.gallery)) return data.gallery;

    throw new Error('content/gallery.json must contain an array of gallery items.');
  }

  async add(item) {
    const gallery = await this.read();
    const withoutDuplicate = gallery.filter((entry) => entry && entry.id !== item.id);
    const next = [item, ...withoutDuplicate];

    await atomicWriteJson(this.file, next);
    return next;
  }

  async publicGallery() {
    const gallery = await this.read();
    return gallery.filter((item) => item && isSafeImagePath(item.image)).map(publicItem);
  }

  async recentMoments(limit = 8) {
    const gallery = await this.publicGallery();
    return gallery.filter((item) => item.uploaded).slice(0, limit);
  }

  async removeImage(relativePath) {
    if (!isSafeImagePath(relativePath)) return;

    const prefix = 'assets/gallery/moments/';
    if (!relativePath.startsWith(prefix)) return;

    const file = path.join(this.uploadDir, path.basename(relativePath));
    const fsp = require('fs').promises;
    await fsp.rm(file, { force: true }).catch(() => {});
  }
}

module.exports = { GalleryStore, publicItem, isSafeImagePath };
