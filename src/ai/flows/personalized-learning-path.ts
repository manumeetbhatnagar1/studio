'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const PersonalizedLearningPathInputSchema = z.object({
  weakSubjects: z.array(z.string()).describe('An array of subjects the student is weak in.'),
});
export type PersonalizedLearningPathInput = z.infer<typeof PersonalizedLearningPathInputSchema>;

const PersonalizedLearningPathOutputSchema = z.object({
  recommendedTopics: z.array(z.object({
    name: z.string().describe('The name of the recommended topic or chapter.'),
    reason: z.string().describe('A brief explanation of why this topic is important for the student to focus on.'),
  })).describe('A list of specific topics or chapters to focus on.'),
  suggestedResources: z.array(z.object({
    title: z.string().describe('The title of a suggested resource (e.g., a video lecture or a practice set).'),
    reason: z.string().describe('A brief explanation of how this resource can help the student.'),
  })).describe('A list of generic but helpful resource titles to help the student learn the recommended topics.'),
});
export type PersonalizedLearningPathOutput = z.infer<typeof PersonalizedLearningPathOutputSchema>;


export async function getPersonalizedLearningPath(input: PersonalizedLearningPathInput): Promise<PersonalizedLearningPathOutput> {
  return getPersonalizedLearningPathFlow(input);
}

const getPersonalizedLearningPathFlow = ai.defineFlow(
  {
    name: 'getPersonalizedLearningPathFlow',
    inputSchema: PersonalizedLearningPathInputSchema,
    outputSchema: PersonalizedLearningPathOutputSchema,
  },
  async (input) => {
    const prompt = `You are an expert tutor for the IIT JEE exam, which covers Physics, Chemistry, and Mathematics. A student has indicated they are weak in the following subjects: ${input.weakSubjects.join(', ')}.

Your task is to provide a personalized learning path with two parts:
1.  **Recommended Topics:** Identify and recommend 3-5 specific topics or chapters within these subjects that are crucial for the JEE. For each topic, provide a brief (1-2 sentence) explanation of why it's important and what key concepts to focus on.
2.  **Suggested Resources:** Suggest 2-3 generic but helpful resource titles that would help the student learn these topics. For each resource, provide a brief (1 sentence) description of what it might cover. These should be example titles, not links to real content.

Please provide the output in the specified JSON format.`;

    const { output } = await ai.generate({
      prompt: prompt,
      output: { schema: PersonalizedLearningPathOutputSchema },
    });

    return output!;
  }
);
