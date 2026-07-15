# Staynex Project Overview

Audit date: 2026-07-15

## What Staynex Is

Staynex is an operational intelligence layer for hotels. It connects hotel operations, guest messaging, PMS context, tickets, knowledge, automations, experience providers and AI assistance in one operating system.

The current product direction is:

> Staynex is an operational intelligence layer for hotels connected to the PMS.

Staynex does not replace the PMS. The PMS remains the system of record for reservations, guests, rooms, check-in, check-out, folios and operational hotel data. Staynex reads and interprets that context so hotel teams can work faster and communicate better with guests.

## Problem It Solves

Hotels often have operational information spread across PMS, WhatsApp, spreadsheets, reception notes, maintenance tickets, provider emails and staff knowledge. This creates:

- slow guest response times;
- repeated manual work at reception;
- missed revenue opportunities;
- poor visibility for management;
- fragmented guest history;
- limited quality control before going live.

Staynex centralizes this into a hotel operations command center with AI-assisted workflows.

## Current Positioning

Staynex can be positioned in two complementary ways:

1. Reception-integrated tools
   - Inbox and WhatsApp assistance.
   - Human Takeover.
   - Tickets.
   - Reception / Pre Check-in.
   - QR Rooms.
   - Knowledge Base.
   - Experience booking follow-up.

2. Command Center for management, operations and corporate teams
   - Hotel dashboard.
   - Hotel Health.
   - Platform Monitoring.
   - AI Quality / Failure Intelligence.
   - Provider marketplace.
   - Automations and preview center.
   - Multi-hotel platform admin.

## What Staynex Is Not

Staynex is not currently a full PMS, nor a write-back PMS replacement. It is not yet a completed multi-PMS orchestrator. The PMS orchestration architecture is being prepared, but current PMS work should be described as read-only / sandbox-ready unless a specific connector is confirmed live.

## Product Boundaries

Current validated areas include the dashboard, platform admin, hotel workspaces, AI-assisted inbox, tickets, permissions, simulations, automations preview, experience provider workflow and Ubikos adapter preparation.

Areas that must be described carefully:

- Ubikos is prepared in sandbox/read-only architecture, not live.
- Automated guest messaging is designed and tested, but real sends are guarded by environment flags.
- Simulation Mode and Failure Intelligence are internal QA tools, not hotel-facing features.
- Provider emails can be handled by configured services, but production provider workflows depend on provider configuration and environment mode.

