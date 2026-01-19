const BASE_DOMAIN = 'musashino-u.ac.jp';

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
