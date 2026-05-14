import { NextResponse } from 'next/server';
import {
  deleteKnowledgeEntry,
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

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const payload = validatePayload(await request.json());
    const entry = await updateKnowledgeEntry(request, {
      id,
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

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteKnowledgeEntry(request, id);

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
