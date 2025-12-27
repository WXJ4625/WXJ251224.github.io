
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType, ProductPrompt, VideoResolution, VideoAspectRatio, VideoEngine } from "../types";

/**
 * 通用的重试包装函数，支持指数退避
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || "";
      if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("500") || errorMsg.includes("503")) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`检测到频率限制或服务器压力，将在 ${delay}ms 后进行第 ${i + 1} 次重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * 使用 Gemini 3 Pro 润色分镜脚本，生成专为 Veo 优化的“导演指令”
 */
export const refineVideoPromptWithGemini = async (
  script: string,
  profile: ProductAnalysis['globalProfile'],
  productName: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  const prompt = `你是一名世界级的商业视频导演。请将以下【分镜脚本】和【产品基因】转化成一段专为 Veo 3.1 视频生成模型设计的“高保真导演指令”。
  
  产品：${productName}
  结构特征：${profile.structure}
  材质细节：${profile.details}
  分镜脚本：${script}

  要求：
  1. 描述必须包含：光影动态（如：God rays, soft bokeh）、材质表现（如：Metalic sheen, micro-texture）、镜头平滑运动（如：Cinematic dolly zoom, macro pan）。
  2. 强调“结构一致性”：确保每一秒钟产品的物理形态都绝对稳定。
  3. 指令必须用【英文】输出，以获得最佳模型理解度。
  4. 只输出指令文本，不需要任何解释。`;

  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt
  }));

  return response.text || script;
};

export const analyzeIndividualImages = async (
  images: {id: string, data: string, type: 'image' | 'video'}[],
  productName: string
): Promise<IndividualAnalysis[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    const prompt = `分析产品“${productName}”的参考${isVideo ? '视频' : '图'}结构、细节、运动规律等。输出JSON: { "description": "..." }`;
    try {
      const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
        model,
        contents: { parts: [mediaPart, { text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { description: { type: Type.STRING } },
            required: ["description"]
          }
        }
      }));
      const parsed = JSON.parse(response.text || '{"description": "无法识别"}');
      results.push({ id: item.id, description: String(parsed.description || "无法识别") });
      if (images.length > 1 && i < images.length - 1) await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      results.push({ id: item.id, description: "分析失败" });
    }
  }
  return results;
};

export const synthesizeProductProfile = async (
  individualAnalyses: IndividualAnalysis[],
  productName: string
): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const context = individualAnalyses.map((a, i) => `参考分析 ${i+1}: ${a.description}`).join('\n');
  const prompt = `基于以下对产品“${productName}”的参考分析，提炼核心产品基因(Structure, Details, Audience, Scenarios, Motion)。输出JSON。 上下文：${context}`;
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          structure: { type: Type.STRING },
          details: { type: Type.STRING },
          audience: { type: Type.STRING },
          scenarios: { type: Type.STRING },
          motion: { type: Type.STRING }
        },
        required: ["structure", "details", "audience", "scenarios", "motion"]
      }
    }
  }));
  return JSON.parse(response.text || '{}') as ProductAnalysis['globalProfile'];
};

export const generateProductProfileFromText = async (
  productName: string
): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = `基于产品名称“${productName}”提供详细的产品基因档案(Structure, Details, Audience, Scenarios, Motion)。输出JSON。`;
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          structure: { type: Type.STRING },
          details: { type: Type.STRING },
          audience: { type: Type.STRING },
          scenarios: { type: Type.STRING },
          motion: { type: Type.STRING }
        },
        required: ["structure", "details", "audience", "scenarios", "motion"]
      }
    }
  }));
  return JSON.parse(response.text || '{}') as ProductAnalysis['globalProfile'];
};

export const generateStoryboards = async (
  profile: ProductAnalysis['globalProfile'], 
  productName: string,
  quantity: number, 
  language: 'zh' | 'en',
  sceneType: SceneType
): Promise<ProductPrompt[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  const systemInstruction = `你是一个顶级商业分镜策划师。擅长在${sceneType}场景下生成电影级分镜。遵循：${profile.structure}, ${profile.details}, ${profile.motion}。`;
  const prompt = `任务：为“${productName}”策划 ${quantity} 套分镜。每套包含1个全局指令和9个镜头。语言：${language}。`;
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            instruction: { type: Type.STRING },
            shots: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  cameraAngle: { type: Type.STRING },
                  lighting: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["cameraAngle", "lighting", "description"]
              }
            }
          },
          required: ["instruction", "shots"]
        }
      }
    }
  }));
  return JSON.parse(response.text || '[]') as ProductPrompt[];
};

export const generateGridImage = async (prompt: string, referenceImageBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const contentsParts: any[] = [];
  if (referenceImageBase64) {
    contentsParts.push({ inlineData: { data: referenceImageBase64.split(',')[1], mimeType: 'image/jpeg' } });
  }
  contentsParts.push({ text: `Create a professional 3x3 storyboard grid image. PROMPT: ${prompt}. Cinematic lighting. Consistent product based on reference.` });
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: contentsParts },
    config: { imageConfig: { aspectRatio: "16:9" } }
  }));
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("Image generation failed");
  return `data:image/png;base64,${part.inlineData.data}`;
};

export const generateVideoWithExtension = async (
  prompt: string, 
  referenceImageBase64: string, 
  config: {
    resolution: VideoResolution,
    aspectRatio: VideoAspectRatio,
    targetDuration: number,
    engine: VideoEngine
  },
  onStatusChange?: (msg: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imageData = referenceImageBase64.includes(',') ? referenceImageBase64.split(',')[1] : referenceImageBase64;
  
  onStatusChange?.(`启动 [${config.engine.includes('fast') ? 'Fast' : 'Pro'}] 渲染引擎...`);

  let operation: any = await withRetry(() => ai.models.generateVideos({
    model: config.engine,
    prompt: `Industrial high-end commercial video. 100% Product Consistency. ${prompt}`,
    image: { imageBytes: imageData, mimeType: 'image/jpeg' },
    config: { numberOfVideos: 1, resolution: config.resolution, aspectRatio: config.aspectRatio }
  }));

  while (!operation.done) {
    onStatusChange?.(`正在进行初始镜头渲染...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({operation: operation});
  }

  let finalVideo = operation.response?.generatedVideos?.[0]?.video;

  if (config.targetDuration > 5) {
    onStatusChange?.(`检测到延展需求，正在续写视频...`);
    const rounds = Math.ceil((config.targetDuration - 5) / 7);
    for (let i = 0; i < rounds; i++) {
      onStatusChange?.(`正在进行第 ${i + 1}/${rounds} 阶段延展 (每轮 +7s)...`);
      operation = await withRetry(() => ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `Continue the scene smoothly while maintaining product structural consistency. ${prompt}`,
        video: finalVideo,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: config.aspectRatio }
      }));
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }
      finalVideo = operation.response?.generatedVideos?.[0]?.video;
    }
  }

  if (!finalVideo?.uri) throw new Error("Video generation failed: Operation returned empty result.");
  return `${finalVideo.uri}&key=${process.env.API_KEY}`;
};
