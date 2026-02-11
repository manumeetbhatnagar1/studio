'use client';

import { useEffect, useMemo, useRef, FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatRelative } from 'date-fns';
import { useParams } from 'next/navigation';
import type { Timestamp } from 'firebase/firestore';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, doc, addDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, ArrowLeft, Paperclip, X, LoaderCircle, Download, AlertTriangle, FileText } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

const chatMessageSchema = z.object({ text: z.string().max(500, 'Message is too long.').optional() });

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoUrl?: string;
  text?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  createdAt: Timestamp;
  isUploading?: boolean;
  uploadError?: string;
};

type UserProfile = {
  firstName: string;
  lastName: string;
}

function Message({ message, isOwnMessage, toast }: { message: ChatMessage; isOwnMessage: boolean; toast: ReturnType<typeof useToast>['toast'] }) {

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const urlToDownload = message.fileUrl || message.imageUrl;
    if (!urlToDownload) return;

    try {
        toast({ title: 'Downloading...', description: 'Your file download has started.' });
        const response = await fetch(urlToDownload);
        if (!response.ok) throw new Error('Network response was not ok.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = message.fileName || urlToDownload.split('/').pop()?.split('?')[0]?.split('%2F').pop()?.replace(/%20/g, ' ') || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Download failed:", error);
        toast({
            variant: "destructive",
            title: "Download failed",
            description: "Could not download the file. Please try opening it in a new tab and saving from there.",
        });
    }
  };

  const isImage = message.fileType?.startsWith('image/');

  return (
    <div className={cn('flex items-start gap-3', isOwnMessage && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8">
        <AvatarImage src={message.senderPhotoUrl} />
        <AvatarFallback>{message.senderName?.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className={cn('flex flex-col gap-1', isOwnMessage && 'items-end')}>
        <div className={cn('rounded-lg px-3 py-2 max-w-sm', isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
          {message.isUploading && (
              <div className="w-48 h-20 flex items-center justify-center bg-secondary rounded-md my-2">
                <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
          )}
          {message.uploadError && (
              <div className="w-48 h-auto flex flex-col items-center justify-center bg-destructive/20 text-destructive-foreground rounded-md my-2 p-2 text-center">
                <AlertTriangle className="h-6 w-6 mb-2" />
                <p className="text-xs font-semibold">{message.uploadError}</p>
              </div>
          )}
          {!message.isUploading && !message.uploadError && (
            isImage && message.imageUrl ? (
              <div className="relative group max-w-xs my-2">
                  <Link href={message.imageUrl} target="_blank" rel="noopener noreferrer">
                      <Image src={message.imageUrl} alt={message.fileName || 'Sent image'} width={200} height={200} className="rounded-md object-contain" />
                  </Link>
                  <button
                    onClick={handleDownload}
                    className="absolute top-2 right-2 p-1.5 bg-gray-900/50 text-white rounded-full hover:bg-gray-900/80 transition-colors"
                    aria-label="Download image"
                  >
                    <Download className="h-4 w-4" />
                  </button>
              </div>
            ) : message.fileUrl && (
                <div className="relative group max-w-xs my-2 p-3 rounded-md bg-background/20">
                    <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <div className="flex-1 overflow-hidden">
                             <p className="text-sm font-medium truncate">{message.fileName}</p>
                             <p className="text-xs text-muted-foreground/80">{message.fileType}</p>
                        </div>
                        <button onClick={handleDownload} className="p-1.5 text-inherit rounded-full hover:bg-black/20 transition-colors" aria-label="Download file">
                            <Download className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )
          )}
          {message.text && <p className="text-sm whitespace-pre-wrap">{message.text}</p>}
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
  const storage = useStorage();
  const params = useParams();
  const chatId = params.chatId as string;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  
  const { data: messages, isLoading: areMessagesLoading } = useCollection<ChatMessage>(messagesQuery);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if(selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ variant: 'destructive', title: 'File too large', description: 'Please select a file smaller than 10MB.' });
        return;
      }
      setFile(selectedFile);
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setPreviewDataUrl(reader.result as string);
        reader.readAsDataURL(selectedFile);
      } else {
        setPreviewDataUrl(null);
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreviewDataUrl(null);
    if(fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSubmit(values: z.infer<typeof chatMessageSchema>) {
    if (!user || !firestore || !storage || !chatId) return;
     if (!values.text && !file) {
        toast({ variant: 'destructive', title: 'Cannot send an empty message.' });
        return;
    }
    
    setIsSubmitting(true);
    const attachedFile = file;

    form.reset();
    handleRemoveFile();
    
    const messageData: any = {
      senderId: user.uid,
      senderName: user.displayName || 'Anonymous',
      senderPhotoUrl: user.photoURL || '',
      createdAt: serverTimestamp(),
      text: values.text || '',
    };

    if (attachedFile) {
        messageData.isUploading = true;
        messageData.fileName = attachedFile.name;
        messageData.fileType = attachedFile.type;
    }

    try {
      const messageRef = await addDoc(collection(firestore, 'direct_messages', chatId, 'messages'), messageData);
      
      if (attachedFile) {
          const filePath = `chat_files/${messageRef.id}-${attachedFile.name}`;
          const storageRef = ref(storage, filePath);

          uploadBytes(storageRef, attachedFile).then(async (uploadResult) => {
              const downloadURL = await getDownloadURL(uploadResult.ref);
              const updateData: any = {
                  isUploading: false,
                  fileUrl: downloadURL,
              };
              if (attachedFile.type.startsWith('image/')) {
                  updateData.imageUrl = downloadURL;
              }
              await updateDoc(messageRef, updateData);
          }).catch(async (error) => {
              console.error("Upload failed:", error);
              await updateDoc(messageRef, {
                  isUploading: false,
                  uploadError: 'Upload failed',
              });
          });
      }
    } catch (error: any) {
        console.error("Failed to send message:", error);
        toast({
            variant: 'destructive',
            title: 'Failed to send message',
            description: "Could not create the message document. Please try again.",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <DirectChatPageHeader otherUserId={otherUserId} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-4 max-w-4xl mx-auto">
          {areMessagesLoading ? (
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
            {file && (
              <div className="relative w-fit max-w-xs mb-2 p-2 border rounded-lg bg-muted">
                {previewDataUrl ? (
                    <Image src={previewDataUrl} alt="Preview" width={80} height={80} className="rounded-md object-cover" />
                ) : (
                    <div className="flex items-center gap-2">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground truncate">{file.name}</p>
                    </div>
                )}
                <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={handleRemoveFile} disabled={isSubmitting}><X className="h-4 w-4" /></Button>
              </div>
            )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}><Paperclip className="h-5 w-5" /></Button>
                <Input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} disabled={isSubmitting} />
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="Type a message..." autoComplete="off" {...field} disabled={isSubmitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
