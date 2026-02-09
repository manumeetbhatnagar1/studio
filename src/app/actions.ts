"use server";

import {
  getPersonalizedLearningPath,
  type PersonalizedLearningPathInput,
  type PersonalizedLearningPathOutput,
} from "@/ai/flows/personalized-learning-path";
import Stripe from 'stripe';


export type ActionResult = {
  data: PersonalizedLearningPathOutput | null;
  error?: string;
};

export async function getRecommendations(
  input: PersonalizedLearningPathInput
): Promise<ActionResult> {
  try {
    const result = await getPersonalizedLearningPath(input);
    if (!result) {
      return { 
        data: null,
        error: "Failed to get recommendations. The AI model did not return a result.",
      };
    }
    return { data: result };
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return { 
        data: null,
        error: "An unexpected error occurred while fetching recommendations.",
     };
  }
}

export async function createPaymentIntent(amount: number): Promise<{clientSecret: string | null, error?: string}> {
    if (!process.env.STRIPE_SECRET_KEY) {
        console.error("Stripe secret key not found.");
        return { clientSecret: null, error: 'Stripe is not configured. Please provide a secret key.' };
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // amount in cents
            currency: 'inr',
            automatic_payment_methods: {
                enabled: true,
            },
        });
        return { clientSecret: paymentIntent.client_secret };
    } catch (error: any) {
        console.error("Error creating payment intent:", error);
        return { clientSecret: null, error: error.message };
    }
}
