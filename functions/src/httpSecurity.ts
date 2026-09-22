import * as admin from 'firebase-admin';

export const ALLOWED_CORS_ORIGINS = [
  'https://online-review-gallery.web.app',
  'https://online-review-gallery.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export const GOOGLE_OAUTH_TOKEN_HEADER = 'x-google-oauth-token';

type RequestLike = {
  get(name: string): string | undefined;
};

type VerifiedIdToken = {
  uid: string;
  email?: string;
};

export type AdminRequestContext = {
  uid: string;
  email: string;
  role: 'admin';
};

export type AdminAuthDependencies = {
  verifyIdToken(token: string): Promise<VerifiedIdToken>;
  getRole(email: string): Promise<string | undefined>;
};

export class HttpAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: 'authentication_required' | 'invalid_token' | 'admin_required'
  ) {
    super(code);
    this.name = 'HttpAuthError';
  }
}

const defaultDependencies: AdminAuthDependencies = {
  verifyIdToken: (token) => admin.auth().verifyIdToken(token),
  getRole: async (email) => {
    const roleDoc = await admin.firestore().collection('userRoles').doc(email).get();
    return roleDoc.exists ? roleDoc.data()?.role : undefined;
  },
};

const readBearerToken = (request: RequestLike): string => {
  const authorization = request.get('authorization');
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    throw new HttpAuthError(401, 'authentication_required');
  }

  return match[1];
};

export async function requireAdmin(
  request: RequestLike,
  dependencies: AdminAuthDependencies = defaultDependencies
): Promise<AdminRequestContext> {
  const token = readBearerToken(request);
  let decodedToken: VerifiedIdToken;

  try {
    decodedToken = await dependencies.verifyIdToken(token);
  } catch {
    throw new HttpAuthError(401, 'invalid_token');
  }

  const email = decodedToken.email?.trim();
  if (!decodedToken.uid || !email) {
    throw new HttpAuthError(403, 'admin_required');
  }

  const role = await dependencies.getRole(email);
  if (role !== 'admin') {
    throw new HttpAuthError(403, 'admin_required');
  }

  return {
    uid: decodedToken.uid,
    email,
    role: 'admin',
  };
}

export function requireGoogleOAuthToken(request: RequestLike): string {
  const token = request.get(GOOGLE_OAUTH_TOKEN_HEADER)?.trim();
  if (!token) {
    throw new HttpAuthError(401, 'authentication_required');
  }
  return token;
}

export type ImportStatusResponse = {
  status: string;
  progress: number;
  processedFiles: number;
  totalFiles: number;
};

export function toImportStatusResponse(data: FirebaseFirestore.DocumentData): ImportStatusResponse {
  return {
    status: typeof data.status === 'string' ? data.status : 'unknown',
    progress: typeof data.progress === 'number' ? data.progress : 0,
    processedFiles: typeof data.processedFiles === 'number' ? data.processedFiles : 0,
    totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : 0,
  };
}

export function getSafeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') {
      return String(code);
    }
  }

  return error instanceof Error ? error.name : 'unknown_error';
}
