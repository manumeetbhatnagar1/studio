'use client';

import { useEffect, useMemo, useRef, FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatRelative } from 'date-fns';
import { useParams } from 'next/navigation';
import type { Timestamp } from 'firebase/firestore';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, doc, addDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, ArrowLeft, Paperclip, X, LoaderCircle, AlertCircle, Download } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

// Zod schema for the chat message form
const chatMessageSchema = z.object({ text: z.string().max(500, 'Message is too long.').optional() });

// Type for a chat message document
type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text?: string;
  imageUrl?: string;
  createdAt: Timestamp;
  isUploading?: boolean;
  uploadError?: boolean;
};

type UserProfile = {
  firstName: string;
  lastName: string;
}

// Component for a single message
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
              <div className="relative group">
                  <Link href={message.uploadError || message.isUploading ? '#' : message.imageUrl} target="_blank" rel="noopener noreferrer" className={cn(message.uploadError && 'pointer-events-none')}>
                      <Image src={message.imageUrl} alt="Sent image" width={200} height={200} className={cn("rounded-md my-2 max-w-xs object-contain", (message.isUploading || message.uploadError) && "opacity-50")} />
                  </Link>
                  {message.isUploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                          <LoaderCircle className="h-6 w-6 animate-spin text-white" />
                      </div>
                  )}
                  {message.uploadError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-md text-destructive-foreground p-2 text-center">
                          <AlertCircle className="h-6 w-6 text-red-400" />
                          <p className="text-xs mt-1">Upload failed</p>
                      </div>
                  )}
                  {!message.isUploading && !message.uploadError && (
                    <button
                        onClick={handleDownload}
                        className="absolute top-2 right-2 p-1.5 bg-gray-900/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Download image"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                  )}
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
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    if (!user || !firestore || !chatId) return;
     if (!values.text && !imageFile) {
        toast({ variant: 'destructive', title: 'Cannot send an empty message.' });
        return;
    }
    setIsUploading(true);

    const tempImageFile = imageFile;
    const tempImagePreview = imagePreview;

    form.reset();
    handleRemoveImage();

    try {
      const messagesRef = collection(firestore, 'direct_messages', chatId, 'messages');
      const docRef = await addDoc(messagesRef, {
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhotoUrl: user.photoURL || '',
        text: values.text || '',
        imageUrl: tempImageFile ? tempImagePreview : '',
        createdAt: serverTimestamp(),
        isUploading: !!tempImageFile,
      });

      if (tempImageFile) {
        const storage = getStorage();
        const filePath = `chat_images/${user.uid}-${docRef.id}-${tempImageFile.name}`;
        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, tempImageFile);

        uploadTask.on('state_changed', 
            null,
            (error) => {
                console.error("Upload failed:", error);
                updateDocumentNonBlocking(docRef, { isUploading: false, uploadError: true });
            }, 
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    updateDocumentNonBlocking(docRef, { imageUrl: downloadURL, isUploading: false });
                });
            }
        );
      }
      
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to send message',
            description: error.message || 'An error occurred while sending your message.',
        });
    } finally {
        setIsUploading(false);
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
            messages.map(msg => <Message key={msg.id} message={msg} isOwnMessage={msg.senderId === user?.uid} toast={toast} />)
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
            {imagePreview && (
              <div className="relative w-24 h-24 mb-2">
                <Image src={imagePreview} alt="Preview" fill className="rounded-md object-cover" />
                <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={handleRemoveImage} disabled={isUploading}><X className="h-4 w-4" /></Button>
              </div>
            )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => imageInputRef.current?.click()} disabled={isUploading}><Paperclip className="h-5 w-5" /></Button>
                <Input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageChange} disabled={isUploading} />
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="Type a message..." autoComplete="off" {...field} disabled={isUploading} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isUploading || form.formState.isSubmitting}>
                {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
