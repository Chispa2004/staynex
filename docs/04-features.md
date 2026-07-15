# Feature Inventory

Audit date: 2026-07-15

## Platform Admin

- What it does: internal Staynex console for global operations.
- Users: platform_admin, super_admin, internal_only.
- Status: pilot-ready.
- Dependencies: Supabase data, platform permissions.
- Limitations: should remain internal; not hotel-facing.

## Hotels

- What it does: lists hotel workspaces and allows platform admins to enter a hotel workspace.
- Users: platform admins.
- Status: pilot-ready.
- Dependencies: correct active hotel context.
- Limitations: untracked/demo hotels should be managed carefully.

## Providers

- What it does: manages external experience providers and provider experiences.
- Users: platform admins.
- Status: pilot-ready.
- Dependencies: provider data, email mode, hotel-provider assignments.
- Limitations: real provider SLAs and commercial terms are external.

## Monitoring

- What it does: internal observability for platform health, provider failures, automation health, PMS/WhatsApp issues.
- Users: Staynex internal.
- Status: pilot-ready.
- Dependencies: logs, health snapshots, platform data.
- Limitations: not a full Datadog-grade monitoring stack.

## Dashboard

- What it does: hotel operations command center.
- Users: hotel admin, manager, receptionist where allowed.
- Status: pilot-ready.
- Dependencies: hotel data, PMS context, tickets, inbox, provider requests.
- Limitations: value depends on real data quality.

## Health

- What it does: hotel-facing operational health.
- Users: hotel teams.
- Status: pilot-ready.
- Dependencies: PMS/WhatsApp/ticket/provider state.
- Limitations: intentionally hides technical internals.

## Inbox

- What it does: WhatsApp conversation management, suggested replies, AI context and Human Takeover.
- Users: reception, manager, hotel admin.
- Status: pilot-ready.
- Dependencies: conversations, guests, Twilio/webhooks, AI services.
- Limitations: real operation depends on WhatsApp setup per hotel.

## Tickets

- What it does: operational issue tracking for maintenance, housekeeping, guest requests and escalations.
- Users: hotel operations.
- Status: pilot-ready.
- Dependencies: ticket tables and AI/ticket creation logic.
- Limitations: department workflows must be validated with each hotel.

## Reception / Pre Check-in

- What it does: searches reservations/guests and shows check-in/check-out readiness.
- Users: receptionist, manager, hotel admin.
- Status: pilot-ready with mock/sandbox PMS data.
- Dependencies: reservations, guest data and PMS context.
- Limitations: read-only; does not perform legal check-in or PMS writes.

## Automations

- What it does: manages automation playbooks, previews, scheduling and test scenarios.
- Users: hotel admins/managers for previews; platform admins for QA.
- Status: prepared but guarded.
- Dependencies: scheduled messages, guest/reservation context, environment flags.
- Limitations: real sending should remain disabled until pilot validation.

## Automation Test Center

- What it does: safe dry-run simulation for automation messages and decisions.
- Users: internal/admin QA.
- Status: sandbox/mock.
- Dependencies: local scenario generator.
- Limitations: does not prove live hotel delivery.

## Human Takeover

- What it does: pauses AI auto replies for a conversation so staff can respond manually.
- Users: receptionist, manager, hotel admin.
- Status: pilot-ready.
- Dependencies: conversation AI state.
- Limitations: all auto-send paths must continue respecting takeover state.

## AI Quality / Failure Intelligence

- What it does: internal QA for AI failures, long journeys, simulation replay and quality metrics.
- Users: platform_admin, super_admin, internal_only.
- Status: sandbox/mock.
- Dependencies: simulation services and AI QA data.
- Limitations: internal only; not a hotel product screen.

## Simulation Mode

- What it does: simulates hotels, guests, PMS context and conversations.
- Users: internal Staynex.
- Status: sandbox/mock.
- Dependencies: simulation service.
- Limitations: no real PMS, WhatsApp or automations.

## Knowledge Base

- What it does: operational hotel information used by staff and AI.
- Users: admins, managers, receptionists with permissions.
- Status: pilot-ready.
- Dependencies: knowledge tables and tenant isolation.
- Limitations: quality depends on hotel-maintained content.

## Local Knowledge

- What it does: local recommendations, operational FAQs, services and destination information.
- Users: hotel staff.
- Status: pilot-ready.
- Dependencies: local knowledge data.
- Limitations: must be kept current to avoid wrong AI responses.

## Academy

- What it does: role-based onboarding and training.
- Users: hotel staff.
- Status: pilot-ready.
- Dependencies: dashboard content.
- Limitations: should be periodically reviewed for white-label/professional wording.

## QR Rooms

- What it does: room QR links for guests to start WhatsApp conversations.
- Users: reception/admin.
- Status: pilot-ready.
- Dependencies: QR generator and WhatsApp configuration.
- Limitations: real guest experience depends on correct WhatsApp number setup.

## PMS Intelligence

- What it does: provides stay phase, reservation context, room status, occupancy and revenue context.
- Users: AI, dashboard, reception.
- Status: sandbox/prepared unless connected PMS is confirmed.
- Dependencies: PMS data source.
- Limitations: no current claim of live Ubikos.

## Guest Intelligence

- What it does: guest profiles, affinities, sentiment, VIP/review risk/revenue potential logic.
- Users: AI Copilot, dashboard, automations.
- Status: pilot-ready / data-dependent.
- Dependencies: messages, guest memory, tickets, reservations.
- Limitations: should not be presented as perfect scoring; quality depends on input data.

## Revenue

- What it does: revenue opportunities, upsells, partner revenue and automation revenue context.
- Users: hotel admin/manager, platform.
- Status: pilot-ready.
- Dependencies: conversion events, provider requests, upsell logic.
- Limitations: estimated revenue should be distinguished from confirmed revenue.

## Experience Marketplace

- What it does: catalog of providers/experiences and guest-specific booking requests.
- Users: platform admins; hotel teams for tracking.
- Status: pilot-ready.
- Dependencies: provider setup, provider email, hotel assignments.
- Limitations: live provider fulfilment remains external.

## Multi-language

- What it does: dashboard UI language and AI response language support.
- Users: hotel teams and guests.
- Status: pilot-ready.
- Dependencies: translation dictionaries and language detection.
- Limitations: ongoing QA needed to avoid mixed UI language.

## Multi-hotel

- What it does: platform can manage multiple hotels and enter isolated hotel workspaces.
- Users: platform admins.
- Status: pilot-ready.
- Dependencies: active hotel context and route protections.
- Limitations: every new route must be checked for tenant filtering.

## Roles and Permissions

- What it does: controls route visibility and actions by hotel/platform role.
- Users: all.
- Status: pilot-ready.
- Dependencies: `dashboard/lib/permissions.js`.
- Limitations: backend/API authorization must be kept aligned with UI permissions.

