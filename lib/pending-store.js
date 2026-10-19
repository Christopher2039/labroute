'use strict';

const fsp = require('fs').promises;
const path = require('path');
const { atomicWriteJson, readJson } = require('./util');

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

/**
 * Photos waiting for an administrator to approve or decline them.
 *
 * Files live in a private directory that the static server never exposes.
 * Only the authenticated admin API can list or stream them.
 */
class PendingStore {
  constructor(config) {
    this.dir = config.pendingDir;
    this.file = config.pendingFile;
    this.items = [];
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return this.items;

    try {
      const data = await readJson(this.file, []);
      this.items = Array.isArray(data) ? data : Array.isArray(data?.pending) ? data.pending : [];
    } catch (error) {
      console.warn(`[labroute] Could not read pending uploads (${error.message}); starting empty.`);
      this.items = [];
    }

    this.loaded = true;
    return this.items;
  }

  async save() {
    await fsp.mkdir(this.dir, { recursive: true });
    await atomicWriteJson(this.file, this.items);
  }

  async list() {
    await this.load();
    return [...this.items];
  }

  async get(id) {
    await this.load();
    return this.items.find((entry) => entry.id === id) || null;
  }

  async add(entry) {
    await this.load();
    this.items = [entry, ...this.items.filter((item) => item.id !== entry.id)];
    await this.save();
    return entry;
  }

  async remove(id) {
    await this.load();
    this.items = this.items.filter((item) => item.id !== id);
    await this.save();
  }

  filenameFor(entry) {
    return `${entry.id}.${entry.ext}`;
  }

  absolutePath(entry) {
    const filename = this.filenameFor(entry);
    if (!SAFE_FILENAME.test(filename)) return null;
    return path.join(this.dir, filename);
  }

  /** Approve-time move into the public gallery folder. */
  async moveToUploadDir(entry, uploadDir) {
    const source = this.absolutePath(entry);
    if (!source) throw new Error('Unsafe pending filename.');

    const target = path.join(uploadDir, this.filenameFor(entry));
    await fsp.mkdir(uploadDir, { recursive: true });

    try {
      await fsp.rename(source, target);
    } catch (error) {
      if (error.code !== 'EXDEV') throw error;
      await fsp.copyFile(source, target);
      await fsp.rm(source, { force: true });
    }

    // Approved photos are served publicly; keep them readable by the server.
    await fsp.chmod(target, 0o644).catch(() => {});

    return target;
  }

  async moveBack(entry, uploadDir) {
    const source = path.join(uploadDir, this.filenameFor(entry));
    const target = this.absolutePath(entry);
    if (!target) return;

    try {
      await fsp.rename(source, target);
    } catch {
      // The original file is gone; nothing else to restore.
    }
  }

  async deleteFile(entry) {
    const target = this.absolutePath(entry);
    if (target) await fsp.rm(target, { force: true });
  }
}

module.exports = { PendingStore };
