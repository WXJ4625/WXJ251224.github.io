
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType, ProductPrompt, VideoResolution, VideoAspectRatio } from "../types";

/**
 * 分析每一张参考图或视频的具体内容
 */
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

    const prompt = `你正在分析产品“${productName}”的参考${isVideo ? '视频' : '图'}。请从以下维度进行深度分析：
    1. 产品结构 (Structure): 物理架构、组件关系、核心几何特征、每个部件的连接方式。
    2. 产品细节 (Details): 材质纹理、Logo位置、精致的微小设计细节、高光表现、颜色梯度。
    3. 产品使用 (Usage): 交互方式、功能演示逻辑、人机工程。
    4. ${isVideo ? '运动规律 (Motion): 详细分析视频中的旋转方向、位移轨迹、组件开合的物理节奏。' : '静态动势: 分析静态图中暗示的运动方向或视觉重心。'}
    
    输出格式为 JSON: { "description": "..." }`;

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
      results.push({ id: item.id, description: String(parsed.description || "无法识别") });
    } catch (e) {
      console.error("Individual image analysis failed", e);
      results.push({ id: item.id, description: "分析失败" });
    }
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const context = individualAnalyses.map((a, i) => `参考分析 ${i+1}: ${a.description}`).join('\n');
  const prompt = `基于以下对产品“${productName}”的参考分析，请综合提炼出核心产品基因。
  确保提炼的信息能够让视频模型精准还原产品的物理属性，保持 100% 的结构一致性。

  按以下 5 个维度输出：
  1. 产品结构 (Structure): 产品的核心形体、组件构成。
  2. 产品细节 (Details): 材质细节、Logo、微小特征。
  3. 受众群体 (Audience): 核心目标用户与品牌调性。
  4. 使用场景 (Scenarios): 典型应用环境。
  5. 运动规律 (Motion): 提炼出产品在运动时的典型方向、旋转轴心。

  上下文：
  ${context}
  
  输出格式为 JSON。`;

  const response = await ai.models.generateContent({
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
  });

  return JSON.parse(response.text || '{}') as ProductAnalysis['globalProfile'];
};

/**
 * 根据产品名称直接生成档案
 */
export const generateProductProfileFromText = async (
  productName: string
): Promise<ProductAnalysis['globalProfile']> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `你是一个专业的产品策划。请基于产品名称“${productName}”提供一份详细的产品基因档案。
  按以下 5 个维度输出：结构 (Structure)、细节 (Details)、受众 (Audience)、场景 (Scenarios)、运动规律 (Motion)。
  输出格式为 JSON。`;

  const response = await ai.models.generateContent({
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
): Promise<ProductPrompt[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  const systemInstruction = `你是一个顶级商业分镜策划师。擅长在${sceneType}场景下生成电影级分镜。
  
  核心交付原则：
  - 物理结构一致性：严格遵循 ${profile.structure}。
  - 细节表现力：展现 ${profile.details}。
  - 动态连贯性：运动必须符合 ${profile.motion}。
  
  分镜生成准则：
  1. 为每个镜头分配摄像机角度 and 光影。
  2. 保持产品高度一致性。
  3. 每一段视频的首尾帧必须展示完整且一致的产品结构。`;

  const prompt = `
    任务：为产品“${productName}”策划 ${quantity} 套分镜。
    每套包含 1 个全局指令 and 9 个镜头。
    视觉风格: ${sceneType}
    输出语言：${language === 'zh' ? '中文' : '英文'}。
  `;

  const response = await ai.models.generateContent({
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
  });

  return JSON.parse(response.text || '[]') as ProductPrompt[];
};

/**
 * 生成 3x3 预览图
 */
export const generateGridImage = async (prompt: string, referenceImageBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const contentsParts: any[] = [];
  
  if (referenceImageBase64) {
    contentsParts.push({
      inlineData: {
        data: referenceImageBase64.split(',')[1],
        mimeType: 'image/jpeg'
      }
    });
  }

  contentsParts.push({ text: `Create a professional 3x3 storyboard grid image. 
  PROMPT: ${prompt}. 
  Western models. Cinematic lighting. 
  MANDATORY: Maintain 100% product structural and detail consistency across all grid cells based on the provided reference.` });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: contentsParts },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (!part?.inlineData) throw new Error("Image generation failed");
  return `data:image/png;base64,${part.inlineData.data}`;
};

/**
 * 渲染分镜视频成片
 * Implement video generation with potential extension based on target duration
 */
export const generateVideoWithExtension = async (
  prompt: string, 
  referenceImageBase64: string, 
  config: {
    resolution: VideoResolution,
    aspectRatio: VideoAspectRatio,
    targetDuration: number
  },
  onStatusChange?: (msg: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imageData = referenceImageBase64.includes(',') ? referenceImageBase64.split(',')[1] : referenceImageBase64;
  
  onStatusChange?.(`启动 Veo 渲染流水线...`);

  // Initial shot generation with strict consistency
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Industrial high-end commercial video. 
    Product Consistency: The product in this video MUST exactly match the provided reference image in structure, color, and texture at ALL TIMES. Script: ${prompt}`,
    image: {
      imageBytes: imageData,
      mimeType: 'image/jpeg',
    },
    config: {
      numberOfVideos: 1,
      resolution: config.resolution,
      aspectRatio: config.aspectRatio
    }
  });

  while (!operation.done) {
    onStatusChange?.(`正在进行初始镜头渲染...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({operation: operation});
  }

  let finalVideo = operation.response?.generatedVideos?.[0]?.video;

  // Extension logic: if requested duration > 5s (standard Veo output is ~5s)
  if (config.targetDuration > 5) {
    onStatusChange?.(`检测到延展需求，正在续写视频...`);
    // Each extension adds 7s. Calculate rounds.
    const rounds = Math.ceil((config.targetDuration - 5) / 7);
    
    for (let i = 0; i < rounds; i++) {
      onStatusChange?.(`正在进行第 ${i + 1}/${rounds} 阶段延展 (每轮 +7s)...`);
      // Extension must use 'veo-3.1-generate-preview' and '720p'
      operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `Continue the scene smoothly while maintaining product structural consistency. ${prompt}`,
        video: finalVideo,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: config.aspectRatio
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }
      finalVideo = operation.response?.generatedVideos?.[0]?.video;
    }
  }

  if (!finalVideo?.uri) {
    throw new Error("Video generation failed: Operation returned empty result.");
  }

  // Return final URI with API key for playback/download
  return `${finalVideo.uri}&key=${process.env.API_KEY}`;
};
