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
import { User, Shield, AlertTriangle } from 'lucide-react';
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';

type UserProfile = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roleId: 'student' | 'teacher' | 'admin';
    photoURL?: string;
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

            batch.update(userRef, { roleId: newRole });

            if (newRole === 'student') {
                batch.delete(teacherRoleRef);
                batch.delete(adminRoleRef);
            } else if (newRole === 'teacher') {
                batch.set(teacherRoleRef, { createdAt: new Date().toISOString() });
                batch.delete(adminRoleRef);
            } else if (newRole === 'admin') {
                batch.delete(teacherRoleRef);
                batch.set(adminRoleRef, { createdAt: new Date().toISOString() });
            }
            
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

    const usersQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'users'), orderBy('lastName')) : null,
        [firestore]
    );

    const { data: users, isLoading: areUsersLoading } = useCollection<UserProfile>(usersQuery);

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
                                    <TableHead>Current Role</TableHead>
                                    <TableHead className="text-right">Change Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {areUsersLoading ? (
                                    [...Array(5)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-64" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-10 w-32 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : users && users.length > 0 ? (
                                    users.map(user => (
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
                                            <TableCell className="text-right">
                                                <RoleSelector user={user} />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24">No users found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
