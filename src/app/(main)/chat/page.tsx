'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { formatRelative } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';
import { useUser, useFirestore, useCollection, useMemoFirebase, useStorage } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, where, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { LoaderCircle, MessagesSquare, Send, User as UserIcon, MessageCircle, Paperclip, X, Download } from 'lucide-react';
import DashboardHeader from '@/components/dashboard-header';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { useIsTeacher } from '@/hooks/useIsTeacher';
import { useToast } from '@/hooks/use-toast';

// Chat message schema and type
const chatMessageSchema = z.object({ text: z.string().max(500, 'Message is too long.').optional() });
type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text?: string;
  imageUrl?: string;
  createdAt: Timestamp;
};

// Single message component
function Message({ message, isOwnMessage, toast }: { message: ChatMessage; isOwnMessage: boolean; toast: ReturnType<typeof useToast>['toast'] }) {
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!message.imageUrl) return;

    try {
        toast({ title: 'Downloading...', description: 'Your image download has started.' });
        const response = await fetch(message.imageUrl);
        if (!response.ok) throw new Error('Network response was not ok.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = message.imageUrl.split('/').pop()?.split('?')[0]?.split('%2F').pop()?.replace(/%20/g, ' ') || 'download';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Download failed:", error);
        toast({
            variant: "destructive",
            title: "Download failed",
            description: "Could not download the image. Please try opening it in a new tab and saving from there.",
        });
    }
  };

  return (
    <div className={cn('flex items-start gap-3', isOwnMessage && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8">
        <AvatarImage src={message.senderPhotoUrl} />
        <AvatarFallback>{message.senderName?.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className={cn('flex flex-col gap-1', isOwnMessage && 'items-end')}>
        <div className={cn('rounded-lg px-3 py-2', isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            {message.imageUrl && (
                <div className="relative group max-w-xs">
                  <Link href={message.imageUrl} target="_blank" rel="noopener noreferrer">
                      <Image src={message.imageUrl} alt="Sent image" width={200} height={200} className="rounded-md my-2 object-contain" />
                  </Link>
                    <button
                        onClick={handleDownload}
                        className="absolute top-2 right-2 p-1.5 bg-gray-900/50 text-white rounded-full hover:bg-gray-900/80 transition-colors"
                        aria-label="Download image"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </div>
            )}
          {message.text && <p className="text-sm">{message.text}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{isOwnMessage ? 'You' : message.senderName}</span>
          <span>{message.createdAt ? formatRelative(message.createdAt.toDate(), new Date()) : 'sending...'}</span>
        </div>
      </div>
    </div>
  );
}

// Group Chat Component
function GroupChat() {
  const { user } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<z.infer<typeof chatMessageSchema>>({
    resolver: zodResolver(chatMessageSchema),
    defaultValues: { text: '' },
  });

  const chatMessagesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'group_chat_messages'), orderBy('createdAt', 'asc')) : null), [firestore]);
  const { data: messages, isLoading: areMessagesLoading } = useCollection<ChatMessage>(chatMessagesQuery);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ variant: 'destructive', title: 'File too large', description: 'Please select an image smaller than 5MB.' });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if(imageInputRef.current) imageInputRef.current.value = '';
  }

  async function onSubmit(values: z.infer<typeof chatMessageSchema>) {
    if (!user || !firestore) return;
    if (!values.text && !imageFile) {
        toast({ variant: 'destructive', title: 'Cannot send an empty message.' });
        return;
    }
    
    setIsSubmitting(true);
    
    try {
      let downloadURL: string | null = null;
      if (imageFile) {
          const filePath = `chat_images/${user.uid}-${Date.now()}-${imageFile.name}`;
          const storageRef = ref(storage, filePath);
          const uploadResult = await uploadBytes(storageRef, imageFile);
          downloadURL = await getDownloadURL(uploadResult.ref);
      }

      const messageData: any = { 
          senderId: user.uid, 
          senderName: user.displayName || 'Anonymous', 
          senderPhotoUrl: user.photoURL || '', 
          createdAt: serverTimestamp(),
      };
      if (values.text) {
        messageData.text = values.text;
      }
      if (downloadURL) {
        messageData.imageUrl = downloadURL;
      }

      await addDoc(collection(firestore, 'group_chat_messages'), messageData);
      
      form.reset();
      handleRemoveImage();
    } catch (error: any) {
        console.error("Failed to send message:", error);
        toast({
            variant: "destructive",
            title: "Failed to send message",
            description: error.message,
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col h-full max-h-[calc(100vh-16rem)] shadow-none border-none">
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {areMessagesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map(msg => <Message key={msg.id} message={msg} isOwnMessage={msg.senderId === user?.uid} toast={toast} />)
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p>No messages yet. Be the first to start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <div className="border-t p-4">
        {imagePreview && (
          <div className="relative w-24 h-24 mb-2">
            <Image src={imagePreview} alt="Preview" fill className="rounded-md object-cover" />
            <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={handleRemoveImage} disabled={isSubmitting}><X className="h-4 w-4" /></Button>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => imageInputRef.current?.click()} disabled={isSubmitting}><Paperclip className="h-5 w-5" /></Button>
            <Input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageChange} disabled={isSubmitting} />
            <FormField control={form.control} name="text" render={({ field }) => (<FormItem className="flex-1"><FormControl><Input placeholder="Type a message..." autoComplete="off" {...field} disabled={isSubmitting} /></FormControl></FormItem>)} />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </Form>
      </div>
    </Card>
  );
}

// Teacher/Student list for Direct Messages
function DirectMessagesList() {
    const { user } = useUser();
    const { isTeacher, isLoading: isTeacherLoading } = useIsTeacher();
    const firestore = useFirestore();

    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        // Teachers see a list of students, students see a list of teachers
        const roleToQuery = isTeacher ? 'student' : 'teacher';
        return query(collection(firestore, 'users'), where('roleId', '==', roleToQuery));
    }, [firestore, isTeacher]);

    const { data: users, isLoading: areUsersLoading } = useCollection(usersQuery);

    const createChatId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');
    
    const isLoading = isTeacherLoading || areUsersLoading;

    if (isLoading) {
        return <div className="space-y-2 p-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
    }

    return (
        <div className="p-2 space-y-2">
            {users && users.length > 0 ? users.map((otherUser) => {
                if (otherUser.id === user?.uid) return null;
                const chatId = createChatId(user!.uid, otherUser.id);
                return (
                    <Link href={`/chat/direct/${chatId}`} key={otherUser.id} className="block">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                            <div className="flex items-center gap-3">
                                <Avatar><AvatarImage src={otherUser.photoURL} /><AvatarFallback>{otherUser.firstName?.charAt(0)}{otherUser.lastName?.charAt(0)}</AvatarFallback></Avatar>
                                <div>
                                    <p className="font-semibold">{otherUser.firstName} {otherUser.lastName}</p>
                                    <p className="text-sm text-muted-foreground">{otherUser.email}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon"><MessageCircle className="h-5 w-5" /></Button>
                        </div>
                    </Link>
                );
            }) : <p className="text-muted-foreground text-center p-8">No users to display.</p>}
        </div>
    );
}

// Main Chat Hub Page
export default function ChatPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Chat Hub" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2"><MessagesSquare /> Chat</CardTitle>
            <CardDescription>Connect with the community or chat directly with teachers and students.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="group">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="group">Group Chat</TabsTrigger>
                <TabsTrigger value="direct">Direct Messages</TabsTrigger>
              </TabsList>
              <TabsContent value="group">
                <GroupChat />
              </TabsContent>
              <TabsContent value="direct">
                <DirectMessagesList />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
