'use client';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useState } from 'react';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type BlockedEmail = {
    id: string; // The email is the ID
    blockedAt: { toDate: () => Date };
};

export default function BlockedEmailsPage() {
    const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [emailToUnblock, setEmailToUnblock] = useState<string | null>(null);

    const blockedEmailsQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'blocked_emails'), orderBy('blockedAt', 'desc')) : null,
        [firestore]
    );

    const { data: blockedEmails, isLoading: areEmailsLoading } = useCollection<BlockedEmail>(blockedEmailsQuery);

    const handleUnblockRequest = (email: string) => {
        setEmailToUnblock(email);
    };
    
    const handleConfirmUnblock = async () => {
        if (!emailToUnblock) return;
    
        try {
            const emailDocRef = doc(firestore, 'blocked_emails', emailToUnblock);
            await deleteDocumentNonBlocking(emailDocRef);
            
            toast({
                title: 'Email Unblocked',
                description: `${emailToUnblock} can now register for an account.`,
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Unblock Failed', description: error.message });
        } finally {
            setEmailToUnblock(null);
        }
    };

    if (isAdminLoading) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Blocked Emails" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                     <Card>
                        <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
                        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
                    </Card>
                </main>
            </div>
        )
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col h-full">
                <DashboardHeader title="Access Denied" />
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex items-center justify-center">
                    <Card className="w-full max-w-md text-center">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-center gap-2 text-destructive">
                                <AlertTriangle /> Access Denied
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>You do not have permission to view this page. Please contact an administrator if you believe this is an error.</p>
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <DashboardHeader title="Blocked Emails" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Blocked Email Addresses</CardTitle>
                        <CardDescription>This is a list of emails that are blocked from creating new accounts because their associated user was deleted.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email Address</TableHead>
                                    <TableHead>Blocked On</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {areEmailsLoading ? (
                                    [...Array(3)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-10 w-24 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : blockedEmails && blockedEmails.length > 0 ? (
                                    blockedEmails.map(email => (
                                        <TableRow key={email.id}>
                                            <TableCell className="font-medium">{email.id}</TableCell>
                                            <TableCell>{formatDistanceToNow(email.blockedAt.toDate(), { addSuffix: true })}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleUnblockRequest(email.id)}>
                                                    <Unlock className="mr-2 h-4 w-4" /> Unblock
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center h-24">No emails are currently blocked.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
             <AlertDialog open={!!emailToUnblock} onOpenChange={(open) => !open && setEmailToUnblock(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to unblock this email?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Unblocking <span className="font-semibold text-foreground">{emailToUnblock}</span> will allow a new user to register with this email address. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmUnblock}>
                            Unblock Email
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
