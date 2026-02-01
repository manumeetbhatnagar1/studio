'use client';

import { useState } from 'react';
import DashboardHeader from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';

const plans = {
  monthly: [
    {
      name: 'Aspire',
      target: 'Class 11',
      price: '1,500',
      exams: 'JEE Main + Advanced',
      features: [
        'Full access to Class 11 content',
        'All Subjects: Physics, Chemistry, Maths',
        'Live online classes',
        'Practice question bank',
        'Basic doubt resolution',
      ],
    },
    {
      name: 'Excel',
      target: 'Class 12',
      price: '1,800',
      exams: 'JEE Main + Advanced',
      isPopular: true,
      features: [
        'Full access to Class 12 content',
        'All Subjects: Physics, Chemistry, Maths',
        'Live online classes & recordings',
        'Full mock test series',
        'Priority doubt resolution',
      ],
    },
    {
      name: 'Conquer',
      target: 'Dropper',
      price: '2,500',
      exams: 'JEE Main + Advanced',
      features: [
        'Full access to Class 11 & 12 content',
        'All Subjects: Physics, Chemistry, Maths',
        'Intensive live classes & workshops',
        'Advanced mock tests & analysis',
        'Dedicated mentor support',
      ],
    },
  ],
  yearly: [
    {
      name: 'Aspire',
      target: 'Class 11',
      price: '15,000',
      exams: 'JEE Main + Advanced',
      features: [
        'Full access to Class 11 content',
        'All Subjects: Physics, Chemistry, Maths',
        'Live online classes',
        'Practice question bank',
        'Basic doubt resolution',
      ],
    },
    {
      name: 'Excel',
      target: 'Class 12',
      price: '18,000',
      exams: 'JEE Main + Advanced',
      isPopular: true,
      features: [
        'Full access to Class 12 content',
        'All Subjects: Physics, Chemistry, Maths',
        'Live online classes & recordings',
        'Full mock test series',
        'Priority doubt resolution',
      ],
    },
    {
      name: 'Conquer',
      target: 'Dropper',
      price: '25,000',
      exams: 'JEE Main + Advanced',
      features: [
        'Full access to Class 11 & 12 content',
        'All Subjects: Physics, Chemistry, Maths',
        'Intensive live classes & workshops',
        'Advanced mock tests & analysis',
        'Dedicated mentor support',
      ],
    },
  ],
};


export default function SubscriptionPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');

  const currentPlans = plans[billingInterval];

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Subscription Plans" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-headline text-4xl font-semibold">Choose Your Path to Success</h2>
            <p className="mt-4 text-lg text-muted-foreground">
                Select the perfect plan designed for your academic year and conquer the IIT JEE exams with DCAM Classes.
            </p>
            <div className="flex items-center space-x-2 mt-8">
                <Label htmlFor="billing-toggle" className={billingInterval === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}>Monthly</Label>
                <Switch 
                    id="billing-toggle"
                    checked={billingInterval === 'yearly'}
                    onCheckedChange={(checked) => setBillingInterval(checked ? 'yearly' : 'monthly')}
                />
                <Label htmlFor="billing-toggle" className={billingInterval === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}>Yearly (Save 16%)</Label>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {currentPlans.map((plan) => (
                <Card key={plan.name} className={`shadow-lg flex flex-col h-full ${plan.isPopular ? 'border-primary border-2 shadow-primary/20' : ''}`}>
                    {plan.isPopular && <div className="bg-primary text-primary-foreground text-sm font-semibold text-center py-1 rounded-t-lg">Most Popular</div>}
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl">{plan.name} - <span className="text-primary">{plan.target}</span></CardTitle>
                        <CardDescription>{plan.exams}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 flex-grow">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold">₹{plan.price}</span>
                            <span className="text-muted-foreground">/{billingInterval === 'monthly' ? 'month' : 'year'}</span>
                        </div>
                        <ul className="space-y-3 text-sm">
                            {plan.features.map((feature, index) => (
                                <li key={index} className="flex items-start">
                                    <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full" variant={plan.isPopular ? 'default' : 'outline'}>
                            Choose Plan
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-8">
            All subscriptions are managed securely. You can upgrade, downgrade, or cancel your plan at any time. For custom enterprise plans, please contact us.
        </p>
      </main>
    </div>
  );
}
