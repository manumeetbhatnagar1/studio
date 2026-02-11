'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/icons';
import { GoogleAuthHandler } from '@/components/auth/google-auth-handler';

const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().min(10, 'A valid phone number is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function TeacherRegistrationPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: `${values.firstName} ${values.lastName}`
      });

      const batch = writeBatch(firestore);

      const userRef = doc(firestore, 'users', user.uid);
      const userData: any = {
        id: user.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneNumber: values.phoneNumber,
        roleId: 'teacher',
        teacherStatus: 'pending',
        status: 'active',
      };
      
      // Check if the registering user is the designated admin
      if (values.email.toLowerCase() === 'dcamclassesiit@gmail.com') {
          const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
          const teacherRoleRef = doc(firestore, 'roles_teacher', user.uid);
          batch.set(adminRoleRef, { createdAt: new Date().toISOString() });
          batch.set(teacherRoleRef, { createdAt: new Date().toISOString() });
          // Also update the user's roleId to 'admin' and status to 'approved'
          userData.roleId = 'admin';
          userData.teacherStatus = 'approved';
      }
      
      batch.set(userRef, userData);
      await batch.commit();
      
      toast({
        title: 'Registration Submitted',
        description: 'Your teacher account is pending approval from an administrator.',
      });
      router.push('/dashboard');
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use' && values.email.toLowerCase() === 'dcamclassesiit@gmail.com') {
            try {
                const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
                const user = userCredential.user;

                const batch = writeBatch(firestore);
                const userRef = doc(firestore, 'users', user.uid);
                const teacherRoleRef = doc(firestore, 'roles_teacher', user.uid);
                const adminRoleRef = doc(firestore, 'roles_admin', user.uid);

                batch.update(userRef, { roleId: 'admin', teacherStatus: 'approved' });
                batch.set(teacherRoleRef, { createdAt: new Date().toISOString() }, { merge: true });
                batch.set(adminRoleRef, { createdAt: new Date().toISOString() }, { merge: true });
                
                await batch.commit();

                toast({
                    title: 'Admin Account Upgraded',
                    description: 'Your existing account has been upgraded to an admin account.',
                });
                router.push('/dashboard');
            } catch (signInError: any) {
                toast({
                    variant: 'destructive',
                    title: 'Upgrade Failed',
                    description: "We found your account, but couldn't sign you in to upgrade it. Please check your password.",
                });
            }
        } else {
            toast({
                variant: 'destructive',
                title: 'Registration Failed',
                description: error.message,
            });
        }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
        <CardHeader className="text-center">
            <Link href="/dashboard" className="flex items-center gap-2 justify-center mb-4">
              <Logo className="w-8 h-8 text-primary" />
              <span className="font-headline text-2xl font-semibold text-primary">
                DCAM Classes
              </span>
            </Link>
            <CardTitle className="text-2xl">Teacher Registration</CardTitle>
            <CardDescription>Create your teacher account to get started.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="flex gap-4">
                    <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                            <Input placeholder="Rohan" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                            <Input placeholder="Sharma" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                        <Input placeholder="teacher@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g. 9876543210" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                        <Input type="password" placeholder="********" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
                </Button>
            </form>
            </Form>

            <GoogleAuthHandler />

            <div className="mt-4 text-center text-sm text-muted-foreground space-y-2">
                <p>
                    Already have an account?{' '}
                    <Link href="/login" className="font-medium text-primary hover:underline">
                        Log in
                    </Link>
                </p>
                <p>
                    Are you a student?{' '}
                    <Link href="/student-registration" className="font-medium text-primary hover:underline">
                        Register here
                    </Link>
                </p>
            </div>
        </CardContent>
    </Card>
  );
}
