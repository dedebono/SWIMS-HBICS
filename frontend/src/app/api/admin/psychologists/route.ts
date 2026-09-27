import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('swims_access_token')?.value;
  const tenantSlug = req.nextUrl.searchParams.get('t');

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/psychologists${tenantSlug ? `?t=${tenantSlug}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('swims_access_token')?.value;
  const body = await req.json();
  const tenantSlug = req.nextUrl.searchParams.get('t') || body.tenantSlug;

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/psychologists${tenantSlug ? `?t=${tenantSlug}` : ''}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
  );
  return NextResponse.json(await res.json());
}

export async function PUT(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('swims_access_token')?.value;
  const { searchParams } = req.nextUrl;
  const psychologistId = searchParams.get('id');
  const body = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/psychologists?id=${psychologistId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
  );
  return NextResponse.json(await res.json());
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('swims_access_token')?.value;
  const psychologistId = req.nextUrl.searchParams.get('id');

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/psychologists?id=${psychologistId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  return NextResponse.json(await res.json());
}
