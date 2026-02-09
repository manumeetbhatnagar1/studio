'use client';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type BlockedEmail = {
    id: string; // The email is the ID
    blockedAt: { toDate: () => Date } | string;
    userId: string;
};

export default function BlockedEmailsPage() {
    const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [emailToUnblock, setEmailToUnblock] = useState<BlockedEmail | null>(null);
    const [emailToDelete, setEmailToDelete] = useState<BlockedEmail | null>(null);

    const blockedEmailsQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'blocked_emails'), orderBy('blockedAt', 'desc')) : null,
        [firestore]
    );

    const { data: blockedEmails, isLoading: areEmailsLoading } = useCollection<BlockedEmail>(blockedEmailsQuery);

    const handleUnblockRequest = (email: BlockedEmail) => {
        setEmailToUnblock(email);
    };

    const handleDeleteRequest = (email: BlockedEmail) => {
        setEmailToDelete(email);
    };
    
    const handleConfirmUnblock = async () => {
        if (!emailToUnblock || !firestore) return;
    
        try {
            const batch = writeBatch(firestore);

            const emailDocRef = doc(firestore, 'blocked_emails', emailToUnblock.id);
            batch.delete(emailDocRef);

            const userRef = doc(firestore, 'users', emailToUnblock.userId);
            batch.update(userRef, { status: 'active' });

            await batch.commit();

            toast({
                title: 'User Unblocked',
                description: `${emailToUnblock.id} has been unblocked and can now log in again.`,
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Unblock Failed', description: error.message });
        } finally {
            setEmailToUnblock(null);
        }
    };

    const handleConfirmDelete = async () => {
        if (!emailToDelete || !firestore) return;

        try {
            const batch = writeBatch(firestore);

            // Delete the main user document
            const userDocRef = doc(firestore, 'users', emailToDelete.userId);
            batch.delete(userDocRef);
            
            // Delete the blocklist entry
            const emailDocRef = doc(firestore, 'blocked_emails', emailToDelete.id);
            batch.delete(emailDocRef);

            await batch.commit();

            toast({
                title: 'User Permanently Deleted',
                description: `All data for ${emailToDelete.id} has been permanently removed.`,
            });
        } catch (error) {
            console.error("Permanent delete failed:", error);
            const description = error instanceof Error ? error.message : "An unknown error occurred.";
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description,
            });
        } finally {
            setEmailToDelete(null);
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
                        <CardDescription>This is a list of emails that are blocked. You can unblock them to restore access, or permanently delete all their data.</CardDescription>
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
                                    blockedEmails.map(email => {
                                        const blockedAtDate = typeof email.blockedAt === 'string'
                                            ? new Date(email.blockedAt)
                                            : (email.blockedAt as any).toDate();

                                        return (
                                            <TableRow key={email.id}>
                                                <TableCell className="font-medium">{email.id}</TableCell>
                                                <TableCell>{formatDistanceToNow(blockedAtDate, { addSuffix: true })}</TableCell>
                                                <TableCell className="text-right flex items-center justify-end gap-2">
                                                    <Button variant="default" size="sm" onClick={() => handleUnblockRequest(email)}>
                                                        Unblock User
                                                    </Button>
                                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteRequest(email)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Permanently Delete
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
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
                        <AlertDialogTitle>Unblock this user?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will unblock the user with email <span className="font-semibold text-foreground">{emailToUnblock?.id}</span>. They will be able to log in again, and their record will reappear in the User Management list.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmUnblock} className={cn(buttonVariants({ variant: 'default' }))}>
                            Yes, Unblock
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={!!emailToDelete} onOpenChange={(open) => !open && setEmailToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the user's main profile ({emailToDelete?.id}) and all associated data. The user will be gone forever.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>
                            Yes, Permanently Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
