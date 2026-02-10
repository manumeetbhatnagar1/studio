'use client';

import { useMemo } from 'react';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

type UserProfile = {
    subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
    subscriptionPlanId?: string;
}

type SubscriptionPlan = {
  id: string;
  name: string;
  numberOfLiveClasses?: number;
};

export function useIsSubscribed() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!user?.uid || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const planDocRef = useMemoFirebase(() => {
    if (!userProfile?.subscriptionPlanId || !firestore) return null;
    return doc(firestore, 'subscription_plans', userProfile.subscriptionPlanId);
  }, [firestore, userProfile?.subscriptionPlanId]);

  const { data: subscriptionPlan, isLoading: isPlanLoading } = useDoc<SubscriptionPlan>(planDocRef);

  const isSubscribed = useMemo(() => {
    if (!userProfile?.subscriptionStatus) return false;
    return ['active', 'trialing'].includes(userProfile.subscriptionStatus);
  }, [userProfile]);

  const hasLiveClassAccess = useMemo(() => {
    if (!isSubscribed) return false;
    if (!subscriptionPlan) return false; // If subscribed but no plan found, deny access
    // A plan has live class access if the property is present and > 0.
    return !!(subscriptionPlan.numberOfLiveClasses && subscriptionPlan.numberOfLiveClasses > 0);
  }, [isSubscribed, subscriptionPlan]);

  return {
    isSubscribed,
    hasLiveClassAccess,
    isLoading: isUserLoading || isProfileLoading || isPlanLoading,
  };
}
