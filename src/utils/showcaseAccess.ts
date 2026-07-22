const BASE_DOMAIN = 'musashino-u.ac.jp';
const SHOWCASE_HOME_PATH = '/showcase';
const SHOWCASE_LOGIN_PATH = '/showcase/login';
const RETURN_PATH_BASE_URL = 'https://showcase-return.local';

export const getEmailDomain = (email?: string | null): string | null => {
  if (!email) {
    return null;
  }
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return null;
  }
  return email.slice(atIndex + 1).toLowerCase();
};

export const isShowcaseDomainAllowed = (email?: string | null): boolean => {
  const domain = getEmailDomain(email);
  if (!domain) {
    return false;
  }
  if (domain === BASE_DOMAIN) {
    return true;
  }
  return domain.endsWith(`.${BASE_DOMAIN}`);
};

export const getShowcaseReturnPath = (candidate?: string | null): string => {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return SHOWCASE_HOME_PATH;
  }

  try {
    const url = new URL(candidate, RETURN_PATH_BASE_URL);
    const isSameOrigin = url.origin === RETURN_PATH_BASE_URL;
    const isShowcasePath =
      url.pathname === SHOWCASE_HOME_PATH || url.pathname.startsWith(`${SHOWCASE_HOME_PATH}/`);
    const isLoginPath =
      url.pathname === SHOWCASE_LOGIN_PATH || url.pathname.startsWith(`${SHOWCASE_LOGIN_PATH}/`);

    if (!isSameOrigin || !isShowcasePath || isLoginPath) {
      return SHOWCASE_HOME_PATH;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return SHOWCASE_HOME_PATH;
  }
};
