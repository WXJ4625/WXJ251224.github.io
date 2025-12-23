
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType } from "../types";

/**
 * 分析每一张参考图的具体内容
 */
export const analyzeIndividualImages = async (images: {id: string, data: string}[]): Promise<IndividualAnalysis[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-flash-preview';

  const results: IndividualAnalysis[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imagePart = {
      inlineData: {
        data: img.data.split(',')[1],
        mimeType: 'image/jpeg'
      }
    };

    const prompt = `你正在分析“参考图 ${i + 1}”。请详细描述这张图片中展示的产品部分、结构特征、材质细节以及它呈现的特定功能或角度。
    请重点捕捉产品的独特设计语言，以便后续生成保持一致性的分镜。
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

  const context = individualAnalyses.map((a, i) => `参考图 ${i+1} 分析结果: ${a.description}`).join('\n');
  const prompt = `基于以下对多张产品参考图的独立分析，请综合推导出该产品的全局核心档案。
  你的目标是提炼出该产品的本质结构和功能特征，确保后续生成的 9 宫格图像能完美继承这些“产品基因”。

  ${context}
  
  请按以下维度输出（用于分镜策划）：
  1. 产品细节 (Details): 综合外观结构、品牌标志位置、材质纹理。
  2. 产品用途 (Usage): 核心受众、核心功能展示。
  3. 使用演示 (HowToUse): 典型的交互或使用步骤演示逻辑。
  
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
    产品核心参数:
    - 视觉细节: ${profile.details}
    - 核心功能: ${profile.usage}
    - 使用逻辑: ${profile.howToUse}
    - 推荐场景: ${sceneType}
    
    任务：生成 ${quantity} 份独特且具有商业叙事感的分镜方案。
    要求：生成的 9 宫格图片必须严格参考“视觉细节”中的产品结构。

    格式规范 (请直接按此输出内容)：
    根据[${profile.details}>kx]，生成一张具有凝聚力的[3x3]网格图像，包含在同一环境中的[9]个不同摄像镜头，产品内外部结构完全一致，首尾镜头主体完全一致，严格保持人物/物体、服装和光线的一致性，[8K]分辨率，[16:9]画幅。
    镜头01: [广角镜头，展示产品在 ${sceneType} 场景中的整体状态]
    镜头02: [特写镜头，强调产品独特细节：${profile.details.slice(0, 30)}...]
    镜头03: [动作镜头，展示 ${profile.howToUse.slice(0, 30)}... 过程中的瞬间]
    镜头04: [结构镜头，展示产品内部或关键构造部件]
    镜头05: [创意视角，通过动感光影体现产品高级感]
    镜头06: [动作镜头，延续展示产品的功能特性]
    镜头07: [极近微距，捕捉品牌标识或精细材质纹理]
    镜头08: [生活化叙事镜头，展示产品在真实 ${sceneType} 中的应用]
    镜头09: [最终英雄镜头，与镜头01呼应，展示产品全貌]

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
 * 生成 9 宫格图片 (引入参考图以锁定产品结构)
 */
export const generateStoryboardImage = async (prompt: string, referenceImageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  // 将第一张上传的图片作为视觉参考传给模型
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
        { text: `Based on the provided reference image's product structure, material, and details, generate a professional 3x3 storyboard grid image as described in this prompt: ${prompt}. Maintain 100% structural consistency for the product across all 9 lenses.` }
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
 * 生成 16:9 的商业短视频
 */
export const generateVideo = async (
  prompt: string, 
  base64Image: string, 
  onStatusChange?: (status: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  onStatusChange?.("正在初始化 Veo 视频生成引擎...");
  
  const rawData = base64Image.split(',')[1];

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Smooth cinematic commercial, high end production value. Product motion: stable, fluid transitions. Consistent with provided reference structure. Lighting: professional. ${prompt}`,
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

  onStatusChange?.("视频生成中，正在为您渲染 10-15s 高清镜头...");

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    try {
      operation = await ai.operations.getVideosOperation({ operation: operation });
    } catch (e: any) {
      if (e.message?.includes("Requested entity was not found")) {
        throw new Error("API_KEY_EXPIRED");
      }
      throw e;
    }
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed.");

  onStatusChange?.("正在同步云端媒体流...");
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
