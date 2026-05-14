import { NextResponse } from 'next/server';
import {
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  getKnowledgeEntries,
  updateKnowledgeEntry
} from '@/lib/knowledge';

const validatePayload = ({ title, key, category, value, is_active }) => {
  if (!key?.trim() || !value?.trim()) {
    throw new Error('key and value are required');
  }

  return {
    title: title?.trim() || key.trim(),
    key: key.trim(),
    category: category?.trim() || key.trim(),
    value: value.trim(),
    is_active: is_active ?? true
  };
};

export async function GET(request) {
  try {
    const data = await getKnowledgeEntries(request);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = validatePayload(await request.json());
    const entry = await createKnowledgeEntry(request, payload);

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    if (!body.id) {
      throw new Error('id is required');
    }

    const payload = validatePayload(body);
    const entry = await updateKnowledgeEntry(request, {
      id: body.id,
      ...payload
    });

    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

export async function PUT(request) {
  return PATCH(request);
}

export async function DELETE(request) {
  try {
    const body = await request.json();

    if (!body.id) {
      throw new Error('id is required');
    }

    await deleteKnowledgeEntry(request, body.id);

    return NextResponse.json({ id: body.id });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
