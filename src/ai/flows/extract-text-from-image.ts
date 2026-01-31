'use server';
/**
 * @fileOverview Extracts a multiple-choice question from an image.
 *
 * This file contains a Genkit flow for performing OCR on an image
 * and structuring the output as a question and a list of options.
 * - extractMcqFromImage - A function that handles the MCQ extraction process.
 * - ExtractMcqFromImageInput - The input type for the function.
 * - ExtractMcqFromImageOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractMcqFromImageInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "An image of a question, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractMcqFromImageInput = z.infer<typeof ExtractMcqFromImageInputSchema>;

const ExtractMcqFromImageOutputSchema = z.object({
  questionText: z.string().describe('The main text of the multiple-choice question.'),
  options: z.array(z.string()).length(4).describe('An array containing the four multiple-choice options.'),
});
export type ExtractMcqFromImageOutput = z.infer<typeof ExtractMcqFromImageOutputSchema>;

export async function extractMcqFromImage(input: ExtractMcqFromImageInput): Promise<ExtractMcqFromImageOutput> {
  return extractMcqFromImageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractMcqFromImagePrompt',
  input: {schema: ExtractMcqFromImageInputSchema},
  output: {schema: ExtractMcqFromImageOutputSchema},
  prompt: `You are an OCR tool that specializes in academic content. From the provided image, extract the multiple-choice question and its four corresponding options.
  
  Please parse the question text and the four choices accurately. The options might be labeled with letters (A, B, C, D) or numbers (1, 2, 3, 4). You should extract only the text of the options, without their labels.

  Image: {{media url=imageDataUri}}`,
});

const extractMcqFromImageFlow = ai.defineFlow(
  {
    name: 'extractMcqFromImageFlow',
    inputSchema: ExtractMcqFromImageInputSchema,
    outputSchema: ExtractMcqFromImageOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
