# Labroute #
A website for UNIBEN ELA

Umoh Etini - Team Lead and Report Author (Tee Hee 😁)

Aika Osakioya - Team Member and JS Dev

Agbonze Leonard - Team Member and front-end dev

Oboh Christopher - Team Member and Report Author

## Community Lab Moments

The gallery on the home page accepts visitor photos, but nothing is published
immediately. A visitor previews a JPEG, PNG, or WebP image on `upload.html` and
sends it for review. The photo is stored in the private `data/pending/` folder
and listed under **Pending uploads** on `dashboard.html`, where an admin can:

- **Approve** — the file moves to `assets/gallery/moments/` and becomes **image 1**
  of `content/gallery.json`. Every existing image shifts one place to the right.
- **Decline** — the file and its entry are deleted.

Each visitor is held to **one upload every 30 minutes**. The cooldown is scoped
to that visitor (a signed HttpOnly cookie plus a browser-local device id), so one
person uploading does not block anybody else. A hashed network guard also limits
bursts from a single network without storing raw IP addresses. No account is
required, and the upload page never asks for an email address.

When a photo arrives for review, the admin team receives an email notification.
The admin dashboard also shows the pending queue with the photo, caption, and
submitting visitor's name.

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
| `content/gallery.json` | Ordered public gallery. The first item is displayed first. |
| `assets/gallery/moments/` | Approved images, named with unguessable ids. |
| `data/pending/` | Photos awaiting review plus `pending.json`. Private, never served statically, and gitignored. |
| `data/runtime/` | Generated cookie secret, hashed cooldown state, and the notification log. This directory is gitignored. |

Run `npm test` to execute the integration suite (pending uploads, approval and
decline, gallery ordering, per-visitor cooldowns, validation, admin
authentication, and the review queue).

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

This feature needs a Node process with a **persistent disk** for the pending
queue, gallery images, and cooldown state. It cannot run on a purely static
Vercel deployment. Deploy the repository to a Node host (Render, Railway, Fly.io,
a VPS, or any Node-capable host), or add external object storage plus serverless
functions before deploying the API to Vercel. The home page still falls back to
`content/gallery.json` if the upload service is offline.
