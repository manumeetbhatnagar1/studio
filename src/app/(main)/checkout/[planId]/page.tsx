'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditCard, IndianRupee, LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { add } from 'date-fns';
import { useEffect, useState } from 'react';

type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
};

const paymentSchema = z.object({
    nameOnCard: z.string().min(1, 'Name on card is required'),
    cardNumber: z.string().length(16, 'Card number must be 16 digits'),
    expiryDate: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Expiry date must be in MM/YY format'),
    cvc: z.string().length(3, 'CVC must be 3 digits'),
});

export default function CheckoutPage() {
    const { planId } = useParams() as { planId: string };
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const planDocRef = useMemoFirebase(() => {
        if (!firestore) return null;
        return doc(firestore, 'subscription_plans', planId);
    }, [firestore, planId]);

    const { data: plan, isLoading: isPlanLoading } = useDoc<SubscriptionPlan>(planDocRef);

    const form = useForm<z.infer<typeof paymentSchema>>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            nameOnCard: user?.displayName || '',
            cardNumber: '',
            expiryDate: '',
            cvc: '',
        }
    });

    useEffect(() => {
        if (user?.displayName) {
            form.setValue('nameOnCard', user.displayName);
        }
    }, [user, form]);
    
    async function onSubmit(values: z.infer<typeof paymentSchema>) {
        if (!user || !plan || !firestore) {
            toast({ variant: 'destructive', title: 'Error', description: 'User or plan not found.' });
            return;
        }

        setIsProcessing(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDocumentNonBlocking(userRef, {
                subscriptionPlanId: plan.id,
                subscriptionStatus: 'active',
            });
            
            const userSubscriptionRef = doc(firestore, 'users', user.uid, 'subscriptions', 'main');
            const now = new Date();
            const endDate = plan.billingInterval === 'monthly' ? add(now, { months: 1 }) : add(now, { years: 1 });
            
            await setDocumentNonBlocking(userSubscriptionRef, {
                id: 'main',
                planId: plan.id,
                status: 'active',
                currentPeriodStart: now.toISOString(),
                currentPeriodEnd: endDate.toISOString(),
            }, { merge: true });

            toast({ title: 'Payment Successful!', description: `You have successfully subscribed to the ${plan.name}.` });
            router.push('/dashboard');

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Payment Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsProcessing(false);
        }
    }

    if (isPlanLoading) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Checkout" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex justify-center">
                    <div className="w-full max-w-2xl space-y-6">
                        <Skeleton className="h-48 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                </main>
            </div>
        )
    }

    if (!plan) {
        return (
             <div className="flex flex-col h-full">
                <DashboardHeader title="Checkout" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex justify-center">
                    <Card className="w-full max-w-2xl">
                        <CardHeader>
                            <CardTitle>Plan Not Found</CardTitle>
                            <CardDescription>The subscription plan you selected could not be found.</CardDescription>
                        </CardHeader>
                    </Card>
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Checkout" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex justify-center">
                <div className="w-full max-w-2xl grid gap-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Order Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="flex justify-between items-center">
                            <div>
                                <p className="font-semibold text-lg">{plan.name}</p>
                                <p className="text-muted-foreground">{plan.billingInterval === 'monthly' ? 'Billed Monthly' : 'Billed Yearly'}</p>
                            </div>
                            <p className="text-2xl font-bold flex items-center"><IndianRupee className="h-6 w-6"/>{plan.price.toLocaleString()}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard /> Payment Details
                            </CardTitle>
                            <CardDescription>Enter your payment information to complete the subscription.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <FormField control={form.control} name="nameOnCard" render={({ field }) => (
                                        <FormItem><FormLabel>Name on Card</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="cardNumber" render={({ field }) => (
                                        <FormItem><FormLabel>Card Number</FormLabel><FormControl><Input placeholder="0000 0000 0000 0000" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="expiryDate" render={({ field }) => (
                                            <FormItem><FormLabel>Expiry (MM/YY)</FormLabel><FormControl><Input placeholder="MM/YY" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="cvc" render={({ field }) => (
                                            <FormItem><FormLabel>CVC</FormLabel><FormControl><Input placeholder="123" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <Button type="submit" size="lg" className="w-full" disabled={isProcessing}>
                                        {isProcessing ? <LoaderCircle className="mr-2 animate-spin" /> : <IndianRupee className="mr-2" />}
                                        Pay ₹{plan.price.toLocaleString()}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
