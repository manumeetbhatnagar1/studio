'use client';

import { useState, FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirestore, useCollection, addDocumentNonBlocking, deleteDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import DashboardHeader from '@/components/dashboard-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, LoaderCircle, Trash2, BookMarked, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// Zod schema
const examSchema = z.object({
  name: z.string().min(2, 'Exam name must be at least 2 characters.'),
  description: z.string().optional(),
});

// Data type
type Exam = { id: string; name: string; description?: string; };

// Add Exam Form
const AddExamForm: FC<{ onFormSubmit: () => void }> = ({ onFormSubmit }) => {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof examSchema>>({
    resolver: zodResolver(examSchema),
    defaultValues: { name: '', description: '' },
  });

  function onSubmit(values: z.infer<typeof examSchema>) {
    setIsSubmitting(true);
    const examsRef = collection(firestore, 'exams');
    addDocumentNonBlocking(examsRef, values).then(() => {
        toast({ title: 'Exam Added!', description: `"${values.name}" has been added.` });
        form.reset();
        onFormSubmit();
    }).catch((error) => {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }).finally(() => {
        setIsSubmitting(false);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Exam Name</FormLabel>
            <FormControl><Input placeholder="e.g., IIT JEE" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl><Textarea placeholder="A brief description of the exam" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
          Add Exam
        </Button>
      </form>
    </Form>
  );
};

export default function ExamsPage() {
  const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [formKey, setFormKey] = useState(0);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);

  const examsQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'exams'), orderBy('name')) : null, [firestore]);
  const { data: exams, isLoading: areExamsLoading } = useCollection<Exam>(examsQuery);
  
  const isLoading = isTeacherLoading || areExamsLoading;
  const onFormSubmit = () => setFormKey(prev => prev + 1);

  const handleDelete = (exam: Exam) => {
    setExamToDelete(exam);
  };
  
  const confirmDelete = () => {
    if (!examToDelete) return;
    const examRef = doc(firestore, 'exams', examToDelete.id);
    deleteDocumentNonBlocking(examRef).then(() => {
        toast({ title: 'Exam Deleted', description: `"${examToDelete.name}" has been removed.`});
        setExamToDelete(null);
    }).catch((error) => {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        setExamToDelete(null);
    });
  };

  if (isLoading) {
    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Manage Exams" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <Skeleton className="h-64 w-full" />
            </main>
        </div>
    );
  }

  if (!isTeacher) {
      return (
         <div className="flex flex-col h-full">
            <DashboardHeader title="Manage Exams" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                 <Card className="flex flex-col items-center justify-center text-center p-8 md:p-16 border-2 border-dashed rounded-lg h-full bg-destructive/10">
                    <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
                    <h2 className="font-headline text-2xl font-semibold text-destructive">Access Denied</h2>
                    <p className="text-destructive/80 mt-2 max-w-md">
                        You do not have permission to manage exams. This area is for teachers only.
                    </p>
                </Card>
            </main>
        </div>
      )
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Manage Exams" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 grid md:grid-cols-2 gap-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline text-xl"><PlusCircle />Add New Exam</CardTitle>
            <CardDescription>Add a new exam category to the platform, e.g., "NEET".</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : <AddExamForm key={`exam-form-${formKey}`} onFormSubmit={onFormSubmit} />}
          </CardContent>
        </Card>
        
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline text-xl"><BookMarked />Existing Exams</CardTitle>
                <CardDescription>The following exams are currently available on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : exams && exams.length > 0 ? (
                    <div className="space-y-2">
                        {exams.map(exam => (
                            <div key={exam.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                                <div>
                                    <p className="font-semibold">{exam.name}</p>
                                    {exam.description && <p className="text-sm text-muted-foreground">{exam.description}</p>}
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(exam)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No exams have been added yet.</p>
                )}
            </CardContent>
        </Card>

        <AlertDialog open={!!examToDelete} onOpenChange={() => setExamToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the "{examToDelete?.name}" exam category.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setExamToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete} className={cn(buttonVariants({ variant: "destructive" }))}>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
