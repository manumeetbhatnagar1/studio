'use client';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { User, Shield, AlertTriangle, Trash2, LoaderCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type UserProfile = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roleId: 'student' | 'teacher' | 'admin';
    photoURL?: string;
    teacherStatus?: 'pending' | 'approved' | 'rejected';
};

const TeacherApprovalActions = ({ user }: { user: UserProfile }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleApprove = async () => {
        setIsProcessing(true);
        try {
            const batch = writeBatch(firestore);
            const userRef = doc(firestore, 'users', user.id);
            const teacherRoleRef = doc(firestore, 'roles_teacher', user.id);
            
            batch.update(userRef, { teacherStatus: 'approved' });
            batch.set(teacherRoleRef, { createdAt: new Date().toISOString() });
            
            await batch.commit();
            toast({ title: 'Teacher Approved', description: `${user.firstName} is now a teacher.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Approval Failed', description: error.message });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        setIsProcessing(true);
        try {
            const userRef = doc(firestore, 'users', user.id);
            const batch = writeBatch(firestore);
            batch.update(userRef, { teacherStatus: 'rejected' });
            await batch.commit();
            toast({ title: 'Teacher Rejected', description: `${user.firstName}'s request has been rejected.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Rejection Failed', description: error.message });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Button size="sm" onClick={handleApprove} disabled={isProcessing}>Approve</Button>
            <Button size="sm" variant="destructive" onClick={handleReject} disabled={isProcessing}>Reject</Button>
        </div>
    );
};


const RoleSelector = ({ user }: { user: UserProfile }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [currentRole, setCurrentRole] = useState(user.roleId);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleRoleChange = async (newRole: 'student' | 'teacher' | 'admin') => {
        setIsUpdating(true);
        try {
            const batch = writeBatch(firestore);
            const userRef = doc(firestore, 'users', user.id);
            const teacherRoleRef = doc(firestore, 'roles_teacher', user.id);
            const adminRoleRef = doc(firestore, 'roles_admin', user.id);

            const roleUpdate: {roleId: string, teacherStatus?: string} = { roleId: newRole };

            if (newRole === 'student') {
                batch.delete(teacherRoleRef);
                batch.delete(adminRoleRef);
            } else if (newRole === 'teacher') {
                roleUpdate.teacherStatus = 'approved';
                batch.set(teacherRoleRef, { createdAt: new Date().toISOString() });
                batch.delete(adminRoleRef);
            } else if (newRole === 'admin') {
                batch.set(adminRoleRef, { createdAt: new Date().toISOString() });
            }
            
            batch.update(userRef, roleUpdate);
            await batch.commit();
            
            setCurrentRole(newRole);
            toast({ title: 'Role Updated', description: `${user.firstName}'s role is now ${newRole}.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } finally {
            setIsUpdating(false);
        }
    };
    
    return (
        <Select value={currentRole} onValueChange={handleRoleChange} disabled={isUpdating}>
            <SelectTrigger className="w-[120px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
        </Select>
    )
}

export default function UserManagementPage() {
    const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const usersQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'users'), orderBy('lastName')) : null,
        [firestore]
    );

    const { data: users, isLoading: areUsersLoading } = useCollection<UserProfile>(usersQuery);

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
    
        setIsDeleting(true);
        try {
            const batch = writeBatch(firestore);
            
            const blockedEmailRef = doc(firestore, "blocked_emails", userToDelete.email);
            batch.set(blockedEmailRef, { blockedAt: new Date().toISOString() });
    
            const userRef = doc(firestore, 'users', userToDelete.id);
            batch.delete(userRef);
    
            const teacherRoleRef = doc(firestore, 'roles_teacher', userToDelete.id);
            batch.delete(teacherRoleRef);
            
            const adminRoleRef = doc(firestore, 'roles_admin', userToDelete.id);
            batch.delete(adminRoleRef);
            
            await batch.commit();
            
            toast({
                title: 'User Deleted',
                description: `${userToDelete.firstName} ${userToDelete.lastName} has been deleted and blocked.`,
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: error.message });
        } finally {
            setIsDeleting(false);
            setUserToDelete(null);
        }
    };


    if (isAdminLoading) {
        return <div className="p-8"><Skeleton className="h-48 w-full" /></div>
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
            <DashboardHeader title="User Management" />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <CardTitle>All Users</CardTitle>
                        <CardDescription>View and manage roles for all users in the system.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {areUsersLoading ? (
                                    [...Array(5)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-64" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-10 w-32 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : users && users.length > 0 ? (
                                    users.map(user => {
                                        const isPendingTeacher = user.roleId === 'teacher' && user.teacherStatus === 'pending';
                                        return (
                                            <TableRow key={user.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar>
                                                            <AvatarImage src={user.photoURL} />
                                                            <AvatarFallback>
                                                                {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="font-medium">{user.firstName} {user.lastName}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{user.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant={user.roleId === 'admin' ? 'destructive' : user.roleId === 'teacher' ? 'secondary' : 'outline'}>
                                                        {user.roleId}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {user.roleId === 'teacher' && user.teacherStatus && (
                                                         <Badge variant={
                                                            user.teacherStatus === 'pending' ? 'secondary' :
                                                            user.teacherStatus === 'approved' ? 'default' :
                                                            user.teacherStatus === 'rejected' ? 'destructive' : 'outline'
                                                        }>
                                                            {user.teacherStatus}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end items-center gap-2">
                                                        {isPendingTeacher ? (
                                                            <TeacherApprovalActions user={user} />
                                                        ) : (
                                                            <RoleSelector user={user} />
                                                        )}
                                                        <Button variant="ghost" size="icon" onClick={() => setUserToDelete(user)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24">No users found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
            <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete {userToDelete?.firstName} {userToDelete?.lastName}'s data from the app and block them from registering again with the same email. This action cannot be undone.
                            <br/><br/>
                            <span className="font-semibold text-destructive">Note:</span> This does not delete their authentication record. Sub-collection data like test results will be orphaned but inaccessible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting} className={cn(buttonVariants({ variant: 'destructive' }))}>
                            {isDeleting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            Delete User
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
