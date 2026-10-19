'use strict';

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { createApp } = require('../server');
const { sha256 } = require('../lib/util');

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3X0AAAAASUVORK5CYII=';

const imgDataUrl = (base64 = ONE_PIXEL_PNG, mime = 'image/png') =>
  `data:${mime};base64,${base64}`;

function setCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function mergeCookieJar(jar, response) {
  const next = { ...jar };

  for (const cookie of setCookies(response)) {
    const pair = cookie.split(';')[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;

    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();

    if (!value || /Max-Age=0/i.test(cookie)) {
      delete next[name];
    } else {
      next[name] = value;
    }
  }

  return next;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function jsonRequest(baseUrl, pathname, options = {}, jar = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    response,
    status: response.status,
    json,
    text,
    jar: mergeCookieJar(jar, response)
  };
}

test('LabRoute moments API', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'labroute-test-'));
  const contentDir = path.join(root, 'content');
  const dataDir = path.join(root, 'data');
  const uploadDir = path.join(root, 'uploads');

  await fsp.mkdir(contentDir, { recursive: true });
  await fsp.mkdir(dataDir, { recursive: true });

  const originalGallery = [
    {
      id: 'gal-old-1',
      image: 'assets/gallery/old-one.jpeg',
      caption: 'Original first image',
      tall: true
    },
    {
      id: 'gal-old-2',
      image: 'assets/gallery/old-two.jpeg',
      caption: 'Original second image',
      tall: true
    },
    {
      id: 'gal-old-3',
      image: 'assets/gallery/old-three.jpeg',
      caption: 'Original third image',
      tall: true
    }
  ];

  await fsp.writeFile(
    path.join(contentDir, 'gallery.json'),
    JSON.stringify(originalGallery, null, 2)
  );
  await fsp.writeFile(
    path.join(dataDir, 'admins.json'),
    JSON.stringify(
      {
        admins: [
          {
            email: 'admin@example.com',
            passwordCrypt: sha256('correct-horse')
          }
        ]
      },
      null,
      2
    )
  );

  const app = createApp({
    rootDir: root,
    contentDir,
    dataDir,
    runtimeDir: path.join(dataDir, 'runtime'),
    uploadDir,
    galleryFile: path.join(contentDir, 'gallery.json'),
    adminsFile: path.join(dataDir, 'admins.json'),
    secret: 'test-secret-that-is-long-enough-for-hmac',
    email: { provider: 'none' },
    trustProxy: false,
    cooldownMinutes: 30,
    maxUploadBytes: 100 * 1024
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  try {
    await t.test('health and public gallery are available', async () => {
      const health = await jsonRequest(baseUrl, '/api/health');
      assert.equal(health.status, 200);
      assert.equal(health.json.ok, true);
      assert.equal(health.json.cooldownMinutes, 30);
      assert.equal(health.json.emailProvider, 'none');

      const gallery = await jsonRequest(baseUrl, '/api/gallery');
      assert.equal(gallery.status, 200);
      assert.equal(gallery.json.gallery.length, 3);
      assert.equal(gallery.json.gallery[0].id, 'gal-old-1');
      assert.equal(gallery.json.gallery[0].uploaded, false);
    });

    let visitorOne = {};
    let firstMomentId = '';

    await t.test('a first-time visitor can upload a moment', async () => {
      const status = await jsonRequest(
        baseUrl,
        '/api/moments/status',
        { headers: { 'X-Labroute-Device': 'device-one-12345' } },
        visitorOne
      );
      assert.equal(status.status, 200);
      assert.equal(status.json.canUpload, true);
      visitorOne = status.jar;
      assert.ok(visitorOne.labroute_visitor);

      const upload = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          headers: { 'X-Labroute-Device': 'device-one-12345' },
          body: JSON.stringify({
            image: imgDataUrl(),
            caption: 'A new moment at the electronics bench',
            contributor: 'Ada',
            email: 'ada@example.com',
            consent: true,
            website: ''
          })
        },
        visitorOne
      );

      assert.equal(upload.status, 201);
      assert.equal(upload.json.ok, true);
      assert.equal(upload.json.galleryCount, 4);
      assert.equal(upload.json.gallery[0].caption, 'A new moment at the electronics bench');
      assert.equal(upload.json.gallery[1].id, 'gal-old-1');
      assert.equal(upload.json.gallery[2].id, 'gal-old-2');
      assert.equal(upload.json.gallery[3].id, 'gal-old-3');
      assert.equal(upload.json.notification.status, 'skipped');
      assert.equal(upload.json.canUpload, false);
      assert.ok(upload.json.retryAfterSeconds >= 1700);
      visitorOne = upload.jar;

      firstMomentId = upload.json.moment.id;

      const diskGallery = JSON.parse(
        await fsp.readFile(path.join(contentDir, 'gallery.json'), 'utf8')
      );
      assert.equal(diskGallery[0].id, firstMomentId);
      assert.equal(diskGallery[0].image, `assets/gallery/moments/${firstMomentId}.png`);
      assert.equal(diskGallery[3].id, 'gal-old-3');

      const imageResponse = await fetch(`${baseUrl}/${upload.json.moment.image}`);
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResponse.headers.get('content-type'), 'image/png');
      assert.equal((await imageResponse.arrayBuffer()).byteLength > 0, true);
    });

    await t.test('the same visitor is held to a 30 minute cooldown', async () => {
      const upload = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          headers: { 'X-Labroute-Device': 'device-one-12345' },
          body: JSON.stringify({
            image: imgDataUrl(),
            caption: 'Trying again too soon',
            consent: true
          })
        },
        visitorOne
      );

      assert.equal(upload.status, 429);
      assert.equal(upload.json.error, 'cooldown_active');
      assert.ok(upload.json.retryAfterSeconds > 0);
      assert.ok(Number(upload.response.headers.get('retry-after')) > 0);

      const status = await jsonRequest(
        baseUrl,
        '/api/moments/status',
        { headers: { 'X-Labroute-Device': 'device-one-12345' } },
        visitorOne
      );
      assert.equal(status.json.canUpload, false);
      assert.ok(status.json.nextAllowedAt);
    });

    await t.test('clearing the visitor cookie does not reset the device cooldown', async () => {
      const upload = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          headers: { 'X-Labroute-Device': 'device-one-12345' },
          body: JSON.stringify({
            image: imgDataUrl(),
            caption: 'A new cookie will not help',
            consent: true
          })
        },
        {}
      );

      assert.equal(upload.status, 429);
      assert.equal(upload.json.error, 'cooldown_active');
    });

    let visitorTwo = {};

    await t.test('another visitor is not affected by the first cooldown', async () => {
      const upload = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          headers: { 'X-Labroute-Device': 'device-two-67890' },
          body: JSON.stringify({
            image: imgDataUrl(),
            caption: 'A different student at the workshop',
            contributor: 'Bola',
            consent: true
          })
        },
        visitorTwo
      );

      assert.equal(upload.status, 201);
      assert.equal(upload.json.galleryCount, 5);
      assert.notEqual(upload.json.moment.id, firstMomentId);
      assert.equal(upload.json.gallery[0].id, upload.json.moment.id);
      assert.equal(upload.json.gallery[1].id, firstMomentId);
      visitorTwo = upload.jar;
      assert.ok(visitorTwo.labroute_visitor);
    });

    await t.test('invalid contributions are rejected', async () => {
      const noConsent = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          body: JSON.stringify({
            image: imgDataUrl(),
            caption: 'No consent given'
          })
        },
        {}
      );
      assert.equal(noConsent.status, 400);
      assert.equal(noConsent.json.error, 'consent_required');

      const shortCaption = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          body: JSON.stringify({
            image: imgDataUrl(),
            caption: 'x',
            consent: true
          })
        },
        {}
      );
      assert.equal(shortCaption.status, 400);
      assert.equal(shortCaption.json.error, 'caption_required');

      const fakeImage = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          body: JSON.stringify({
            image: imgDataUrl(Buffer.from('not really an image').toString('base64')),
            caption: 'A fake photo',
            consent: true
          })
        },
        {}
      );
      assert.equal(fakeImage.status, 415);

      const tooLarge = Buffer.alloc(200 * 1024, 1).toString('base64');
      const hugeImage = await jsonRequest(
        baseUrl,
        '/api/moments',
        {
          method: 'POST',
          body: JSON.stringify({
            image: imgDataUrl(tooLarge),
            caption: 'A huge photo',
            consent: true
          })
        },
        {}
      );
      assert.equal(hugeImage.status, 413);
    });

    await t.test('recent moments and gallery stay in sync', async () => {
      const recent = await jsonRequest(baseUrl, '/api/moments/recent?limit=10');
      assert.equal(recent.status, 200);
      assert.equal(recent.json.moments.length, 2);
      assert.equal(recent.json.moments[0].caption, 'A different student at the workshop');

      const gallery = await jsonRequest(baseUrl, '/api/gallery');
      assert.equal(gallery.json.gallery.length, 5);
      assert.equal(gallery.json.gallery[0].uploaded, true);
      assert.equal(gallery.json.gallery[1].uploaded, true);
      assert.equal(gallery.json.gallery[2].uploaded, false);
    });

    let adminJar = {};

    await t.test('admin authentication and the moments inbox work', async () => {
      const unauthorised = await jsonRequest(baseUrl, '/api/admin/moments');
      assert.equal(unauthorised.status, 401);

      const wrong = await jsonRequest(baseUrl, '/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'nope' })
      });
      assert.equal(wrong.status, 401);

      const login = await jsonRequest(baseUrl, '/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'correct-horse' })
      });
      assert.equal(login.status, 200);
      assert.equal(login.json.email, 'admin@example.com');
      adminJar = login.jar;
      assert.ok(adminJar.labroute_admin);

      const session = await jsonRequest(baseUrl, '/api/admin/session', {}, adminJar);
      assert.equal(session.json.authenticated, true);

      const inbox = await jsonRequest(baseUrl, '/api/admin/moments', {}, adminJar);
      assert.equal(inbox.status, 200);
      assert.equal(inbox.json.total, 2);
      assert.equal(inbox.json.moments.length, 2);
      assert.equal(inbox.json.moments[0].caption, 'A different student at the workshop');
      assert.equal(inbox.json.moments[1].uploaderEmail, 'ada@example.com');
      assert.equal(inbox.json.moments[1].notification.status, 'skipped');

      const logout = await jsonRequest(
        baseUrl,
        '/api/admin/logout',
        { method: 'POST' },
        adminJar
      );
      assert.equal(logout.status, 200);
      adminJar = logout.jar;

      const afterLogout = await jsonRequest(baseUrl, '/api/admin/moments', {}, adminJar);
      assert.equal(afterLogout.status, 401);
    });

    await t.test('static source files are not exposed', async () => {
      const serverFile = await fetch(`${baseUrl}/server.js`);
      assert.equal(serverFile.status, 404);

      const runtimeState = await fetch(`${baseUrl}/data/runtime/rate-limits.json`);
      assert.equal(runtimeState.status, 404);
    });
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await fsp.rm(root, { recursive: true, force: true });
  }
});
