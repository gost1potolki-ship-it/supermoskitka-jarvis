/** Internal Gemini adapter types — not exported into Jarvis Core. */

export interface GeminiContentPart {
  text: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

export interface GeminiGenerateInput {
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
}

export interface GeminiGenerateOutput {
  text: string | undefined;
}

export interface GeminiGenerateClient {
  generateContent(input: GeminiGenerateInput): Promise<GeminiGenerateOutput>;
}
