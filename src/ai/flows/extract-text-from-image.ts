'use server';
/**
 * @fileOverview Extracts text from an image using an AI model.
 *
 * - extractTextFromImage - A function that handles the text extraction process.
 * - ExtractTextFromImageInput - The input type for the function.
 * - ExtractTextFromImageOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractTextFromImageInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "An image of the text to extract, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractTextFromImageInput = z.infer<typeof ExtractTextFromImageInputSchema>;

const ExtractTextFromImageOutputSchema = z.object({
  extractedText: z.string().describe('The text extracted from the image.'),
});
export type ExtractTextFromImageOutput = z.infer<typeof ExtractTextFromImageOutputSchema>;

export async function extractTextFromImage(
  input: ExtractTextFromImageInput
): Promise<ExtractTextFromImageOutput> {
  return extractTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractTextFromImagePrompt',
  input: {schema: ExtractTextFromImageInputSchema},
  output: {schema: ExtractTextFromImageOutputSchema},
  prompt: `You are an OCR (Optical Character Recognition) engine. Extract all text from the following image.

Image: {{media url=imageDataUri}}`,
});

const extractTextFlow = ai.defineFlow(
  {
    name: 'extractTextFlow',
    inputSchema: ExtractTextFromImageInputSchema,
    outputSchema: ExtractTextFromImageOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
