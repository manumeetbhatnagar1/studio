"use server";

import {
  getPersonalizedLearningPath,
  type PersonalizedLearningPathInput,
  type PersonalizedLearningPathOutput,
} from "@/ai/flows/personalized-learning-path";
import {
  extractMcqFromImage,
  type ExtractMcqFromImageInput,
  type ExtractMcqFromImageOutput,
} from "@/ai/flows/extract-text-from-image";


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

type ExtractMcqResult = ExtractMcqFromImageOutput & {
  error?: string;
};

export async function extractQuestionFromImage(
  input: ExtractMcqFromImageInput
): Promise<ExtractMcqResult> {
  try {
    const result = await extractMcqFromImage(input);
    if (!result) {
      return { 
        error: "Failed to extract MCQ data. The AI model did not return a result.",
        questionText: "",
        options: [],
      };
    }
    return result;
  } catch (error) {
    console.error("Error extracting MCQ data:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred while extracting MCQ data.";
    return { 
        error: errorMessage,
        questionText: "",
        options: [],
     };
  }
}
