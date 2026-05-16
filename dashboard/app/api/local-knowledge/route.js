import { NextResponse } from 'next/server';
import {
  createLocalKnowledgeItem,
  deleteLocalKnowledgeItem,
  getLocalKnowledgeItems,
  updateLocalKnowledgeItem
} from '@/lib/local-knowledge';

const jsonOptions = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

const statusForError = (error, fallback = 500) => error.status || fallback;

export async function GET(request) {
  try {
    const data = await getLocalKnowledgeItems(request);
    return NextResponse.json(data, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { items: [], error: error.message || 'Could not load local knowledge' },
      { status: statusForError(error), ...jsonOptions }
    );
  }
}

export async function POST(request) {
  try {
    const item = await createLocalKnowledgeItem(request, await request.json());
    return NextResponse.json({ item }, { status: 201, ...jsonOptions });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Could not create local knowledge item' },
      { status: statusForError(error, 400), ...jsonOptions }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    if (!body.id) {
      throw new Error('id is required');
    }

    const item = await updateLocalKnowledgeItem(request, body.id, body);
    return NextResponse.json({ item }, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Could not update local knowledge item' },
      { status: statusForError(error, 400), ...jsonOptions }
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

    await deleteLocalKnowledgeItem(request, body.id);
    return NextResponse.json({ id: body.id }, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Could not delete local knowledge item' },
      { status: statusForError(error, 400), ...jsonOptions }
    );
  }
}
