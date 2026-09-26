'use client';

import GalleryPage from './GalleryPage';
import { useEffect, useState } from 'react';

export default function Page() {
  const [adminRemoved, setAdminRemoved] = useState(false);
  useEffect(() => {
    setAdminRemoved(new URLSearchParams(window.location.search).get('adminRemoved') === '1');
  }, []);
  return <>
    {adminRemoved && <p role="status" className="admin-users-notice m-4">自分自身の管理者権限を削除しました。現在はゲストとして利用しています。</p>}
    <GalleryPage mode="active" />
  </>;
}
