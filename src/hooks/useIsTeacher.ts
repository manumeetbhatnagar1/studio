
'use client';

import { useMemo } from 'react';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export function useIsTeacher() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const teacherRoleRef = useMemoFirebase(() => {
    if (!user?.uid || !firestore) return null;
    return doc(firestore, 'roles_teacher', user.uid);
  }, [firestore, user?.uid]);
  
  const { data: teacherDoc, isLoading: isTeacherLoading } = useDoc(teacherRoleRef);

  const isTeacher = useMemo(() => !!teacherDoc, [teacherDoc]);

  return {
    isTeacher,
    isLoading: isUserLoading || isTeacherLoading,
  };
}
