const DEFAULT_EMULATOR_BASE_URL =
  'http://127.0.0.1:5001/online-review-gallery/asia-northeast1';
const DEFAULT_PROD_BASE_URL =
  'https://asia-northeast1-online-review-gallery.cloudfunctions.net';

const isLocalBaseUrl = (value: string) =>
  value.includes('localhost') || value.includes('127.0.0.1');

export const getFunctionsBaseUrl = (): string => {
  const envBaseUrl = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL?.trim();
  const envLooksLocal = envBaseUrl ? isLocalBaseUrl(envBaseUrl) : false;
  const isProd = process.env.NODE_ENV === 'production';

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocalHost) {
      return envBaseUrl || DEFAULT_EMULATOR_BASE_URL;
    }

    if (envBaseUrl && !envLooksLocal) {
      return envBaseUrl;
    }

    return DEFAULT_PROD_BASE_URL;
  }

  if (isProd) {
    if (envBaseUrl && !envLooksLocal) {
      return envBaseUrl;
    }
    return DEFAULT_PROD_BASE_URL;
  }

  return envBaseUrl || DEFAULT_EMULATOR_BASE_URL;
};
