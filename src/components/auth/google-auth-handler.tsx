'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { GoogleAuthProvider, signInWithPopup, type User } from 'firebase/auth';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

export function GoogleAuthHandler() {
    const [isLoading, setIsLoading] = useState(false);
    const [newUser, setNewUser] = useState<User | null>(null);
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    async function handleGoogleSignIn() {
        setIsLoading(true);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
    
            const userDocRef = doc(firestore, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            const isDesignatedAdmin = user.email?.toLowerCase() === 'manumeet.bhatnagar1@gmail.com';
    
            if (userDocSnap.exists()) {
                // Existing user: Update their info and check for admin promotion
                const batch = writeBatch(firestore);
                const [firstName, ...lastName] = user.displayName?.split(' ') || ['', ''];
                
                const updatedData: any = {
                    firstName: firstName || userDocSnap.data().firstName,
                    lastName: lastName.join(' ') || userDocSnap.data().lastName,
                    email: user.email,
                    photoURL: user.photoURL,
                };

                if (isDesignatedAdmin) {
                    updatedData.roleId = 'admin';
                    updatedData.teacherStatus = 'approved';
                    const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
                    const teacherRoleRef = doc(firestore, 'roles_teacher', user.uid);
                    batch.set(adminRoleRef, { createdAt: new Date().toISOString() }, { merge: true });
                    batch.set(teacherRoleRef, { createdAt: new Date().toISOString() }, { merge: true });
                }

                batch.update(userDocRef, updatedData);
                await batch.commit();

                toast({
                    title: 'Login Successful',
                    description: `Welcome back, ${user.displayName}!`,
                });
                router.push('/dashboard');

            } else {
                // New user: Trigger the role selection dialog
                setNewUser(user);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Google Sign-In Failed',
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleRoleSelection(role: 'student' | 'teacher') {
        if (!newUser) return;
        
        setIsLoading(true);
        try {
            const batch = writeBatch(firestore);
            const userRef = doc(firestore, 'users', newUser.uid);

            const [firstName, ...lastName] = newUser.displayName?.split(' ') || ['User', ''];

            const userData: any = {
                id: newUser.uid,
                firstName: firstName,
                lastName: lastName.join(' '),
                email: newUser.email,
                photoURL: newUser.photoURL,
                phoneNumber: newUser.phoneNumber || '',
                roleId: role,
                status: 'active',
            };
            
            if (role === 'teacher') {
                userData.teacherStatus = 'pending';
            }

             // Special admin logic for the designated admin email
            if (newUser.email?.toLowerCase() === 'manumeet.bhatnagar1@gmail.com') {
                userData.roleId = 'admin';
                userData.teacherStatus = 'approved';
                
                const adminRoleRef = doc(firestore, 'roles_admin', newUser.uid);
                const teacherRoleRef = doc(firestore, 'roles_teacher', newUser.uid);
                batch.set(adminRoleRef, { createdAt: new Date().toISOString() });
                batch.set(teacherRoleRef, { createdAt: new Date().toISOString() });
            }
            
            batch.set(userRef, userData);
            await batch.commit();

            toast({
                title: 'Registration Complete!',
                description: `Your ${userData.roleId} account has been created.`,
            });
            setNewUser(null);
            router.push('/dashboard');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Registration Failed',
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    }


    return (
        <>
            <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                    </span>
                </div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
                {isLoading && newUser === null ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : (
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 23.4 172.9 61.9l-72.2 72.2C322 108.5 288.7 96 248 96c-88.8 0-160.1 71.9-160.1 160.1s71.3 160.1 160.1 160.1c98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                )}
                Sign in with Google
            </Button>
            
            <AlertDialog open={!!newUser}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>One Last Step!</AlertDialogTitle>
                        <AlertDialogDescription>
                            Welcome, {newUser?.displayName}! To complete your registration, please tell us who you are.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className='sm:justify-center gap-4 pt-4'>
                        <Button onClick={() => handleRoleSelection('student')} disabled={isLoading} className='w-full sm:w-auto'>
                            {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            I'm a Student
                        </Button>
                        <Button variant="secondary" onClick={() => handleRoleSelection('teacher')} disabled={isLoading} className='w-full sm:w-auto'>
                             {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            I'm a Teacher
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
