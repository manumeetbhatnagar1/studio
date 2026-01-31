"use client";

import { useState } from "react";
import { Lightbulb, LoaderCircle, AlertTriangle } from "lucide-react";
import { getRecommendations } from "@/app/actions";
import { testResults } from "@/lib/data";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PersonalizedLearningPathOutput } from "@/ai/flows/personalized-learning-path";
import { useToast } from "@/hooks/use-toast";

export default function PersonalizedLearning() {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<PersonalizedLearningPathOutput | null>(null);
  const { toast } = useToast();

  const handleAnalysis = async () => {
    setLoading(true);
    setRecommendations(null);

    const result = await getRecommendations({
      studentId: "student-123",
      testResults: testResults,
    });

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: result.error,
      });
    } else {
      setRecommendations(result);
    }
    setLoading(false);
  };

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary p-3 rounded-full">
            <Lightbulb className="w-8 h-8" />
          </div>
          <div>
            <CardTitle className="font-headline text-2xl">
              Personalized Learning Path
            </CardTitle>
            <CardDescription>
              AI-powered recommendations based on your performance.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!recommendations && (
          <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg">
            <p className="mb-4 text-muted-foreground">
              Click the button to analyze your recent test results and get personalized focus areas.
            </p>
            <Button onClick={handleAnalysis} disabled={loading} size="lg">
              {loading ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Analyze My Performance"
              )}
            </Button>
          </div>
        )}

        {recommendations && (
          <div>
            {recommendations.recommendedTopics.length > 0 ? (
              <>
                <h3 className="font-semibold mb-4 text-lg">Recommended Topics to Focus On:</h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recommendations.recommendedTopics.map((topic) => (
                    <li key={topic}>
                      <div className="p-4 bg-secondary rounded-lg flex items-center gap-3 hover:bg-primary/10 transition-colors">
                        <Lightbulb className="w-5 h-5 text-accent" />
                        <span className="font-medium">{topic}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 text-center">
                    <Button variant="outline" onClick={() => setRecommendations(null)}>Analyze Again</Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <h3 className="text-xl font-semibold mb-2">Great Job!</h3>
                <p className="text-muted-foreground">No specific weak areas found based on recent tests. Keep up the good work!</p>
                <Button variant="outline" onClick={() => setRecommendations(null)} className="mt-4">Analyze Again</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
