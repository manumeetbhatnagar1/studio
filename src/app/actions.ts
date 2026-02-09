"use server";

import {
  getPersonalizedLearningPath,
  type PersonalizedLearningPathInput,
  type PersonalizedLearningPathOutput,
} from "@/ai/flows/personalized-learning-path";
import Razorpay from 'razorpay';
import crypto from 'crypto';

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

export async function createRazorpayOrder(amount: number, currency: string = 'INR'): Promise<{orderId: string | null, error?: string}> {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error("Razorpay keys not found.");
        return { orderId: null, error: 'Razorpay is not configured. Please provide API keys.' };
    }
    
    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
        amount: amount * 100,  // amount in the smallest currency unit
        currency,
        receipt: `receipt_order_${new Date().getTime()}`,
    };

    try {
        const order = await instance.orders.create(options);
        return { orderId: order.id };
    } catch (error: any) {
        console.error("Error creating Razorpay order:", error);
        return { orderId: null, error: error.message };
    }
}

export async function verifyRazorpayPayment(
    orderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
): Promise<{verified: boolean, error?: string}> {
     if (!process.env.RAZORPAY_KEY_SECRET) {
        console.error("Razorpay secret not found.");
        return { verified: false, error: 'Razorpay is not configured.' };
    }

    const body = orderId + "|" + razorpayPaymentId;

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');
    
    const isAuthentic = expectedSignature === razorpaySignature;

    if (isAuthentic) {
        return { verified: true };
    } else {
        return { verified: false, error: "Payment signature verification failed." };
    }
}
