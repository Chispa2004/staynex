import { NextResponse } from 'next/server';
import {
  createExperienceEntry,
  deleteExperienceEntry,
  getExperienceEntries,
  updateExperienceEntry
} from '@/lib/experiences';

const jsonOptions = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

const statusForError = (error, fallback = 500) => error.status || fallback;

export async function GET(request) {
  try {
    const data = await getExperienceEntries(request);
    return NextResponse.json(data, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { experiences: [], error: error.message },
      { status: statusForError(error), ...jsonOptions }
    );
  }
}

export async function POST(request) {
  try {
    const experience = await createExperienceEntry(request, await request.json());
    return NextResponse.json({ experience }, { status: 201, ...jsonOptions });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
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

    const experience = await updateExperienceEntry(request, body.id, body);
    return NextResponse.json({ experience }, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
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

    await deleteExperienceEntry(request, body.id);
    return NextResponse.json({ id: body.id }, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: statusForError(error, 400), ...jsonOptions }
    );
  }
}
