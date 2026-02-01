'use client';

import { useMemo } from 'react';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

type UserProfile = {
    subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
}

export function useIsSubscribed() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!user?.uid || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const isSubscribed = useMemo(() => {
    if (!userProfile?.subscriptionStatus) return false;
    return ['active', 'trialing'].includes(userProfile.subscriptionStatus);
  }, [userProfile]);

  return {
    isSubscribed,
    isLoading: isUserLoading || isProfileLoading,
  };
}
