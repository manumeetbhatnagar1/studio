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
import { signInWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber, updateProfile, type ConfirmationResult, type User } from 'firebase/auth';
import { useState, useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GoogleAuthHandler } from '@/components/auth/google-auth-handler';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const emailFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const phoneFormSchema = z.object({
    phoneNumber: z.string().min(10, 'Please enter a valid 10-digit phone number.').max(10, 'Please enter a valid 10-digit phone number.'),
});

const otpFormSchema = z.object({
    otp: z.string().length(6, 'OTP must be 6 digits.'),
});

type UserProfile = {
  id: string;
  roleId?: 'student' | 'teacher' | 'admin';
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
};

export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [phoneIsLoading, setPhoneIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('email');
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const [isRecaptchaReady, setIsRecaptchaReady] = useState(false);
  const [isRecaptchaSolved, setIsRecaptchaSolved] = useState(false);
  const [pendingPhoneUser, setPendingPhoneUser] = useState<User | null>(null);
  const [pendingPhoneE164, setPendingPhoneE164] = useState('');
  const [registrationDetails, setRegistrationDetails] = useState({
    firstName: '',
    lastName: '',
  });
  const [isFinalizingPhoneRegistration, setIsFinalizingPhoneRegistration] = useState(false);

  const resetRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
    setIsRecaptchaReady(false);
    setIsRecaptchaSolved(false);
    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = '';
    }
  };

  const initializeRecaptcha = async () => {
    if (!auth || !recaptchaContainerRef.current) {
      throw new Error('reCAPTCHA container is not ready.');
    }
    resetRecaptcha();
    const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
      size: 'normal',
      callback: () => setIsRecaptchaSolved(true),
      'expired-callback': () => setIsRecaptchaSolved(false),
    });
    recaptchaVerifierRef.current = verifier;
    await verifier.render();
    setIsRecaptchaReady(true);
    return verifier;
  };

  useEffect(() => {
    if (activeTab === 'phone') {
      initializeRecaptcha().catch((error) => {
        console.error('reCAPTCHA initialization failed:', error);
        toast({
          variant: 'destructive',
          title: 'reCAPTCHA Error',
          description: 'Could not initialize reCAPTCHA. Please refresh and try again.',
        });
      });
    } else {
      resetRecaptcha();
    }
  }, [activeTab, auth, toast]);

  useEffect(() => {
    return () => resetRecaptcha();
  }, []);

  const emailForm = useForm<z.infer<typeof emailFormSchema>>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onEmailSubmit(values: z.infer<typeof emailFormSchema>) {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast({
        title: 'Login Successful',
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const phoneForm = useForm<z.infer<typeof phoneFormSchema>>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: {
        phoneNumber: '',
    }
  });

  const otpForm = useForm<z.infer<typeof otpFormSchema>>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: {
        otp: '',
    }
  });

  async function onPhoneSubmit(values: z.infer<typeof phoneFormSchema>) {
    setPhoneIsLoading(true);
    try {
        if (!isRecaptchaReady || !recaptchaVerifierRef.current) {
          await initializeRecaptcha();
          throw new Error('Please complete reCAPTCHA first.');
        }
        if (!isRecaptchaSolved) {
          throw new Error('Please complete reCAPTCHA first.');
        }

        const verifier = recaptchaVerifierRef.current;
        const cleaned = values.phoneNumber.replace(/\D/g, '');
        if (cleaned.length !== 10) throw new Error('Please enter a valid 10-digit phone number.');
        const phoneNumber = `+91${cleaned}`;
        const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
        setConfirmationResult(confirmation);
        setPendingPhoneE164(phoneNumber);
        toast({
            title: "OTP Sent",
            description: `A verification code has been sent to ${phoneNumber}.`
        });
    } catch (error: any) {
        const code = error?.code as string | undefined;
        let description = error?.message || 'Could not send OTP.';
        if (code === 'auth/invalid-app-credential') {
          description = 'App verification failed. Please refresh reCAPTCHA and try again.';
          resetRecaptcha();
          await initializeRecaptcha().catch(() => undefined);
        } else if (code === 'auth/too-many-requests') {
          description = 'Too many attempts. Please wait a few minutes and try again.';
          resetRecaptcha();
          await initializeRecaptcha().catch(() => undefined);
        } else if (code === 'auth/captcha-check-failed') {
          description = 'reCAPTCHA verification failed. Please retry.';
          resetRecaptcha();
          await initializeRecaptcha().catch(() => undefined);
        } else if (code === 'auth/code-expired' || `${description}`.toLowerCase().includes('timeout')) {
          description = 'Verification timed out. Please solve reCAPTCHA again and retry.';
          resetRecaptcha();
          await initializeRecaptcha().catch(() => undefined);
        }
        toast({
            variant: "destructive",
            title: "Failed to send OTP",
            description,
        });
    } finally {
        setPhoneIsLoading(false);
    }
  }

  async function onOtpSubmit(values: z.infer<typeof otpFormSchema>) {
    if (!confirmationResult) {
        toast({ variant: 'destructive', title: 'Verification Error', description: 'Please request an OTP first.' });
        return;
    }
    setPhoneIsLoading(true);
    try {
        const credential = await confirmationResult.confirm(values.otp);
        const currentUser = credential.user;
        const userDocRef = doc(firestore, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as UserProfile;
          if (profile?.roleId) {
            toast({ title: 'Login Successful' });
            router.push('/dashboard');
            return;
          }
        }

        const inferredNameParts = (currentUser.displayName || '').trim().split(/\s+/).filter(Boolean);
        setRegistrationDetails({
          firstName: inferredNameParts[0] || '',
          lastName: inferredNameParts.slice(1).join(' '),
        });
        setPendingPhoneUser(currentUser);
        toast({
          title: 'Phone verified',
          description: 'Complete your account as Student or Teacher to continue.',
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Login Failed',
            description: 'The OTP is invalid or has expired. Please try again.',
        });
    } finally {
        setPhoneIsLoading(false);
    }
  }

  async function finalizePhoneRegistration(role: 'student' | 'teacher') {
    if (!pendingPhoneUser) return;
    const firstName = registrationDetails.firstName.trim();
    const lastName = registrationDetails.lastName.trim();

    if (!firstName || !lastName) {
      toast({
        variant: 'destructive',
        title: 'Name required',
        description: 'Please enter both first name and last name.',
      });
      return;
    }

    setIsFinalizingPhoneRegistration(true);
    try {
      const userRef = doc(firestore, 'users', pendingPhoneUser.uid);
      const batch = writeBatch(firestore);

      const userData: any = {
        id: pendingPhoneUser.uid,
        firstName,
        lastName,
        email: pendingPhoneUser.email || '',
        phoneNumber: pendingPhoneE164 || pendingPhoneUser.phoneNumber || '',
        roleId: role,
        status: 'active',
        photoURL: pendingPhoneUser.photoURL || '',
      };

      if (role === 'teacher') {
        userData.teacherStatus = 'pending';
      }

      if ((pendingPhoneUser.email || '').toLowerCase() === 'manumeet.bhatnagar1@gmail.com') {
        userData.roleId = 'admin';
        userData.teacherStatus = 'approved';
        const adminRoleRef = doc(firestore, 'roles_admin', pendingPhoneUser.uid);
        const teacherRoleRef = doc(firestore, 'roles_teacher', pendingPhoneUser.uid);
        batch.set(adminRoleRef, { createdAt: new Date().toISOString() }, { merge: true });
        batch.set(teacherRoleRef, { createdAt: new Date().toISOString() }, { merge: true });
      }

      batch.set(userRef, userData, { merge: true });
      await batch.commit();

      await updateProfile(pendingPhoneUser, {
        displayName: `${firstName} ${lastName}`.trim(),
      });

      setPendingPhoneUser(null);
      setConfirmationResult(null);
      otpForm.reset();
      phoneForm.reset();
      toast({
        title: 'Account created',
        description: `Your ${userData.roleId} account is ready.`,
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Registration failed',
        description: error.message || 'Could not complete account creation.',
      });
    } finally {
      setIsFinalizingPhoneRegistration(false);
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
            <CardTitle className="text-2xl">Log In</CardTitle>
            <CardDescription>Enter your credentials to access your account.</CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="email" className="w-full" onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="phone">Phone</TabsTrigger>
                </TabsList>
                <TabsContent value="email">
                    <Form {...emailForm}>
                    <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4 pt-4">
                        <FormField
                        control={emailForm.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input placeholder="user@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                          control={emailForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Password</FormLabel>
                                <Link
                                  href="/forgot-password"
                                  className="text-sm font-medium text-primary hover:underline"
                                >
                                  Forgot Password?
                                </Link>
                              </div>
                              <FormControl>
                                <Input type="password" placeholder="********" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            Log In
                        </Button>
                    </form>
                    </Form>
                </TabsContent>
                <TabsContent value="phone">
                {!confirmationResult ? (
                     <Form {...phoneForm}>
                        <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4 pt-4">
                            <FormField
                                control={phoneForm.control}
                                name="phoneNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone Number</FormLabel>
                                        <div className="flex items-center">
                                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-background text-sm text-muted-foreground">+91</span>
                                            <Input type="tel" placeholder="9876543210" {...field} className="rounded-l-none" />
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full" disabled={phoneIsLoading}>
                                {phoneIsLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Send OTP
                            </Button>
                            <div className="min-h-[78px]">
                              <div ref={recaptchaContainerRef}></div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Complete reCAPTCHA above, then click Send OTP.
                            </p>
                        </form>
                    </Form>
                ) : (
                    <div>
                        <div className="text-center text-sm text-muted-foreground mb-4 pt-4">
                             <p>
                                Enter the code sent to +91 {phoneForm.getValues('phoneNumber')}.
                            </p>
                            <Button
                                type="button"
                                variant="link"
                                className="p-0 h-auto font-medium"
                                onClick={() => setConfirmationResult(null)}
                            >
                                Change number?
                            </Button>
                        </div>

                        <Form {...otpForm}>
                            <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                                <FormField
                                    control={otpForm.control}
                                    name="otp"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Verification Code</FormLabel>
                                            <FormControl>
                                                <Input type="tel" placeholder="Enter 6-digit OTP" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" className="w-full" disabled={phoneIsLoading}>
                                    {phoneIsLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Verify & Log In
                                </Button>
                            </form>
                        </Form>
                    </div>
                )}
                </TabsContent>
            </Tabs>

            <GoogleAuthHandler />
            
            <div className="mt-4 text-center text-sm text-muted-foreground">
                <p>
                    Don&apos;t have an account?
                </p>
                <div className="flex justify-center gap-4 mt-2">
                    <Link href="/student-registration" className="font-medium text-primary hover:underline">
                        Register as Student
                    </Link>
                    <Link href="/teacher-registration" className="font-medium text-primary hover:underline">
                        Register as Teacher
                    </Link>
                </div>
            </div>
        </CardContent>
        <AlertDialog open={!!pendingPhoneUser}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Complete Account Creation</AlertDialogTitle>
              <AlertDialogDescription>
                This phone number is new. Choose Student or Teacher to finish registration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <FormLabel>First Name</FormLabel>
                <Input
                  value={registrationDetails.firstName}
                  onChange={(e) => setRegistrationDetails((prev) => ({ ...prev, firstName: e.target.value }))}
                  placeholder="First name"
                  disabled={isFinalizingPhoneRegistration}
                />
              </div>
              <div className="space-y-1">
                <FormLabel>Last Name</FormLabel>
                <Input
                  value={registrationDetails.lastName}
                  onChange={(e) => setRegistrationDetails((prev) => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Last name"
                  disabled={isFinalizingPhoneRegistration}
                />
              </div>
            </div>
            <AlertDialogFooter className="sm:justify-center gap-3">
              <Button
                onClick={() => finalizePhoneRegistration('student')}
                disabled={isFinalizingPhoneRegistration}
                className="w-full sm:w-auto"
              >
                {isFinalizingPhoneRegistration ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                Register as Student
              </Button>
              <Button
                variant="secondary"
                onClick={() => finalizePhoneRegistration('teacher')}
                disabled={isFinalizingPhoneRegistration}
                className="w-full sm:w-auto"
              >
                {isFinalizingPhoneRegistration ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                Register as Teacher
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </Card>
  );
}
