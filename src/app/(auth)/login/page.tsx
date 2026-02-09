
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
import { signInWithEmailAndPassword, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useState, useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { doc, getDoc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

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

export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [phoneIsLoading, setPhoneIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const [activeTab, setActiveTab] = useState('email');

  useEffect(() => {
    if (auth && activeTab === 'phone' && recaptchaContainerRef.current && !recaptchaVerifierRef.current) {
        // Clear the container in case there's a stale verifier
        recaptchaContainerRef.current.innerHTML = '';
        
        const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
          'size': 'invisible',
        });
        recaptchaVerifierRef.current = verifier;
        verifier.render().catch((error) => {
            toast({
                variant: "destructive",
                title: "reCAPTCHA Error",
                description: `Failed to render reCAPTCHA: ${error.message}`
            });
        });
    }

    return () => {
        // Cleanup the verifier when the component unmounts or tab changes
        if (recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current.clear();
            recaptchaVerifierRef.current = null;
        }
    };
  }, [auth, activeTab, toast]);

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
        const verifier = recaptchaVerifierRef.current;
        if (verifier) {
            const phoneNumber = `+91${values.phoneNumber}`;
            const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
            setConfirmationResult(confirmation);
            toast({
                title: "OTP Sent",
                description: `A verification code has been sent to ${phoneNumber}.`
            });
        } else {
            throw new Error("reCAPTCHA verifier not initialized. Please refresh the page or try again.");
        }
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Failed to send OTP",
            description: error.message,
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
        await confirmationResult.confirm(values.otp);
        toast({
            title: 'Login Successful'
        });
        router.push('/dashboard');
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
  
  async function handleGoogleSignIn() {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user exists in Firestore
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            // New user, create a document in Firestore
            const [firstName, ...lastName] = user.displayName?.split(' ') || ['User', ''];
            await setDocumentNonBlocking(userDocRef, {
                id: user.uid,
                firstName: firstName,
                lastName: lastName.join(' '),
                email: user.email,
                photoURL: user.photoURL,
                roleId: 'student', // Default role for new Google sign-ups
                phoneNumber: user.phoneNumber || ''
            }, { merge: false });
        }
        
        toast({
            title: 'Login Successful',
            description: `Welcome back, ${user.displayName}!`,
        });
        router.push('/dashboard');

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


  return (
    <Card className="w-full max-w-md">
        <div ref={recaptchaContainerRef}></div>
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
                <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 23.4 172.9 61.9l-72.2 72.2C322 108.5 288.7 96 248 96c-88.8 0-160.1 71.9-160.1 160.1s71.3 160.1 160.1 160.1c98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                Sign in with Google
            </Button>
            
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
    </Card>
  );
}
