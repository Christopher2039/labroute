# Labroute #
A website for UNIBEN ELA

Umoh Etini - Team Lead and Report Author (Tee Hee 😁)

Aika Osakioya - Team Member and JS Dev

Agbonze Leonard - Team Member and front-end dev

Oboh Christopher - Team Member and Report Author

## Community Lab Moments

The gallery on the home page now accepts visitor photos. A visitor can preview a
JPEG, PNG, or WebP image on `upload.html`, publish it, and the photo immediately
becomes **image 1** of `content/gallery.json`. Every existing image moves one
place to the right, so the old image 1 becomes image 2, and so on.

Each visitor is held to **one upload every 30 minutes**. The cooldown is scoped
to that visitor (a signed HttpOnly cookie plus a browser-local device id), so one
person uploading does not block anybody else. A hashed network guard also limits
bursts from a single network without storing raw IP addresses. No account is
required.

When a photo is published, the admin team receives an email notification. The
admin dashboard also has a live **Community Lab Moments** inbox that shows the
newest uploads and the delivery state of each alert.

### Run the site

```bash
npm start
```

Then open <http://localhost:3000>. There are **no runtime dependencies** to
install — the small Node service uses only the standard library.

For local development with automatic restarts:

```bash
npm run dev
```

### Upload storage

| Path | Purpose |
| --- | --- |
| `content/gallery.json` | Ordered gallery. The first item is displayed first. |
| `assets/gallery/moments/` | Uploaded images, named with unguessable ids. |
| `data/runtime/` | Generated cookie secret, hashed cooldown state, and the notification log. This directory is gitignored. |

Run `npm test` to execute the integration suite (uploads, gallery ordering,
per-visitor cooldowns, validation, admin authentication, and the inbox).

### Email notifications

Copy `.env.example` to `.env` and configure one provider:

- **Resend** (recommended — sends to every admin in `data/admins.json`):
  `RESEND_API_KEY` and `RESEND_FROM`.
- **Formspree** (works with no extra account because the site already uses a
  Formspree form): the form owner receives the alert. This is the default
  fallback.
- **Webhook**: set `MOMENTS_WEBHOOK_URL` to forward the alert to Google Apps
  Script, Slack, n8n, or your own service.
- Set `MOMENTS_EMAIL_PROVIDER=none` to disable email entirely. Uploads still
  work and the notification is recorded in `data/runtime/notifications.jsonl`.

Admin addresses are read from `data/admins.json`; override them with
`MOMENTS_ADMIN_EMAILS=one@example.com,two@example.com` if needed.

### Deployment note

This feature needs a Node process with a **persistent disk** for the gallery
images and cooldown state. It cannot run on a purely static Vercel deployment.
Deploy the repository to a Node host (Render, Railway, Fly.io, a VPS, or any
Node-capable host), or add external object storage plus serverless functions
before deploying the API to Vercel. The home page still falls back to
`content/gallery.json` if the upload service is offline.
