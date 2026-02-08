'use client';

import { useMemo } from 'react';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export function useIsAdmin() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const adminRoleRef = useMemoFirebase(() => {
    if (!user?.uid || !firestore) return null;
    return doc(firestore, 'roles_admin', user.uid);
  }, [firestore, user?.uid]);
  
  const { data: adminDoc, isLoading: isAdminLoading } = useDoc(adminRoleRef);

  const isAdmin = useMemo(() => !!adminDoc, [adminDoc]);

  return {
    isAdmin,
    isLoading: isUserLoading || isAdminLoading,
  };
}
