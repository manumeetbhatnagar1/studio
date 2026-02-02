'use client';
import { useState, useMemo, FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import DashboardHeader from '@/components/dashboard-header';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, where, orderBy, doc, setDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { format, addYears } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Users, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Student = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
    subscriptionPlanId?: string;
};

type SubscriptionPlan = {
    id: string;
    name: string;
    price: number;
    billingInterval: 'monthly' | 'yearly';
};

const subscriptionSchema = z.object({
    planId: z.string().min(1, { message: 'Please select a subscription plan.' }),
    status: z.enum(['active', 'canceled', 'past_due', 'trialing']),
    currentPeriodEnd: z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Invalid date' }),
});

const ManageSubscriptionForm: FC<{
    student: Student;
    plans: SubscriptionPlan[];
    onFinished: () => void;
}> = ({ student, plans, onFinished }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof subscriptionSchema>>({
        resolver: zodResolver(subscriptionSchema),
        defaultValues: {
            planId: student.subscriptionPlanId || '',
            status: student.subscriptionStatus || 'canceled',
            currentPeriodEnd: format(addYears(new Date(), 1), 'yyyy-MM-dd'),
        },
    });

    async function onSubmit(values: z.infer<typeof subscriptionSchema>) {
        setIsSubmitting(true);
        try {
            const userRef = doc(firestore, 'users', student.id);
            await updateDocumentNonBlocking(userRef, {
                subscriptionPlanId: values.planId,
                subscriptionStatus: values.status,
            });
            
            const subscriptionRef = doc(firestore, 'users', student.id, 'subscriptions', 'current');
            await setDoc(subscriptionRef, {
                planId: values.planId,
                status: values.status,
                currentPeriodEnd: new Date(values.currentPeriodEnd),
                currentPeriodStart: new Date(), 
            }, { merge: true });


            toast({
                title: 'Subscription Updated',
                description: `${student.firstName}'s subscription has been updated.`,
            });
            onFinished();
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: error.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="planId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Subscription Plan</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a plan" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {plans.map(plan => (
                                        <SelectItem key={plan.id} value={plan.id}>
                                            {plan.name} (₹{plan.price}/{plan.billingInterval})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Subscription Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a status" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="trialing">Trialing</SelectItem>
                                    <SelectItem value="past_due">Past Due</SelectItem>
                                    <SelectItem value="canceled">Canceled</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="currentPeriodEnd"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Subscription End Date</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex justify-end gap-2">
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <LoaderCircle className="animate-spin mr-2" />}
                        Save Changes
                    </Button>
                </div>
            </form>
        </Form>
    );
};

export default function StudentManagementPage() {
    const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
    const firestore = useFirestore();
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);

    const studentsQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'users'), where('roleId', '==', 'student'), orderBy('lastName')) : null,
        [firestore]
    );
    const plansQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'subscription_plans'), orderBy('price')) : null,
        [firestore]
    );

    const { data: students, isLoading: areStudentsLoading, error: studentsError } = useCollection<Student>(studentsQuery);
    const { data: plans, isLoading: arePlansLoading } = useCollection<SubscriptionPlan>(plansQuery);
    const [dialogOpenStates, setDialogOpenStates] = useState<Record<string, boolean>>({});

    const planMap = useMemo(() => {
        if (!plans) return {};
        return plans.reduce((acc, plan) => ({ ...acc, [plan.id]: plan.name }), {} as Record<string, string>);
    }, [plans]);

    useEffect(() => {
        setIsClient(true);
        if (!isTeacherLoading && !isTeacher) {
            router.push('/dashboard');
        }
    }, [isTeacher, isTeacherLoading, router]);

    const isLoading = isTeacherLoading || areStudentsLoading || arePlansLoading || !isClient;
    
    if (isLoading) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Student Management" />
                <main className="flex-1 p-4 md:p-6 lg:p-8"><Skeleton className="h-96 w-full" /></main>
            </div>
        );
    }
    
    if (!isTeacher) {
        return null;
    }

    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Student Management" />
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-headline text-2xl"><Users /> Students</CardTitle>
                        <CardDescription>View and manage all student subscriptions.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {studentsError && <p className="text-destructive">Error loading students: {studentsError.message}</p>}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Plan</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students && students.map(student => (
                                    <TableRow key={student.id}>
                                        <TableCell>{student.firstName} {student.lastName}</TableCell>
                                        <TableCell>{student.email}</TableCell>
                                        <TableCell>{student.subscriptionPlanId ? planMap[student.subscriptionPlanId] : 'N/A'}</TableCell>
                                        <TableCell>
                                            <Badge variant={student.subscriptionStatus === 'active' ? 'default' : student.subscriptionStatus === 'past_due' ? 'destructive' : 'secondary'}>
                                                {student.subscriptionStatus || 'N/A'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Dialog open={dialogOpenStates[student.id] || false} onOpenChange={(open) => setDialogOpenStates(s => ({ ...s, [student.id]: open }))}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="sm"><Edit className="mr-2 h-4 w-4"/>Manage</Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Manage Subscription for {student.firstName} {student.lastName}</DialogTitle>
                                                    </DialogHeader>
                                                    <ManageSubscriptionForm 
                                                        student={student} 
                                                        plans={plans || []} 
                                                        onFinished={() => setDialogOpenStates(s => ({ ...s, [student.id]: false }))} 
                                                    />
                                                </DialogContent>
                                            </Dialog>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                         {students && students.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">No students found.</div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
