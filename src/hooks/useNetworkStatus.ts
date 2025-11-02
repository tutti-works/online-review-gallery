import { useEffect, useState } from 'react';

const isNavigatorOnline = () => {
  if (typeof navigator === 'undefined') {
    return true;
  }
  return navigator.onLine;
};

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(isNavigatorOnline());
  const [lastChangedAt, setLastChangedAt] = useState<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      setIsOnline(true);
      setLastChangedAt(Date.now());
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastChangedAt(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, lastChangedAt };
};

export type NetworkStatus = ReturnType<typeof useNetworkStatus>;
