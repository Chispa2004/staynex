import { NextResponse } from 'next/server';

const getBackendUrl = () => (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3000'
);

export async function POST(request) {
  try {
    const body = await request.json();
    const response = await fetch(`${getBackendUrl()}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();

    return NextResponse.json(payload, {
      status: response.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
