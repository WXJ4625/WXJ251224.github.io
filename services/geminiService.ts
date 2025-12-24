
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType } from "../types";

/**
 * 分析每一张参考图或视频的具体内容，增强了对视频动态和关键帧的解析
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
         1. 静态描述：识别视频中展示的产品核心组件、材质（如磨砂、金属、透明等）和品牌标识。
         2. 动态分析：详细描述视频中的运动特性。包括旋转、折叠、伸缩或模特的交互动作。
         3. 结构变化：分析在运动过程中产品的外观结构如何演变。
         4. 关键帧特征：提取视频中最重要的视觉锚点细节。
         
         你的分析将直接用于生成高一致性的 9 宫格分镜。
         输出格式为 JSON: { "description": "产品静态描述", "motionDynamics": "动态运动与结构演变分析" }`
      : `你正在分析产品“${productName}”的参考图。
         请详细描述其中展示的产品部分、结构特征、材质细节、光影表现以及其呈现的特定功能角度。
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
 * 综合所有参考图分析，推导出全局产品属性
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

  const prompt = `基于以下对产品“${productName}”的多维参考资料（包含静态结构和动态视频分析），请综合提炼该产品的全局核心档案。
  
  你需要整合视频中表现出的动态结构一致性，确保后续生成的 9 宫格图像能完美继承产品的“运动基因”和“结构逻辑”。

  资料汇总：
  ${context}
  
  请按以下维度输出（用于分镜策划）：
  1. 产品细节 (Details): 综合外观、材质细节、品牌标识在不同动态下的稳定性。
  2. 产品用途 (Usage): 核心受众、产品在动态场景中的功能表现。
  3. 使用演示 (HowToUse): 典型的交互逻辑，包含视频中捕捉到的手势、动作方向和结构反馈。
  
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
  productName: string,
  quantity: number, 
  language: 'zh' | 'en',
  sceneType: SceneType
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-pro-preview';

  const systemInstruction = language === 'zh' 
    ? `你是一个专业的产品分镜策划师。你擅长根据产品“${productName}”的细节，在指定的${sceneType}场景下生成电影级、高凝聚力的3x3网格分镜提示词。
       重要指令：如果分镜中涉及模特/人物与产品的互动，你必须利用提炼出的“使用演示”逻辑，在每个分镜中详细描述互动细节，包括肢体动作、具体的接触点、互动的具体方向和力度感。这些细节必须明确以确保AI生成时的物理一致性。`
    : `You are a professional product storyboard planner for "${productName}". You excel at generating cinematic, highly cohesive 3x3 grid storyboard prompts under the specified ${sceneType} scene setting.
       CRITICAL INSTRUCTION: Utilize the extracted "HowToUse" logic to detail interaction: specific gestures, contact points, and direction/force. These details must be explicit to ensure physical consistency in AI generation.`;

  const templatePrompt = `
    产品名称: ${productName}
    核心参数:
    - 视觉细节: ${profile.details}
    - 核心功能: ${profile.usage}
    - 使用逻辑: ${profile.howToUse}
    - 场景环境: ${sceneType}
    
    任务：生成 ${quantity} 份独特且具有商业叙事感的分镜方案。
    要求：生成的 9 宫格图片必须严格参考“视觉细节”中的产品结构。

    格式规范 (请直接按此输出内容)：
    根据[${profile.details}>kx]，生成一张具有凝聚力的[3x3]网格图像，包含在同一环境中的[9]个不同摄像镜头，产品内外部结构完全一致，首尾镜头主体完全一致，严格保持人物/物体、服装和光线的一致性，[8K]分辨率，[16:9]画幅。
    镜头01: [广角镜头，展示产品在 ${sceneType} 场景中的整体状态，以及模特的基本交互姿态]
    镜头02: [特写镜头，强调产品独特细节：${profile.details.slice(0, 30)}...]
    镜头03: [动作镜头，详细描述模特动作：展示 ${profile.howToUse.slice(0, 30)}... 过程中的指尖力度与产品互动]
    镜头04: [结构镜头，展示产品内部或关键构造部件]
    镜头05: [创意视角，通过动感光影体现产品高级感，描述模特侧脸与光线的交汇]
    镜头06: [动作镜头，延续展示产品的功能特性，明确手部与产品的接触方向]
    镜头07: [极近微距，捕捉品牌标识或精细材质纹理，伴随模特皮肤质感的对比]
    镜头08: [生活化叙事镜头，展示产品在真实 ${sceneType} 中的应用，包含模特的自然肢体舒展]
    镜头09: [最终英雄镜头，与镜头01呼应，展示产品全貌及模特自信的掌控感]

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
        { text: `Based on the provided reference image's product structure, material, and details, generate a professional 3x3 storyboard grid image. 
        PROMPT: ${prompt}. 
        STRICT REQUIREMENT: Maintain 100% structural consistency for the product and precise human-product interaction as described.` }
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
    prompt: `Smooth cinematic commercial, high end production value. Cinematic interaction with the product. Realistic motion. Consistent with reference. ${prompt}`,
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

  onStatusChange?.("视频生成中...");

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

  onStatusChange?.("同步中...");
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
