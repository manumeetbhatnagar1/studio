'use client';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch } from 'firebase/firestore';
import { useState, useMemo } from 'react';
import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { User, Shield, AlertTriangle, Trash2, LoaderCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';
import { add } from 'date-fns';

type UserProfile = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    roleId: 'student' | 'teacher' | 'admin';
    photoURL?: string;
    teacherStatus?: 'pending' | 'approved' | 'rejected';
    status?: 'active' | 'blocked';
    subscriptionPlanId?: string;
    subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
};

type SubscriptionPlan = {
  id: string;
  name: string;
  billingInterval: 'monthly' | 'yearly';
}

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

const SubscriptionStatusSelector = ({ user }: { user: UserProfile }) => {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusChange = async (newStatus: 'active' | 'canceled') => {
        setIsUpdating(true);
        try {
            const batch = writeBatch(firestore);
            
            const userRef = doc(firestore, 'users', user.id);
            batch.update(userRef, { subscriptionStatus: newStatus });

            // Also update the subcollection if it exists, creating it if necessary
            const userSubscriptionRef = doc(firestore, 'users', user.id, 'subscriptions', 'main');
            batch.set(userSubscriptionRef, { status: newStatus }, { merge: true });

            await batch.commit();

            toast({ title: 'Subscription Updated', description: `${user.firstName}'s subscription is now ${newStatus === 'active' ? 'Active' : 'Inactive'}.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } finally {
            setIsUpdating(false);
        }
    };
    
    if (user.roleId !== 'student' || !user.subscriptionPlanId) {
        return null;
    }

    const currentStatus = (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing') ? 'active' : 'canceled';

    return (
        <Select 
            value={currentStatus} 
            onValueChange={handleStatusChange} 
            disabled={isUpdating}
        >
            <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Set Status"/>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="canceled">Inactive</SelectItem>
            </SelectContent>
        </Select>
    );
};


export default function UserManagementPage() {
    const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [userToBlock, setUserToBlock] = useState<UserProfile | null>(null);
    const [isBlocking, setIsBlocking] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const usersQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'users'), orderBy('lastName')) : null,
        [firestore]
    );

    const { data: users, isLoading: areUsersLoading } = useCollection<UserProfile>(usersQuery);

    const plansQuery = useMemoFirebase(
        () => firestore ? query(collection(firestore, 'subscription_plans')) : null,
        [firestore]
    );
    const { data: plans, isLoading: arePlansLoading } = useCollection<SubscriptionPlan>(plansQuery);

    const planMap = useMemo(() => {
        if (!plans) return {};
        return plans.reduce((acc, plan) => {
            acc[plan.id] = plan.name;
            return acc;
        }, {} as Record<string, string>);
    }, [plans]);

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        return users.filter(user => 
            user.status !== 'blocked' &&
            user.email.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [users, searchQuery]);

    const PlanSelector = ({ user, plans }: { user: UserProfile, plans: SubscriptionPlan[] }) => {
        const firestore = useFirestore();
        const { toast } = useToast();
        const [isUpdating, setIsUpdating] = useState(false);
    
        const handlePlanChange = async (newPlanId: string) => {
            setIsUpdating(true);
            try {
                const userRef = doc(firestore, 'users', user.id);
                const userSubscriptionRef = doc(firestore, 'users', user.id, 'subscriptions', 'main');
                const batch = writeBatch(firestore);
    
                if (newPlanId === 'none') {
                    // Removing subscription
                    batch.update(userRef, {
                        subscriptionPlanId: null,
                        subscriptionStatus: 'canceled',
                    });
                    batch.delete(userSubscriptionRef);
                    toast({ title: 'Subscription Removed', description: `${user.firstName}'s subscription has been removed.` });
                } else {
                    // Adding or changing subscription
                    const newPlan = plans.find(p => p.id === newPlanId);
                    if (!newPlan) throw new Error("Selected plan not found.");
    
                    const now = new Date();
                    const endDate = newPlan.billingInterval === 'monthly' ? add(now, { months: 1 }) : add(now, { years: 1 });
    
                    batch.update(userRef, {
                        subscriptionPlanId: newPlanId,
                        subscriptionStatus: 'active',
                    });
                    batch.set(userSubscriptionRef, {
                        id: 'main',
                        planId: newPlanId,
                        status: 'active',
                        currentPeriodStart: now.toISOString(),
                        currentPeriodEnd: endDate.toISOString(),
                    }, { merge: true });
                    toast({ title: 'Subscription Updated', description: `${user.firstName} is now subscribed to ${newPlan.name}.` });
                }
                await batch.commit();
    
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
            } finally {
                setIsUpdating(false);
            }
        };
    
        return (
            <Select value={user.subscriptionPlanId || 'none'} onValueChange={handlePlanChange} disabled={isUpdating}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">No Plan</SelectItem>
                    <SelectSeparator />
                    {plans.map(plan => (
                        <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    };


    const handleBlockUser = async () => {
        if (!userToBlock) return;
    
        setIsBlocking(true);
        try {
            const batch = writeBatch(firestore);
            
            const blockedEmailRef = doc(firestore, "blocked_emails", userToBlock.email);
            batch.set(blockedEmailRef, { blockedAt: new Date(), userId: userToBlock.id });
    
            const userRef = doc(firestore, 'users', userToBlock.id);
            batch.update(userRef, { status: 'blocked' });
    
            const teacherRoleRef = doc(firestore, 'roles_teacher', userToBlock.id);
            batch.delete(teacherRoleRef);
            
            const adminRoleRef = doc(firestore, 'roles_admin', userToBlock.id);
            batch.delete(adminRoleRef);
            
            await batch.commit();
            
            toast({
                title: 'User Blocked',
                description: `${userToBlock.firstName} ${userToBlock.lastName} has been blocked and can be unblocked from the Blocked Emails page.`,
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Blocking Failed', description: error.message });
        } finally {
            setIsBlocking(false);
            setUserToBlock(null);
        }
    };

    const exportToExcel = (data: any[], fileName: string) => {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
    };

    const handleExportStudents = () => {
        if (!users || !plans) return;
        const studentData = users
            .filter(user => user.roleId === 'student')
            .map(({ id, firstName, lastName, email, phoneNumber, roleId, subscriptionPlanId, subscriptionStatus }) => ({ 
                id, 
                firstName, 
                lastName, 
                email, 
                phoneNumber, 
                roleId,
                subscriptionPlan: subscriptionPlanId ? (planMap[subscriptionPlanId] || 'N/A') : 'No Plan',
                subscriptionStatus: subscriptionStatus || 'none',
             }));
        exportToExcel(studentData, 'students_export');
    };

    const handleExportTeachers = () => {
        if (!users) return;
        const teacherData = users
            .filter(user => user.roleId === 'teacher' || user.roleId === 'admin')
            .map(({ id, firstName, lastName, email, phoneNumber, roleId, teacherStatus }) => ({ id, firstName, lastName, email, phoneNumber, roleId, teacherStatus }));
        exportToExcel(teacherData, 'teachers_export');
    };

    const isLoading = isAdminLoading || areUsersLoading || arePlansLoading;

    if (isLoading) {
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
                        <div className="flex justify-between items-center pt-4">
                            <Input
                                placeholder="Search by email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="max-w-sm"
                            />
                             <div className="flex gap-2">
                                <Button onClick={handleExportStudents} variant="outline" size="sm">Export Students</Button>
                                <Button onClick={handleExportTeachers} variant="outline" size="sm">Export Teachers</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Phone Number</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Subscription</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {areUsersLoading ? (
                                    [...Array(5)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-64" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-10 w-32 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredUsers && filteredUsers.length > 0 ? (
                                    filteredUsers.map(user => {
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
                                                <TableCell>{user.phoneNumber}</TableCell>
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
                                                <TableCell>
                                                    {user.roleId === 'student' ? (
                                                        user.subscriptionPlanId && planMap[user.subscriptionPlanId] ? (
                                                            <Badge variant={
                                                                user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing' ? 'default' : 'secondary'
                                                            }>
                                                                {planMap[user.subscriptionPlanId]}
                                                                {user.subscriptionStatus && ` - ${user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing' ? 'Active' : 'Inactive'}`}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline">No Plan</Badge>
                                                        )
                                                    ) : null}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end items-center gap-2">
                                                        {isPendingTeacher ? (
                                                            <TeacherApprovalActions user={user} />
                                                        ) : (
                                                            <>
                                                                {user.roleId === 'student' && <PlanSelector user={user} plans={plans || []} />}
                                                                {user.roleId === 'student' && <SubscriptionStatusSelector user={user} />}
                                                                <RoleSelector user={user} />
                                                            </>
                                                        )}
                                                        <Button variant="ghost" size="icon" onClick={() => setUserToBlock(user)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center h-24">No users found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
            <AlertDialog open={!!userToBlock} onOpenChange={() => setUserToBlock(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Block this user?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will block {userToBlock?.firstName} {userToBlock?.lastName} from accessing the application. Their data will be preserved, and you can unblock them from the "Blocked Emails" page.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBlockUser} disabled={isBlocking} className={cn(buttonVariants({ variant: 'destructive' }))}>
                            {isBlocking && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            Block User
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
