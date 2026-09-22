'use client';

import { forwardRef, type ImgHTMLAttributes } from 'react';
import { useAuthenticatedStorageUrl } from '@/hooks/useAuthenticatedStorageUrl';

type AuthenticatedStorageImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  alt: string;
  storagePath?: string;
  legacyUrl?: string;
  loadingFallback?: React.ReactNode;
};

const AuthenticatedStorageImage = forwardRef<HTMLImageElement, AuthenticatedStorageImageProps>(
  ({ storagePath, legacyUrl, loadingFallback = null, alt, onError, ...imageProps }, forwardedRef) => {
    const { url, loading, error } = useAuthenticatedStorageUrl({ storagePath, legacyUrl });

    if (loading || !url) {
      return <>{loadingFallback}</>;
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...imageProps}
        ref={forwardedRef}
        src={url}
        alt={alt}
        onError={(event) => {
          if (error) {
            console.error('[AuthenticatedStorageImage] Failed to fetch image:', error);
          }
          onError?.(event);
        }}
      />
    );
  },
);

AuthenticatedStorageImage.displayName = 'AuthenticatedStorageImage';

export default AuthenticatedStorageImage;
