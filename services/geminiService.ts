
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType } from "../types";

/**
 * 分析每一张参考图或视频的具体内容
 */
export const analyzeIndividualImages = async (
  images: {id: string, data: string, type: 'image' | 'video'}[],
  productName: string
): Promise<IndividualAnalysis[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const results: IndividualAnalysis[] = [];

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const isVideo = item.type === 'video';
    
    const mediaPart = {
      inlineData: {
        data: item.data.split(',')[1],
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg'
      }
    };

    const prompt = isVideo 
      ? `你正在深度解析产品“${productName}”的参考视频。
         请执行以下分析：
         1. 静态描述：识别产品核心组件、材质和品牌标识。
         2. 动态分析：描述视频中的运动特性（旋转、折叠等）。
         3. 结构变化：分析运动过程中产品的外观结构演变。
         输出格式为 JSON: { "description": "产品静态描述", "motionDynamics": "动态运动分析" }`
      : `你正在分析产品“${productName}”的参考图。
         请详细描述产品结构特征、材质细节和功能角度。
         输出格式为 JSON: { "description": "..." }`;

    const properties: any = {
      description: { type: Type.STRING }
    };
    if (isVideo) {
      properties.motionDynamics = { type: Type.STRING };
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts: [mediaPart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties,
          required: isVideo ? ["description", "motionDynamics"] : ["description"]
        }
      }
    });

    const parsed = JSON.parse(response.text || '{"description": "无法识别"}');
    results.push({ 
      id: item.id, 
      description: parsed.description,
      motionDynamics: parsed.motionDynamics 
    });
  }

  return results;
};

/**
 * 综合所有参考图分析
 */
export const synthesizeProductProfile = async (
  individualAnalyses: IndividualAnalysis[],
  productName: string
): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const context = individualAnalyses.map((a, i) => {
    let text = `参考 ${i+1} 分析: ${a.description}`;
    if (a.motionDynamics) text += ` | 动态特性: ${a.motionDynamics}`;
    return text;
  }).join('\n');

  const prompt = `提炼产品“${productName}”的全局核心档案。
  
  资料汇总：
  ${context}
  
  输出格式为 JSON。维度：details, usage, howToUse。`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
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

  return JSON.parse(response.text || '{}') as ProductAnalysis['globalProfile'];
};

/**
 * 生成分镜建议 - 使用 Flash 模型以节省配额并提高速度
 */
export const generateStoryboards = async (
  profile: ProductAnalysis['globalProfile'], 
  productName: string,
  quantity: number, 
  language: 'zh' | 'en',
  sceneType: SceneType
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  // 使用 Flash-preview 替代 Pro 以获得更高配额
  const model = 'gemini-3-flash-preview';

  const systemInstruction = `You are a professional commercial storyboard planner. Use high-efficiency creative logic to plan a 3x3 cohesive grid.
  Key Requirement: Strict structural consistency based on details provided.
  Language: ${language === 'zh' ? 'Chinese' : 'English'}.`;

  const templatePrompt = `
    产品: ${productName}
    细节: ${profile.details}
    功能: ${profile.usage}
    交互逻辑: ${profile.howToUse}
    环境: ${sceneType}
    
    任务：生成 ${quantity} 份独立的分镜策划方案。
    格式规范：
    根据[${profile.details}>kx]，生成一张具有凝聚力的[3x3]网格图像...
    镜头01: ...
    ...
    镜头09: ...

    输出 JSON 字符串数组。
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
 * 生成 9 宫格图片
 */
export const generateStoryboardImage = async (prompt: string, referenceImageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const imagePart = {
    inlineData: {
      data: referenceImageBase64.split(',')[1],
      mimeType: 'image/jpeg'
    }
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { 
      parts: [
        imagePart, 
        { text: `PROMPT: ${prompt}. Generate a professional 3x3 storyboard grid image.` }
      ] 
    },
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

/**
 * 生成视频
 */
export const generateVideo = async (
  prompt: string, 
  base64Image: string, 
  onStatusChange?: (status: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const rawData = base64Image.split(',')[1];

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Consistent motion commercial video. ${prompt}`,
    image: {
      imageBytes: rawData,
      mimeType: 'image/png',
    },
    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
