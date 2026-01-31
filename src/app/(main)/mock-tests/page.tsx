'use client';

import DashboardHeader from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function MockTestsPage() {
  const tests = [
    {
      id: 'jee-main-1',
      title: 'JEE Main Full Syllabus Mock Test 1',
      description: 'A full-length mock test based on the latest JEE Main pattern.',
      questions: 90,
      duration: 180,
    }
  ];

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Mock Tests" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <h2 className="font-headline text-2xl font-semibold mb-4">Available Mock Tests</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tests.map(test => (
            <Card key={test.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{test.title}</CardTitle>
                <CardDescription>{test.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                 <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><FileText className="h-4 w-4"/><span>{test.questions} Questions</span></div>
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{test.duration} Minutes</span></div>
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/test/${test.id}`}>Start Test <ArrowRight className="ml-2"/></Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
