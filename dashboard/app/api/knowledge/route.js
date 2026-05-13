import { NextResponse } from 'next/server';
import {
  createKnowledgeEntry,
  getKnowledgeEntries
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

export async function GET() {
  try {
    const data = await getKnowledgeEntries();
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
    const entry = await createKnowledgeEntry(payload);

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
