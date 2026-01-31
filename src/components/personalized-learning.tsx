'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getRecommendations, type ActionResult } from '@/app/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BrainCircuit, Book, Lightbulb, LoaderCircle } from 'lucide-react';

const subjects = [
  { id: 'Physics', label: 'Physics' },
  { id: 'Chemistry', label: 'Chemistry' },
  { id: 'Mathematics', label: 'Mathematics' },
] as const;

const formSchema = z.object({
  weakSubjects: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: 'You have to select at least one subject.',
  }),
});

type Recommendations = ActionResult['data'];

export default function PersonalizedLearning() {
  const [recommendations, setRecommendations] = useState<Recommendations>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      weakSubjects: [],
    },
  });

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(undefined);
    setRecommendations(null);

    const result = await getRecommendations(data);
    
    if (result.error) {
      setError(result.error);
    } else {
      setRecommendations(result.data);
    }

    setIsLoading(false);
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline text-2xl">
          <BrainCircuit />
          AI-Powered Learning Path
        </CardTitle>
        <CardDescription>
          Select your weak subjects, and our AI will generate a personalized study plan for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 rounded-lg border p-4">
            <FormField
              control={form.control}
              name="weakSubjects"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">My Weak Subjects</FormLabel>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {subjects.map((item) => (
                      <FormField
                        key={item.id}
                        control={form.control}
                        name="weakSubjects"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={item.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, item.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== item.id
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">{item.label}</FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <LoaderCircle className="mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate My Plan'
              )}
            </Button>
          </form>
        </Form>

        {isLoading && (
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-8 w-1/3 mb-4" />
                    <div className="grid gap-4 md:grid-cols-2">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                </div>
                 <div>
                    <Skeleton className="h-8 w-1/3 mb-4" />
                    <div className="grid gap-4 md:grid-cols-2">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                </div>
            </div>
        )}

        {error && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
        
        {recommendations && (
          <div className="space-y-8 pt-4">
            <div>
              <h3 className="flex items-center gap-2 font-headline text-xl mb-4"><Lightbulb />Recommended Topics</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {recommendations.recommendedTopics.map((topic) => (
                  <Card key={topic.name} className="bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-lg">{topic.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{topic.reason}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
             <div>
              <h3 className="flex items-center gap-2 font-headline text-xl mb-4"><Book />Suggested Resources</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {recommendations.suggestedResources.map((resource) => (
                  <Card key={resource.title} className="bg-secondary/50">
                    <CardHeader>
                      <CardTitle className="text-lg">{resource.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{resource.reason}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
