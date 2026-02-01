'use client';

import { useEffect, useMemo, useRef, FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatRelative } from 'date-fns';
import { useParams } from 'next/navigation';
import type { Timestamp } from 'firebase/firestore';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Zod schema for the chat message form
const chatMessageSchema = z.object({
  text: z.string().min(1, 'Message cannot be empty.').max(500, 'Message is too long.'),
});

// Type for a chat message document
type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text: string;
  createdAt: Timestamp;
};

type UserProfile = {
  firstName: string;
  lastName: string;
}

// Component for a single message
function Message({ message, isOwnMessage }: { message: ChatMessage; isOwnMessage: boolean }) {
  return (
    <div className={cn('flex items-start gap-3', isOwnMessage && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8">
        <AvatarImage src={message.senderPhotoUrl} />
        <AvatarFallback>{message.senderName?.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className={cn('flex flex-col gap-1', isOwnMessage && 'items-end')}>
        <div className={cn('rounded-lg px-3 py-2', isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
          <p className="text-sm">{message.text}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{isOwnMessage ? 'You' : message.senderName}</span>
          <span>{message.createdAt ? formatRelative(message.createdAt.toDate(), new Date()) : 'sending...'}</span>
        </div>
      </div>
    </div>
  );
}

const DirectChatPageHeader: FC<{ otherUserId: string | undefined }> = ({ otherUserId }) => {
    const firestore = useFirestore();
    const userDocRef = useMemoFirebase(() => {
        if (!otherUserId || !firestore) return null;
        return doc(firestore, 'users', otherUserId);
    }, [otherUserId, firestore]);

    const { data: userProfile, isLoading } = useDoc<UserProfile>(userDocRef);

    return (
        <div className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
            <Button variant="ghost" size="icon" asChild>
                <Link href="/chat"><ArrowLeft /></Link>
            </Button>
            {isLoading ? (
                <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                </div>
            ) : userProfile ? (
                 <div className="flex items-center gap-3">
                     <Avatar className="h-9 w-9"><AvatarFallback>{userProfile.firstName?.charAt(0)}{userProfile.lastName?.charAt(0)}</AvatarFallback></Avatar>
                    <h1 className="font-semibold text-lg">{userProfile.firstName} {userProfile.lastName}</h1>
                 </div>
            ) : (
                <h1 className="font-semibold text-lg">Direct Message</h1>
            )}
        </div>
    );
};


export default function DirectChatPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const params = useParams();
  const chatId = params.chatId as string;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof chatMessageSchema>>({
    resolver: zodResolver(chatMessageSchema),
    defaultValues: { text: '' },
  });
  
  const otherUserId = useMemo(() => {
      if (!chatId || !user) return undefined;
      return chatId.split('_').find(id => id !== user.uid);
  }, [chatId, user]);

  const messagesQuery = useMemoFirebase(
    () => (firestore && chatId ? query(collection(firestore, 'direct_messages', chatId, 'messages'), orderBy('createdAt', 'asc')) : null),
    [firestore, chatId]
  );
  
  const { data: messages, isLoading } = useCollection<ChatMessage>(messagesQuery);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function onSubmit(values: z.infer<typeof chatMessageSchema>) {
    if (!user || !firestore || !chatId) return;

    try {
      const messagesRef = collection(firestore, 'direct_messages', chatId, 'messages');
      await addDocumentNonBlocking(messagesRef, {
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhotoUrl: user.photoURL || '',
        text: values.text,
        createdAt: serverTimestamp(),
      });
      form.reset();
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to send message',
            description: error.message || 'An error occurred while sending your message.',
        });
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <DirectChatPageHeader otherUserId={otherUserId} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-4 max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
            </div>
          ) : messages && messages.length > 0 ? (
            messages.map(msg => <Message key={msg.id} message={msg} isOwnMessage={msg.senderId === user?.uid} />)
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground pt-16">
              <p>This is the beginning of your conversation.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="sticky bottom-0 bg-background border-t p-4">
        <div className="max-w-4xl mx-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="Type a message..." autoComplete="off" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting}>
                <Send className="h-4 w-4" /><span className="sr-only">Send</span>
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
