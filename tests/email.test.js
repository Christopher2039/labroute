'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { notifyMomentUpload } = require('../lib/email');

const moment = {
  id: 'moment-test-1',
  image: 'assets/gallery/moments/moment-test-1.png',
  caption: 'Calibrating the oscilloscope',
  contributor: 'Ada',
  uploadedAt: '2026-10-19T12:00:00.000Z'
};

const contributor = 'Ada';
const links = {
  dashboardUrl: 'https://labroute.example/dashboard.html#pending'
};

function configWith(email) {
  return {
    adminsFile: '/definitely/not/a/real/admins.json',
    email: {
      provider: 'auto',
      resendApiKey: '',
      resendFrom: 'LabRoute <moments@labroute.example>',
      adminEmails: ['admin-one@example.com', 'admin-two@example.com'],
      webhookUrl: '',
      formEndpoint: 'https://formspree.io/f/test-form',
      timeoutMs: 1000,
      ...email
    }
  };
}

test('email notifications', async (t) => {
  const originalFetch = global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
  });

  await t.test('Formspree fallback receives the admin alert payload', async () => {
    let captured = null;

    global.fetch = async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const result = await notifyMomentUpload({
      config: configWith({ provider: 'formspree' }),
      moment,
      contributor,
      links
    });

    assert.equal(result.provider, 'formspree');
    assert.equal(result.status, 'sent');
    assert.equal(captured.url, 'https://formspree.io/f/test-form');
    assert.equal(captured.body.momentId, moment.id);
    assert.equal(captured.body.caption, moment.caption);
    assert.equal(
      captured.body.adminEmails,
      'admin-one@example.com, admin-two@example.com'
    );
    assert.equal(captured.body.event, 'lab_moment.pending');
    assert.match(captured.body.message, /waiting for an admin decision/i);
    assert.match(captured.body.message, /Approve it to make it image 1/i);
  });

  await t.test('Resend sends to every admin with review links', async () => {
    let captured = null;

    global.fetch = async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ id: 'email-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const result = await notifyMomentUpload({
      config: configWith({ provider: 'resend', resendApiKey: 're_test', resendFrom: 'LabRoute <hello@labroute.example>' }),
      moment,
      contributor,
      links
    });

    assert.equal(result.provider, 'resend');
    assert.equal(result.status, 'sent');
    assert.equal(captured.url, 'https://api.resend.com/emails');
    assert.deepEqual(captured.body.to, ['admin-one@example.com', 'admin-two@example.com']);
    assert.equal(captured.body.from, 'LabRoute <hello@labroute.example>');
    assert.match(captured.body.html, /Calibrating the oscilloscope/);
    assert.match(captured.body.html, /Review in the dashboard/);
    assert.match(captured.body.html, /Pending approval/);
  });

  await t.test('provider failures are reported, never thrown', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify({ error: 'domain is not verified' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });

    const result = await notifyMomentUpload({
      config: configWith({ provider: 'resend', resendApiKey: 're_test' }),
      moment,
      contributor,
      links
    });

    assert.equal(result.status, 'failed');
    assert.match(result.error, /403/);
  });

  await t.test('provider "none" skips delivery without calling fetch', async () => {
    let called = false;
    global.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };

    const result = await notifyMomentUpload({
      config: configWith({ provider: 'none' }),
      moment,
      contributor,
      links
    });

    assert.equal(result.status, 'skipped');
    assert.equal(called, false);
  });
});
