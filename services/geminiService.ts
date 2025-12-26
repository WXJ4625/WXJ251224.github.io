
// Add comments above fixes
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType, ProductPrompt, VideoResolution, VideoAspectRatio } from "../types";

/**
 * 分析每一张参考图或视频的具体内容
 */
export const analyzeIndividualImages = async (
  images: {id: string, data: string, type: 'image' | 'video'}[],
  productName: string
): Promise<IndividualAnalysis[]> => {
  // Use direct process.env.API_KEY for initialization as required
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
    4. ${isVideo ? '运动规律 (Motion): 详细分析视频中的旋转方向、位移轨迹、组件开合的物理节奏，确保后续生成的每一段分镜视频能保持严格的一致性。' : '静态动势: 分析静态图中暗示的运动方向或视觉重心。'}
    
    输出格式为 JSON: { "description": "..." }`;

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
  // Use direct process.env.API_KEY for initialization as required
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const context = individualAnalyses.map((a, i) => `参考分析 ${i+1}: ${a.description}`).join('\n');
  const prompt = `基于以下对产品“${productName}”的参考分析，请综合提炼出核心产品基因，用于后续的高保真分镜视频渲染。
  确保提炼的信息能够让视频模型（如Veo）精准还原产品的物理属性，保持 100% 的结构一致性。

  按以下 5 个维度输出：
  1. 产品结构 (Structure): 产品的核心形体、组件构成、物理架构的详细描述。
  2. 产品细节 (Details): 材质细节、Logo、高光反射特征、微小接缝、按钮位置。
  3. 受众群体 (Audience): 核心目标用户与期望的品牌调性。
  4. 使用场景 (Scenarios): 典型应用环境的视觉元素。
  5. 运动规律 (Motion): 提炼出产品在运动时的典型方向、旋转轴心 and 速度感，确保后续生成的每一段视频片段中运动方向保持严格一致。

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
  // Use direct process.env.API_KEY for initialization as required
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `你是一个专业的产品策划。请基于产品名称“${productName}”提供一份详细的产品基因档案，用于后续生成分镜。
  请按以下 5 个维度输出：
  1. 产品结构 (Structure): 典型的物理架构。
  2. 产品细节 (Details): 常见的材质与设计特征。
  3. 受众群体 (Audience): 典型的用户画像。
  4. 使用场景 (Scenarios): 常见的使用环境。
  5. 运动规律 (Motion): 该产品在商业广告中应有的典型动态表现。
  
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
  // Use direct process.env.API_KEY for initialization as required
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  const systemInstruction = `你是一个顶级商业分镜策划师。你擅长根据产品细节，在指定的${sceneType}场景下生成电影级分镜。
  
  交付原则：
  - 物理结构一致性：严格遵循 ${profile.structure}，不能改变产品的基本形状 and 部件。
  - 细节表现力：最大化展现 ${profile.details}，包括特定的 Logo 位置 and 材质质感。
  - 动态连贯性：所有动态镜头必须符合 ${profile.motion} 的物理逻辑，运动方向需保持统一。
  
  人物设定：
  - 默认模特：除非另有说明，所有模特均默认为“顶级欧美模特 (Western Models)”，拥有极致的商业时尚感。
  
  分镜生成准则：
  1. 为每个镜头分配具体的摄像机角度 and 光影环境。
  2. 详细描述模特与产品的互动动作，互动时必须尊重产品的物理结构 ${profile.structure}。
  3. 保持产品在不同镜头间的高度一致性，重点展示 ${profile.details}。
  4. 每一段视频的首尾帧必须展示完整且一致的产品结构，确保品牌呈现的专业性。`;

  const prompt = `
    任务：为产品“${productName}”策划 ${quantity} 套分镜。
    每套包含 1 个全局指令 and 9 个极具视觉表现力的镜头。
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
  // Use direct process.env.API_KEY for initialization as required
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
  Western fashion models. High-end cinematic lighting. 
  MANDATORY: Maintain 100% product structural and detail consistency across all grid cells based on the reference image provided.` });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: contentsParts },
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
 * 渲染分镜视频片段
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
  // Use direct process.env.API_KEY for initialization as required
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const imageData = referenceImageBase64.split(',')[1];
  
  onStatusChange?.(`启动 Veo 渲染流水线...`);

  // Initial shot generation with first and last frame consistency
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Professional high-end product commercial shot. Smooth cinematic motion. Western models. 
    ULTRA-CONSISTENCY MODE: The product must precisely match the reference image's structure, components, and textures at BOTH the start and end of the video. 
    Maintain 100% structural accuracy. No modification to the product design allowed. 
    Context: ${prompt}`,
    image: {
      imageBytes: imageData,
      mimeType: 'image/jpeg',
    },
    config: {
      numberOfVideos: 1,
      resolution: config.resolution,
      aspectRatio: config.aspectRatio,
      lastFrame: {
        imageBytes: imageData,
        mimeType: 'image/jpeg',
      }
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  let finalVideo = operation.response?.generatedVideos?.[0]?.video;
  if (!finalVideo) throw new Error("Video generation failed.");

  // Extension logic for longer shots (if resolution permits)
  if (config.targetDuration > 7 && config.resolution === '720p') {
    const extensionsNeeded = Math.floor((config.targetDuration - 5) / 7);
    for (let i = 0; i < extensionsNeeded; i++) {
      onStatusChange?.(`延展片段时长 (${i + 1}/${extensionsNeeded})...`);
      let extOp = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `Continue the cinematic motion naturally while preserving all product details and model appearance. Ensure the product remains structurally consistent with the original design. ${prompt}`,
        video: finalVideo,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: config.aspectRatio
        }
      });

      while (!extOp.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        extOp = await ai.operations.getVideosOperation({ operation: extOp });
      }
      
      const newVideo = extOp.response?.generatedVideos?.[0]?.video;
      if (newVideo) finalVideo = newVideo;
      else break;
    }
  }

  const downloadLink = finalVideo.uri;
  if (!downloadLink) throw new Error("Download link missing.");

  onStatusChange?.("分发媒体资源...");
  // Use direct process.env.API_KEY for fetch
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
