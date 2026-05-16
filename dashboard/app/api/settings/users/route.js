import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const STATUSES = ['active', 'invited', 'disabled'];
const HOTEL_USER_MANAGEMENT_ROLES = ['admin', 'receptionist'];

const jsonError = (message, status = 500) => NextResponse.json({
  users: [],
  error: message
}, { status });

const getContext = async (request) => {
  const context = await getCurrentHotelForRequest(request);

  if (!context.hotel?.id) {
    throw new Error('No hotel available');
  }

  if (!canAccess(context.role, 'user_management')) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }

  return context;
};

const normalizeAllowedHotelRole = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();

  if (!HOTEL_USER_MANAGEMENT_ROLES.includes(normalizedRole)) {
    const error = new Error('Role not allowed from hotel user management.');
    error.status = 400;
    throw error;
  }

  return normalizedRole;
};

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getContext(request);
    const { data, error } = await supabase
      .from('hotel_users')
      .select('*')
      .eq('hotel_id', hotel.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      users: data || [],
      role,
      hotel,
      hotelId: hotel.id
    });
  } catch (error) {
    console.error('Hotel users lookup failed', error);
    return jsonError(error.message || 'Could not load users', error.status || 500);
  }
}

export async function POST(request) {
  try {
    const { supabase, hotel } = await getContext(request);
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const role = normalizeAllowedHotelRole(body.role || 'receptionist');

    if (!email || !email.includes('@')) {
      return jsonError('A valid email is required', 400);
    }

    const { data, error } = await supabase
      .from('hotel_users')
      .insert({
        hotel_id: hotel.id,
        email,
        role,
        status: 'invited',
        is_default: Boolean(body.is_default),
        invited_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ user: data });
  } catch (error) {
    console.error('Hotel user invite failed', error);
    return jsonError(error.message || 'Could not invite user', error.status || 500);
  }
}

export async function PATCH(request) {
  try {
    const { supabase, hotel } = await getContext(request);
    const body = await request.json();
    const updates = {};

    if (!body.id) {
      return jsonError('User assignment id is required', 400);
    }

    if (body.role !== undefined) {
      updates.role = normalizeAllowedHotelRole(body.role);
    }

    if (body.status && STATUSES.includes(body.status)) {
      updates.status = body.status;
      updates.accepted_at = body.status === 'active' ? new Date().toISOString() : null;
    }

    if (typeof body.is_default === 'boolean') {
      updates.is_default = body.is_default;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('hotel_users')
      .update(updates)
      .eq('id', body.id)
      .eq('hotel_id', hotel.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return jsonError('User assignment not found', 404);
    }

    return NextResponse.json({ user: data });
  } catch (error) {
    console.error('Hotel user update failed', error);
    return jsonError(error.message || 'Could not update user', error.status || 500);
  }
}

export async function DELETE(request) {
  try {
    const { supabase, hotel } = await getContext(request);
    const body = await request.json();

    if (!body.id) {
      return jsonError('User assignment id is required', 400);
    }

    const { data, error } = await supabase
      .from('hotel_users')
      .update({
        status: 'disabled',
        updated_at: new Date().toISOString()
      })
      .eq('id', body.id)
      .eq('hotel_id', hotel.id)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({ user: data });
  } catch (error) {
    console.error('Hotel user disable failed', error);
    return jsonError(error.message || 'Could not disable user', error.status || 500);
  }
}
