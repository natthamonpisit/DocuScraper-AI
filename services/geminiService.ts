import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
    // Note: In a real production app, this should be handled carefully. 
    // Since this is a client-side demo instructions say to use process.env.API_KEY directly.
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateSummary = async (content: string): Promise<string> => {
    try {
        const ai = getAiClient();
        
        // Truncate content if it's too huge to save tokens/avoid limits
        const truncatedContent = content.length > 20000 ? content.substring(0, 20000) + "..." : content;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `You are an expert technical writer. Please provide a concise, bullet-point summary of the following documentation content. Focus on the key concepts, configuration steps, and purpose. Format using Markdown. \n\n Content: ${truncatedContent}`,
        });

        return response.text || "Could not generate summary.";
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Failed to generate AI summary. Please check your API Key or try again later.";
    }
};
