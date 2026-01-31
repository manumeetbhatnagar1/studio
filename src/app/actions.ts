"use server";

import {
  getPersonalizedLearningPath,
  type PersonalizedLearningPathInput,
  type PersonalizedLearningPathOutput,
} from "@/ai/flows/personalized-learning-path";
import {
  extractTextFromImage,
  type ExtractTextFromImageInput,
  type ExtractTextFromImageOutput,
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

type OcrActionResult = ExtractTextFromImageOutput & {
  error?: string;
};

export async function extractTextFromImageAction(
  input: ExtractTextFromImageInput
): Promise<OcrActionResult> {
  try {
    const result = await extractTextFromImage(input);
    if (!result) {
      return {
        error: "Failed to extract text. The AI model did not return a result.",
        extractedText: "",
      };
    }
    return result;
  } catch (error) {
    console.error("Error extracting text:", error);
    return {
        error: "An unexpected error occurred while extracting text.",
        extractedText: "",
    };
  }
}
