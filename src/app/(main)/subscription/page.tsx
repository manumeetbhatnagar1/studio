'use client';

import { useState, useMemo, FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import DashboardHeader from "@/components/dashboard-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, PlusCircle, Edit, Trash2, LoaderCircle } from 'lucide-react';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Zod Schema & Types
const planSchema = z.object({
  name: z.string().min(3, 'Plan name must be at least 3 characters.'),
  price: z.coerce.number().min(0, 'Price must be a positive number.'),
  billingInterval: z.enum(['monthly', 'yearly']),
  examTypeId: z.string().min(1, 'You must select an exam type.'),
  features: z.string().min(10, 'Please list at least one feature (one per line).'),
});

type ExamType = { id: string; name: string; };
type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
  examTypeId: string;
  features: string[];
  isPopular?: boolean; // For styling
};

// PlanForm Component (for Create/Edit)
const PlanForm: FC<{
  examTypes: ExamType[];
  onFinished: () => void;
  planToEdit?: SubscriptionPlan;
}> = ({ examTypes, onFinished, planToEdit }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<z.infer<typeof planSchema>>({
        resolver: zodResolver(planSchema),
        defaultValues: planToEdit ? {
            ...planToEdit,
            features: planToEdit.features.join('\n'),
        } : {
            name: '',
            price: 0,
            billingInterval: 'yearly',
            examTypeId: '',
            features: '',
        },
    });

    async function onSubmit(values: z.infer<typeof planSchema>) {
        setIsSubmitting(true);
        const dataToSave = {
            ...values,
            features: values.features.split('\n').filter(f => f.trim() !== ''),
        };

        try {
            if (planToEdit) {
                const planRef = doc(firestore, 'subscription_plans', planToEdit.id);
                await updateDocumentNonBlocking(planRef, dataToSave);
                toast({ title: 'Plan Updated!', description: `"${values.name}" has been updated.` });
            } else {
                const plansRef = collection(firestore, 'subscription_plans');
                await addDocumentNonBlocking(plansRef, dataToSave);
                toast({ title: 'Plan Created!', description: `"${values.name}" has been added.` });
            }
            onFinished();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Operation Failed', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Plan Name</FormLabel><FormControl><Input placeholder="e.g., Excel Plan" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="examTypeId" render={({ field }) => (
                    <FormItem><FormLabel>Exam Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an exam type" /></SelectTrigger></FormControl><SelectContent>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                )} />
                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem><FormLabel>Price (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 18000" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="billingInterval" render={({ field }) => (
                        <FormItem><FormLabel>Billing Interval</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                 </div>
                 <FormField control={form.control} name="features" render={({ field }) => (
                    <FormItem><FormLabel>Features</FormLabel><FormDescription>Enter one feature per line.</FormDescription><FormControl><Textarea placeholder="Full access to Class 12 content\nAll Subjects: Physics, Chemistry, Maths..." {...field} rows={5}/></FormControl><FormMessage /></FormItem>
                )} />
                 <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <LoaderCircle className="mr-2 animate-spin" />}
                    {planToEdit ? 'Save Changes' : 'Create Plan'}
                </Button>
            </form>
        </Form>
    )
};

// Teacher View Component
const TeacherView: FC<{ plans: SubscriptionPlan[], examTypes: ExamType[] }> = ({ plans, examTypes }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [planToEdit, setPlanToEdit] = useState<SubscriptionPlan | null>(null);
    const [planToDelete, setPlanToDelete] = useState<SubscriptionPlan | null>(null);
    
    const examTypeMap = useMemo(() => examTypes.reduce((acc, et) => ({ ...acc, [et.id]: et.name }), {} as Record<string, string>), [examTypes]);
    const plansByExamType = useMemo(() => {
        return plans.reduce((acc, plan) => {
            const examTypeName = examTypeMap[plan.examTypeId] || 'Uncategorized';
            if (!acc[examTypeName]) acc[examTypeName] = [];
            acc[examTypeName].push(plan);
            return acc;
        }, {} as Record<string, SubscriptionPlan[]>);
    }, [plans, examTypeMap]);

    const handleDelete = async () => {
        if (!planToDelete) return;
        try {
            await deleteDocumentNonBlocking(doc(firestore, 'subscription_plans', planToDelete.id));
            toast({ title: 'Plan Deleted', description: `"${planToDelete.name}" has been deleted.`});
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
        } finally {
            setPlanToDelete(null);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="font-headline text-2xl font-semibold">Manage Subscription Plans</h2>
                 <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild><Button><PlusCircle className="mr-2"/>Add New Plan</Button></DialogTrigger>
                    <DialogContent><DialogHeader><DialogTitle>Add New Subscription Plan</DialogTitle></DialogHeader><PlanForm examTypes={examTypes} onFinished={() => setIsAddDialogOpen(false)} /></DialogContent>
                </Dialog>
            </div>

            {Object.keys(plansByExamType).length > 0 ? Object.entries(plansByExamType).map(([examTypeName, plans]) => (
                <div key={examTypeName}>
                    <h3 className="font-headline text-xl font-semibold mb-4 border-b pb-2">{examTypeName}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {plans.map(plan => (
                            <Card key={plan.id} className="flex flex-col">
                                <CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>₹{plan.price.toLocaleString()} / {plan.billingInterval}</CardDescription></CardHeader>
                                <CardContent className="flex-grow"><ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">{plan.features.map((f, i) => <li key={i}>{f}</li>)}</ul></CardContent>
                                <CardFooter className="flex justify-end gap-2 border-t pt-4 mt-4">
                                    <Button variant="ghost" onClick={() => setPlanToEdit(plan)}><Edit className="mr-2"/>Edit</Button>
                                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPlanToDelete(plan)}><Trash2 className="mr-2"/>Delete</Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </div>
            )) : <p className="text-muted-foreground text-center py-8">No subscription plans found. Add one to get started.</p>}

             <Dialog open={!!planToEdit} onOpenChange={(open) => !open && setPlanToEdit(null)}>
                <DialogContent><DialogHeader><DialogTitle>Edit Subscription Plan</DialogTitle></DialogHeader>{planToEdit && <PlanForm examTypes={examTypes} planToEdit={planToEdit} onFinished={() => setPlanToEdit(null)} />}</DialogContent>
            </Dialog>

            <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the "{planToDelete?.name}" plan. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// Student View Component
const StudentView: FC<{ plans: SubscriptionPlan[], examTypes: ExamType[] }> = ({ plans, examTypes }) => {
    const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');
    const [selectedExamType, setSelectedExamType] = useState<string>('all');

    const filteredPlans = useMemo(() => {
        return plans.filter(plan => 
            plan.billingInterval === billingInterval &&
            (selectedExamType === 'all' || plan.examTypeId === selectedExamType)
        );
    }, [plans, billingInterval, selectedExamType]);

    return (
        <div className="space-y-12">
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
                <h2 className="font-headline text-4xl font-semibold">Choose Your Path to Success</h2>
                <p className="mt-4 text-lg text-muted-foreground">Select the perfect plan designed for your goal and conquer the exams with DCAM Classes.</p>
                <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 mt-8">
                     <div className="flex items-center space-x-2">
                        <Label htmlFor="billing-toggle" className={billingInterval === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}>Monthly</Label>
                        <Switch id="billing-toggle" checked={billingInterval === 'yearly'} onCheckedChange={(checked) => setBillingInterval(checked ? 'yearly' : 'monthly')} />
                        <Label htmlFor="billing-toggle" className={billingInterval === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}>Yearly (Save 16%)</Label>
                    </div>
                     <Select value={selectedExamType} onValueChange={setSelectedExamType}>
                        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filter by Exam Type" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Exam Types</SelectItem>{examTypes.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>
            {filteredPlans.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {filteredPlans.map((plan) => (
                        <Card key={plan.id} className={`shadow-lg flex flex-col h-full ${plan.isPopular ? 'border-primary border-2 shadow-primary/20' : ''}`}>
                             {plan.isPopular && <div className="bg-primary text-primary-foreground text-sm font-semibold text-center py-1 rounded-t-lg">Most Popular</div>}
                             <CardHeader><CardTitle className="font-headline text-2xl">{plan.name}</CardTitle><CardDescription>{examTypes.find(et => et.id === plan.examTypeId)?.name}</CardDescription></CardHeader>
                             <CardContent className="space-y-6 flex-grow">
                                <div className="flex items-baseline gap-2"><span className="text-4xl font-bold">₹{plan.price.toLocaleString()}</span><span className="text-muted-foreground">/{billingInterval === 'monthly' ? 'month' : 'year'}</span></div>
                                <ul className="space-y-3 text-sm">{plan.features.map((feature, index) => (<li key={index} className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" /><span>{feature}</span></li>))}</ul>
                            </CardContent>
                             <CardFooter><Button className="w-full" variant={plan.isPopular ? 'default' : 'outline'}>Choose Plan</Button></CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center text-muted-foreground py-16">
                    <p className="font-semibold text-lg">No plans match your current filters.</p>
                    <p>Try a different billing interval or exam type.</p>
                </div>
            )}
             <p className="text-center text-xs text-muted-foreground mt-8">All subscriptions are managed securely. You can upgrade, downgrade, or cancel your plan at any time.</p>
        </div>
    )
}


// Main Page Component
export default function SubscriptionPage() {
  const firestore = useFirestore();
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();

  const plansQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'subscription_plans'), orderBy('price')) : null, [firestore]);
  const examTypesQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exam_types'), orderBy('name')) : null, [firestore]);
  
  const { data: plans, isLoading: arePlansLoading } = useCollection<SubscriptionPlan>(plansQuery);
  const { data: examTypes, isLoading: areExamTypesLoading } = useCollection<ExamType>(examTypesQuery);

  const isLoading = isTeacherLoading || arePlansLoading || areExamTypesLoading;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Subscription" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        {isLoading ? (
            <div className="space-y-8">
                <Skeleton className="h-24 w-full" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-80 w-full" />
                    <Skeleton className="h-80 w-full" />
                    <Skeleton className="h-80 w-full" />
                </div>
            </div>
        ) : isTeacher ? (
            <TeacherView plans={plans || []} examTypes={examTypes || []} />
        ) : (
            <StudentView plans={plans || []} examTypes={examTypes || []} />
        )}
      </main>
    </div>
  );
}

    