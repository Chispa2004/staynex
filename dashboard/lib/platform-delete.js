export const HOTEL_ARCHIVE_RELATED_OPERATIONS = [
  {
    table: 'hotel_users',
    matchColumn: 'hotel_id',
    update: (now) => ({ status: 'disabled', updated_at: now })
  },
  {
    table: 'hotel_pms_connections',
    matchColumn: 'hotel_id',
    update: (now) => ({ enabled: false, sync_status: 'archived', updated_at: now })
  },
  {
    table: 'automations',
    matchColumn: 'hotel_id',
    update: (now) => ({ active: false, updated_at: now })
  },
  {
    table: 'automation_events',
    matchColumn: 'hotel_id',
    update: (now) => ({ metadata: { archived_with_hotel_at: now } })
  },
  {
    table: 'scheduled_messages',
    matchColumn: 'hotel_id',
    update: (now) => ({ status: 'cancelled', updated_at: now })
  },
  {
    table: 'conversations',
    matchColumn: 'hotel_id',
    update: (now) => ({ status: 'archived', updated_at: now })
  },
  {
    table: 'tickets',
    matchColumn: 'hotel_id',
    update: (now) => ({ status: 'archived', updated_at: now })
  },
  {
    table: 'reservations',
    matchColumn: 'hotel_id',
    update: (now) => ({ status: 'archived', updated_at: now })
  },
  {
    table: 'experience_booking_requests',
    matchColumn: 'hotel_id',
    update: (now) => ({ status: 'cancelled', lead_status: 'cancelled', updated_at: now })
  }
];

const slugifyArchive = (value) => String(value || 'hotel')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40) || 'hotel';

export const isArchivedHotel = (hotel = {}) => Boolean(
  hotel.deleted_at
  || hotel.archived_at
  || hotel.status === 'archived'
  || hotel.metadata?.archived
  || String(hotel.name || '').endsWith(' (archived)')
);

export const buildHotelArchiveUpdate = ({
  hotel,
  now = new Date().toISOString(),
  actorId = null,
  reason = 'platform_delete_hotel'
} = {}) => ({
  deleted_at: now,
  archived_at: now,
  archived_by: actorId,
  archived_reason: reason,
  status: 'archived',
  updated_at: now,
  metadata: {
    ...(hotel?.metadata || {}),
    archived: true,
    archived_at: now,
    archived_by: actorId,
    archived_reason: reason
  }
});

export const buildHotelArchiveFallbackUpdate = ({
  hotel,
  now = new Date().toISOString()
} = {}) => {
  const suffix = `archived-${Date.now()}`;
  const baseSlug = slugifyArchive(hotel?.workspace_slug || hotel?.slug || hotel?.name);

  return {
    name: `${String(hotel?.name || 'Hotel').replace(/\s+\(archived\)$/i, '')} (archived)`,
    slug: `${baseSlug}-${suffix}`,
    workspace_slug: `${baseSlug}-${suffix}`,
    whatsapp_number: null,
    support_email: null,
    description: 'Archived by platform admin. Run supabase/sql/add_hotel_archive_fields.sql for first-class archive fields.',
    updated_at: now
  };
};

export const getScopedArchiveOperations = (hotelId, now = new Date().toISOString()) => (
  HOTEL_ARCHIVE_RELATED_OPERATIONS.map((operation) => ({
    table: operation.table,
    matchColumn: operation.matchColumn,
    matchValue: hotelId,
    update: operation.update(now)
  }))
);
