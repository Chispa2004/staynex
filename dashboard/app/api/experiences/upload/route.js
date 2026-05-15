import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const BUCKET = 'hotel-experience-images';

const sanitizeFileName = (value = 'experience') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9.]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90);

const ensureBucket = async (supabase) => {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw listError;
  }

  if ((buckets || []).some((bucket) => bucket.name === BUCKET)) {
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  });

  if (error) {
    throw error;
  }
};

export async function POST(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'experiences_manage')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ error: 'No hotel available' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG or WEBP images are supported' }, { status: 400 });
    }

    await ensureBucket(supabase);

    const extension = file.name?.split('.').pop() || 'jpg';
    const fileName = sanitizeFileName(file.name || `experience.${extension}`);
    const path = `${hotel.id}/${Date.now()}-${fileName}`;
    const bytes = await file.arrayBuffer();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      url: data.publicUrl,
      path
    }, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Image upload failed'
    }, { status: 500 });
  }
}
