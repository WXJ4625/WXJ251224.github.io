
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType } from "../types";

/**
 * 分析资产细节
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
    const mediaPart = {
      inlineData: {
        data: item.data.split(',')[1],
        mimeType: item.type === 'video' ? 'video/mp4' : 'image/jpeg'
      }
    };

    const prompt = `分析产品“${productName}”的特征、材质和结构。如果是视频，分析其运动逻辑。输出 JSON: { "description": "..." }`;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts: [mediaPart, { text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING }
            },
            required: ["description"]
          }
        }
      });
      const parsed = JSON.parse(response.text || '{"description": "无法识别"}');
      results.push({ id: item.id, description: parsed.description });
    } catch (e) {
      console.error("Analysis failed", e);
      results.push({ id: item.id, description: "分析跳过" });
    }
  }

  return results;
};

/**
 * 智能补全产品档案
 */
export const generateProductProfileFromText = async (productName: string): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const prompt = `基于产品名称“${productName}”，分析其细节材质、功能卖点、目标受众、交互动作。输出 JSON。`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          details: { type: Type.STRING },
          features: { type: Type.STRING },
          audience: { type: Type.STRING },
          interaction: { type: Type.STRING }
        },
        required: ["details", "features", "audience", "interaction"]
      }
    }
  });

  return JSON.parse(response.text || '{}') as ProductAnalysis['globalProfile'];
};

/**
 * 综合生成分镜
 */
export const synthesizeProductProfile = async (
  individualAnalyses: IndividualAnalysis[],
  productName: string
): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const context = individualAnalyses.map(a => a.description).join('\n');
  const prompt = `基于以下资产描述，提炼产品“${productName}”的 details, features, audience, interaction。输出 JSON。资产描述：\n${context}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          details: { type: Type.STRING },
          features: { type: Type.STRING },
          audience: { type: Type.STRING },
          interaction: { type: Type.STRING }
        },
        required: ["details", "features", "audience", "interaction"]
      }
    }
  });

  return JSON.parse(response.text || '{}') as ProductAnalysis['globalProfile'];
};

/**
 * 批量生成分镜方案 (1-50份)
 */
export const generateStoryboards = async (
  profile: ProductAnalysis['globalProfile'], 
  productName: string,
  quantity: number, 
  language: 'zh' | 'en',
  sceneType: SceneType
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const systemInstruction = `你是一位顶尖分镜摄影师。你的任务是为产品“${productName}”创作 ${quantity} 套独特的分镜策划。
  语言：${language === 'zh' ? '中文' : '英文'}。
  
  格式要求：
  1. 每套方案开头是一个包含 3x3 布局和一致性要求的总指令。
  2. 随后列出 镜头01 至 镜头09，每个镜头需包含构图、光影及产品展示细节。
  3. 每个镜头之间必须换行。`;

  const prompt = `
    产品详情: ${profile.details}
    功能卖点: ${profile.features}
    受众调性: ${profile.audience}
    交互逻辑: ${profile.interaction}
    场景主题: ${sceneType}
    
    请生成 ${quantity} 个独立的分镜文本块。
    输出格式为 JSON 字符串数组。
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
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
 * 生成 9 宫格预览图
 */
export const generateGridImage = async (prompt: string, referenceBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-2.5-flash-image';
  
  const contents: any[] = [{ text: `High quality commercial product photography, 3x3 storyboard grid, consistent style: ${prompt}` }];
  
  if (referenceBase64) {
    contents.unshift({
      inlineData: {
        data: referenceBase64.split(',')[1],
        mimeType: 'image/jpeg'
      }
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts: contents },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("图片生成失败");
};
