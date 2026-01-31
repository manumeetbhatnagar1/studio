"use server";

import {
  getPersonalizedLearningPath,
  type PersonalizedLearningPathInput,
  type PersonalizedLearningPathOutput,
} from "@/ai/flows/personalized-learning-path";

type ActionResult = PersonalizedLearningPathOutput & {
  error?: string;
};

export async function getRecommendations(
  input: PersonalizedLearningPathInput
): Promise<ActionResult> {
  try {
    const result = await getPersonalizedLearningPath(input);
    if (!result) {
      return { 
        error: "Failed to get recommendations. The AI model did not return a result.",
        recommendedTopics: [],
        suggestedResources: [],
      };
    }
    return result;
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return { 
        error: "An unexpected error occurred while fetching recommendations.",
        recommendedTopics: [],
        suggestedResources: [],
     };
  }
}
