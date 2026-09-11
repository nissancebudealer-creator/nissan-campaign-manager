# Multi-Channel Marketing Campaign Platform

A self-hostable, low-cost alternative to expensive marketing platforms for creating, managing,
scheduling, and sending promotional campaigns over **Email (Gmail)**, **WhatsApp Business**, and
**Viber**.

Built with open-source tools throughout, designed to run on free-tier infrastructure, and built
compliance-first: consent tracking, opt-out handling, and a suppression list are core data model
concepts, not an afterthought.

## Status

All 10 phases from the original roadmap are complete (see `ARCHITECTURE.md`): contacts CRM,
segmentation, templates, the campaign builder, real sending/tracking on all three channels — Gmail
(OAuth2), WhatsApp (Meta Cloud API), and Viber (Public Account API) — a live analytics dashboard
and per-campaign reports, a cadence-based automation engine that enrolls contacts on real lead
events, and Administration (user/role management, a live audit log, and admin-adjustable sending
limits).

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query
- **Backend**: Node.js + TypeScript + Express + Prisma ORM
- **Database**: PostgreSQL (Supabase free tier recommended; any Postgres works)
- **Auth**: JWT + bcrypt, role-based access control

## Quick start

See [SETUP.md](./SETUP.md) for full instructions. Short version:

```bash
npm install
cp server/.env.example server/.env   # fill in DATABASE_URL and JWT_SECRET
npm run --workspace server prisma:generate
npm run --workspace server prisma:migrate
npm run --workspace server prisma:seed
npm run dev:server
npm run dev:web
```

Frontend: http://localhost:5174 — API: http://localhost:4000/api/health

## Documentation

- [USER_GUIDE.md](./USER_GUIDE.md) — how to actually use the app, with worked examples (start here if you're marketing/sales staff, not a developer)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, data model, phased roadmap
- [SETUP.md](./SETUP.md) — local development setup
- [API.md](./API.md) — REST API reference
- [DEPLOYMENT.md](./DEPLOYMENT.md) — free-tier deployment guide
- [SECURITY.md](./SECURITY.md) — security model and practices
- [COMPLIANCE.md](./COMPLIANCE.md) — consent, opt-out, and Philippine Data Privacy Act considerations
