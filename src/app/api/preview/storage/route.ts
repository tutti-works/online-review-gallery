import { NextRequest } from 'next/server';
import { resolveStoragePath } from '@/lib/storageObject';

export async function GET(request: NextRequest) {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.NEXT_PUBLIC_LOCAL_PREVIEW !== 'true'
  )
    return new Response(null, { status: 404 });
  const path = resolveStoragePath(
    request.nextUrl.searchParams.get('path') ?? undefined
  );
  const authorization = request.headers.get('authorization');
  if (!authorization?.match(/^Bearer [A-Za-z0-9._-]+$/))
    return new Response(null, { status: 401 });
  if (!path) return new Response(null, { status: 400 });
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) return new Response(null, { status: 503 });
  try {
    const response = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media`,
      {
        headers: { Authorization: authorization },
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      }
    );
    if (!response.ok) return new Response(null, { status: response.status });
    return new Response(response.body, {
      headers: {
        'Content-Type':
          response.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('画像を取得できませんでした。', { status: 502 });
  }
}
