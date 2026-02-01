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
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { updateProfile } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { LoaderCircle, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DashboardHeader from '@/components/dashboard-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const profileFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional(), // email is not editable
  examName: z.string().optional(), // exam is not editable
});

type UserProfile = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roleId: 'student' | 'teacher';
    photoURL?: string;
    examId?: string;
}

type Exam = {
    name: string;
}

export default function ProfilePage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const userDocRef = useMemoFirebase(() => {
      if (!user || !firestore) return null;
      return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const examDocRef = useMemoFirebase(() => {
    if (!userProfile?.examId || !firestore) return null;
    return doc(firestore, 'exams', userProfile.examId);
  }, [userProfile, firestore]);

  const { data: exam, isLoading: isExamLoading } = useDoc<Exam>(examDocRef);

  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      examName: '',
    },
  });

  useEffect(() => {
    if (userProfile) {
      form.reset({
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        email: userProfile.email,
        examName: exam?.name || 'Loading...'
      });
      if (userProfile.photoURL) {
        setImagePreview(userProfile.photoURL);
      }
    } else if (user?.photoURL) {
        setImagePreview(user.photoURL);
    }
  }, [userProfile, user, form, exam]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
  };


  async function onSubmit(values: z.infer<typeof profileFormSchema>) {
    if (!user || !userDocRef) return;

    setIsLoading(true);
    try {
      let newPhotoURL = user.photoURL; // Default to existing URL
      if (imageFile && imagePreview) {
        newPhotoURL = imagePreview; // Use the new base64 data URL
      }
      
      // Update Firebase Auth profile
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: `${values.firstName} ${values.lastName}`,
          photoURL: newPhotoURL
        });
      }

      // Update Firestore document
      const updatedData = {
        firstName: values.firstName,
        lastName: values.lastName,
        photoURL: newPhotoURL || ''
      };
      await updateDocumentNonBlocking(userDocRef, updatedData);

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated.',
      });
      setImageFile(null);
    } catch (error: any) {
      toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const showLoading = isUserLoading || isProfileLoading || isExamLoading;
  
  const getInitials = () => {
    if (userProfile) {
        return `${userProfile.firstName[0] || ''}${userProfile.lastName[0] || ''}`;
    }
    if (user?.displayName) {
        return user.displayName.split(' ').map(n => n[0]).join('');
    }
    return '';
  }


  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="My Profile" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex justify-center">
            <Card className="w-full max-w-2xl shadow-lg">
                <CardHeader>
                    <CardTitle className="font-headline text-2xl">Manage Your Profile</CardTitle>
                    <CardDescription>Update your personal information here.</CardDescription>
                </CardHeader>
                <CardContent>
                    {showLoading ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-6">
                                <Skeleton className="h-24 w-24 rounded-full" />
                                <div className="flex-1 space-y-2">
                                     <Skeleton className="h-4 w-24" />
                                     <Skeleton className="h-10 w-full" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-20" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            </div>
                             <div className="space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                             <div className="space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                            <Skeleton className="h-10 w-32" />
                        </div>
                    ) : (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormItem>
                                    <FormLabel>Profile Picture</FormLabel>
                                    <div className="flex items-center gap-6">
                                        <Avatar className="h-24 w-24">
                                            <AvatarImage src={imagePreview || undefined} />
                                            <AvatarFallback>
                                                {getInitials() || <UserIcon className="h-8 w-8" />}
                                            </AvatarFallback>
                                        </Avatar>
                                        <FormControl>
                                            <Input type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs" />
                                        </FormControl>
                                    </div>
                                    <FormMessage />
                                </FormItem>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                    control={form.control}
                                    name="firstName"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>First Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Anjali" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                    <FormField
                                    control={form.control}
                                    name="lastName"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Last Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Patel" {...field} />
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
                                        <Input placeholder="user@example.com" {...field} disabled />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <FormField
                                control={form.control}
                                name="examName"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Selected Exam</FormLabel>
                                    <FormControl>
                                        <Input {...field} disabled />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Changes
                                </Button>
                            </form>
                        </Form>
                    )}
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
