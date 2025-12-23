
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType } from "../types";

/**
 * 分析每一张参考图的具体内容
 */
export const analyzeIndividualImages = async (images: {id: string, data: string}[]): Promise<IndividualAnalysis[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const results: IndividualAnalysis[] = [];

  for (const img of images) {
    const imagePart = {
      inlineData: {
        data: img.data.split(',')[1],
        mimeType: 'image/jpeg'
      }
    };

    const prompt = `请分析这张参考图。描述图中展示的产品具体部位、环境、光影以及它传达的视觉信息。
    输出格式为 JSON: { "description": "..." }`;

    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, { text: prompt }] },
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
    results.push({ id: img.id, description: parsed.description });
  }

  return results;
};

/**
 * 综合所有参考图分析，推导出全局产品属性
 */
export const synthesizeProductProfile = async (individualAnalyses: IndividualAnalysis[]): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const context = individualAnalyses.map((a, i) => `参考图 ${i+1} 分析: ${a.description}`).join('\n');
  const prompt = `基于以下对多张产品参考图的独立分析，请综合推导出一个完整的产品档案：
  ${context}
  
  请按以下维度输出（用于分镜策划）：
  1. 产品细节 (Details): 综合外观特征、品牌、材质。
  2. 产品用途 (Usage): 核心受众、适用场景。
  3. 使用演示 (HowToUse): 核心操作或演示逻辑。
  
  输出格式为 JSON。`;

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
 * 根据综合档案生成多套分镜建议
 */
export const generateStoryboards = async (
  profile: ProductAnalysis['globalProfile'], 
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
    参考背景:
    - 细节: ${profile.details}
    - 用途: ${profile.usage}
    - 演示: ${profile.howToUse}
    - 场景类型: ${sceneType}
    
    任务：生成 ${quantity} 份独特的分镜方案。每份方案必须严格遵守以下格式：

    根据[${profile.details}>kx]，生成一张具有凝聚力的[3x3]网格图像，包含在同一环境中的[9]个不同摄像镜头，产品内外部结构完全一致，首尾镜头主体完全一致，严格保持人物/物体、服装和光线的一致性，[8K]分辨率，[16:9]画幅。
    镜头01: [广角镜头，展示产品在 ${sceneType} 场景中的整体状态]
    镜头02: [特写镜头，展示产品核心卖点细节]
    镜头03: [动作镜头，展示 ${profile.howToUse} 中的关键一步]
    镜头04: [结构镜头，展示内部结构或材质质感]
    镜头05: [创意视角或动感光影效果]
    镜头06: [动作镜头，展示产品使用的延续动作]
    镜头07: [微距镜头，展示Logo或精细纹理]
    镜头08: [环境叙事镜头，体现 ${profile.usage} 中的生活化场景]
    镜头09: [最终英雄镜头，与镜头01呼应，强化品牌感]

    输出语言：${language === 'zh' ? '中文' : '英文'}。
    请返回一个 JSON 字符串数组。
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
export const generateStoryboardImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
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
