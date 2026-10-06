import {isCheckinDemoHotel} from '../../../../shared/checkin-demo-view.js';
import { parseOperationalFilter } from '../../../../shared/operational-metrics.js';
import { loadOperationalMetrics } from '@/lib/operational-metrics';
import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { getTickets, getTicketsByCategories } from '@/lib/tickets';
import {loadDashboardPendingTickets} from '@/lib/pending-tickets';

export async function GET(request) {
  try {
    const { supabase, hotel, role, accessDenied } = await getCurrentHotelForRequest(request, { readOnly: true, includeDirectory: false });
    if (new URL(request.url).searchParams.get('view') === 'pending') {
      const params=new URL(request.url).searchParams;
      if (accessDenied || !hotel?.id || !canAccess(role,'tickets') || (params.get('hotelId') && params.get('hotelId')!==hotel.id))
        return NextResponse.json({error:'Acceso al hotel denegado.'},{status:403});
      const origin=isCheckinDemoHotel(hotel)?'all':params.get('ticketOrigin') || 'other';
      if(!['other','simulated'].includes(origin) && !(origin==='all' && isCheckinDemoHotel(hotel))) return NextResponse.json({error:'Filtro de tickets no válido.'},{status:400});
      return NextResponse.json(await loadDashboardPendingTickets({supabase,hotel,origin}),{headers:{'Cache-Control':'no-store'}});
    }
    if (new URL(request.url).searchParams.get('view') === 'metrics') {
      if (accessDenied || !hotel?.id || !canAccess(role, 'tickets')) return NextResponse.json({error:'Acceso al hotel denegado.'},{status:403});
      const filter = parseOperationalFilter(new URL(request.url).searchParams, 'tickets');
      if (filter.hotelId && filter.hotelId !== hotel.id) return NextResponse.json({error:'Acceso al hotel denegado.'},{status:403});
      const {items,...metrics} = await loadOperationalMetrics({supabase,hotel,kind:'tickets',filter});
      return NextResponse.json({hotel,hotelId:hotel.id,role,tickets:items,metrics},{headers:{'Cache-Control':'no-store'}});
    }

    if (!canAccess(role, 'tickets') && !canAccess(role, 'housekeeping') && !canAccess(role, 'maintenance')) {
      return NextResponse.json({ hotel, tickets: [], error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const categories = searchParams.get('categories')
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const tickets = categories?.length
      ? await getTicketsByCategories(categories, { supabase, hotelId: hotel?.id })
      : await getTickets({ supabase, hotelId: hotel?.id });

    return NextResponse.json({
      hotel,
      hotelId: hotel?.id || null,
      tickets
    });
  } catch (error) {
    return NextResponse.json({
      tickets: [],
      error: error.message || 'Could not load tickets'
    }, { status: error.status || 500 });
  }
}
