
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, SceneType } from "../types";

/**
 * Service to handle product analysis using Gemini 3 Flash.
 * Always initializes a fresh GoogleGenAI instance using process.env.API_KEY directly.
 */
export const analyzeProduct = async (images: string[]): Promise<ProductAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const imageParts = images.map(img => ({
    inlineData: {
      data: img.split(',')[1],
      mimeType: 'image/jpeg'
    }
  }));

  const prompt = `Analyze this product from the images provided. Provide the details in three categories:
  1. Product Details (Appearance, branding, material, unique features)
  2. Product Purpose (What is it for? Target audience?)
  3. How to use (Brief step-by-step instructions)
  
  Return the response in JSON format.`;

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [...imageParts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          details: { type: Type.STRING },
          usage: { type: Type.STRING },
          howToUse: { type: Type.STRING }
        },
        required: ["details", "usage", "howToUse"]
      }
    }
  });

  return JSON.parse(response.text || '{}') as ProductAnalysis;
};

/**
 * Service to generate storyboard prompts using Gemini 3 Pro.
 */
export const generateStoryboards = async (
  analysis: ProductAnalysis, 
  quantity: number, 
  language: 'zh' | 'en',
  sceneType: SceneType
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-pro-preview';

  const systemInstruction = language === 'zh' 
    ? `你是一个专业的产品分镜策划师。你擅长根据产品细节，在指定的${sceneType}场景下生成电影级、高凝聚力的3x3网格分镜提示词。`
    : `You are a professional product storyboard planner. You excel at generating cinematic, highly cohesive 3x3 grid storyboard prompts under the specified ${sceneType} scene setting.`;

  const templatePrompt = `
    Product Context: ${JSON.stringify(analysis)}
    Scene Type: ${sceneType}
    Language: ${language === 'zh' ? 'Chinese' : 'English'}
    
    Task: Generate ${quantity} unique prompt variations. Each variation MUST strictly follow this exact template:

    根据[${analysis.details}>kx]，生成一张具有凝聚力的[3x3]网格图像，包含在同一环境中的[9]个不同摄像镜头，产品内外部结构完全一致，首尾镜头主体完全一致，严格保持人物/物体、服装和光线的一致性，[8K]分辨率，[16:9]画幅。
    镜头01: [Description of a wide establishing shot of the product in the ${sceneType} environment]
    镜头02: [Description of a close-up of a specific product detail]
    镜头03: [Description of the product being handled or in use]
    镜头04: [Description of an internal view or exploded view of product structure]
    镜头05: [Description of a creative angle or dynamic lighting shot]
    镜头06: [Description of another usage step]
    镜头07: [Description of a macro shot of material texture or branding]
    镜头08: [Description of the product in its context/environment]
    镜头09: [Description of a final hero shot matching the scale/subject of Lens 01]

    Note: The descriptions must be in ${language === 'zh' ? 'Chinese' : 'English'}.
    Return a JSON array of strings.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: templatePrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text || '[]') as string[];
};

/**
 * Service to generate images using Gemini 2.5 Flash Image (Free Tier).
 */
export const generateStoryboardImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  // Switched to gemini-2.5-flash-image for free usage without mandatory key selection
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  let imageUrl = '';
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }
  
  if (!imageUrl) throw new Error("Image generation failed");
  return imageUrl;
};
