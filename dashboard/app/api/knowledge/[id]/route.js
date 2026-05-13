import { NextResponse } from 'next/server';
import {
  deleteKnowledgeEntry,
  updateKnowledgeEntry
} from '@/lib/knowledge';

const validatePayload = ({ key, value }) => {
  if (!key?.trim() || !value?.trim()) {
    throw new Error('key and value are required');
  }

  return {
    key: key.trim(),
    value: value.trim()
  };
};

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const payload = validatePayload(await request.json());
    const entry = await updateKnowledgeEntry({
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
    await deleteKnowledgeEntry(id);

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
