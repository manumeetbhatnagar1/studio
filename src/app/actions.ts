"use server";

import {
  getPersonalizedLearningPath,
  type PersonalizedLearningPathInput,
  type PersonalizedLearningPathOutput,
} from "@/ai/flows/personalized-learning-path";


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
