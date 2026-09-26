import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAdminUsersService } from '@/lib/server/adminUsers';
import { createAdminUsersHandler } from '@/lib/server/adminUsersHandler';
import { isLocalPreview } from '@/lib/localPreview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function app() {
  return getApps().find((item) => item.name === 'atria-admin') ?? initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  }, 'atria-admin');
}

const handler = createAdminUsersHandler({
  verify: (token) => getAuth(app()).verifyIdToken(token, true),
  service: () => createAdminUsersService(getFirestore(app())),
  readOnly: isLocalPreview,
});

export const GET = handler;
export const POST = handler;
