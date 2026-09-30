import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export async function GET(req: Request) {
  const loginUrl = new URL('/login', req.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(COOKIE_NAME);
  return response;
}

export async function POST(req: Request) {
  const loginUrl = new URL('/login', req.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(COOKIE_NAME);
  return response;
}
