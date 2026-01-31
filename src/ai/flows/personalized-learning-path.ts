'use server';

/**
 * @fileOverview Personalized learning path recommendation flow.
 *
 * This flow analyzes student performance data to provide personalized learning recommendations.
 * It exports:
 *   - `getPersonalizedLearningPath`: A function to trigger the flow.
 *   - `PersonalizedLearningPathInput`: The input type for the flow.
 *   - `PersonalizedLearningPathOutput`: The output type for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define the input schema
const PersonalizedLearningPathInputSchema = z.object({
  studentId: z.string().describe('Unique identifier for the student.'),
  testResults: z
    .array(z.object({
      topic: z.string().describe('The topic of the test or practice questions.'),
      score: z.number().describe('The score achieved in the test or practice questions.'),
      maxScore: z.number().describe('The maximum possible score for the test.'),
    }))
    .describe('An array of test results for different topics.'),
});
export type PersonalizedLearningPathInput = z.infer<typeof PersonalizedLearningPathInputSchema>;

// Define the output schema
const PersonalizedLearningPathOutputSchema = z.object({
  recommendedTopics: z
    .array(z.string().describe('Topics recommended for further study.'))
    .describe('An array of topics recommended for further study based on performance.'),
  suggestedResources: z
    .array(z.string().describe('Links to resources that can help.'))
    .optional()
    .describe('Suggested resources (e.g., video lectures, study materials) for each recommended topic.'),
});
export type PersonalizedLearningPathOutput = z.infer<typeof PersonalizedLearningPathOutputSchema>;

// Exported function to call the flow
export async function getPersonalizedLearningPath(
  input: PersonalizedLearningPathInput
): Promise<PersonalizedLearningPathOutput> {
  return personalizedLearningPathFlow(input);
}

// Define the prompt
const personalizedLearningPathPrompt = ai.definePrompt({
  name: 'personalizedLearningPathPrompt',
  input: {schema: PersonalizedLearningPathInputSchema},
  output: {schema: PersonalizedLearningPathOutputSchema},
  prompt: `You are an AI learning path recommendation engine for IIT JEE students.
  Based on the student's performance in mock tests and practice questions, you will recommend topics for further study.

  Analyze the following test results for student {{studentId}}:

  {{#each testResults}}
  - Topic: {{topic}}, Score: {{score}}/{{maxScore}}
  {{/each}}

  Recommend a list of topics where the student needs the most improvement, based on the student's test scores. Only include topics with scores less than 70% of the max score. Do not include any explanation.

  Return a list of "recommendedTopics".
`,
});

// Define the flow
const personalizedLearningPathFlow = ai.defineFlow(
  {
    name: 'personalizedLearningPathFlow',
    inputSchema: PersonalizedLearningPathInputSchema,
    outputSchema: PersonalizedLearningPathOutputSchema,
  },
  async input => {
    const {output} = await personalizedLearningPathPrompt(input);
    return output!;
  }
);
