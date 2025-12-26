
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProductAnalysis, IndividualAnalysis, SceneType, ProductPrompt } from "../types";

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
    1. 产品结构 (Structure): 物理架构、组件关系。
    2. 产品细节 (Details): 材质细节、Logo、微小特征。
    3. 产品使用 (Usage): 交互方式、功能演示逻辑。
    4. ${isVideo ? '运动规律 (Motion): 分析视频中的动态过程，包括旋转方向、位移轨迹、组件开合等运动规律，确保后续分镜能保持一致的动感。' : '静态动势: 分析静态图中暗示的运动潜力或视觉重心。'}
    
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
    results.push({ id: item.id, description: parsed.description });
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
  const prompt = `基于以下对产品“${productName}”的参考分析，请综合提炼出核心产品基因，按以下 5 个维度输出：
  1. 产品结构 (Structure): 产品的核心形体、组件构成、物理架构。
  2. 产品细节 (Details): 材质纹理、Logo位置、精致的微小设计。
  3. 受众群体 (Audience): 核心目标用户。
  4. 使用场景 (Scenarios): 典型应用环境。
  5. 运动规律 (Motion): 提炼出产品在运动时的典型方向、速度感和动力学特征，确保后续生成的镜头中运动方向保持一致。

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

  const prompt = `你是一个专业的产品专家。请基于产品名称“${productName}”提供一份详细的产品档案，用于生成分镜。
  请按以下 5 个维度输出：
  1. 产品结构 (Structure): 典型的物理架构。
  2. 产品细节 (Details): 常见的材质与设计特征。
  3. 受众群体 (Audience): 典型的用户画像。
  4. 使用场景 (Scenarios): 常见的使用环境。
  5. 运动规律 (Motion): 预设该产品在商业广告中应有的典型动态表现。
  
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

  return JSON.parse(response.text || '{}');
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

  const systemInstruction = `你是一个专业的产品分镜策划师。你擅长根据产品细节，在指定的${sceneType}场景下生成电影级、高凝聚力的3x3网格分镜。
  你必须严格遵循产品基因：
  - 结构一致性：${profile.structure}
  - 细节表现：${profile.details}
  - 运动/方向一致性：${profile.motion}（重要：确保所有动态镜头的运动方向、旋转逻辑与此处描述一致）
  - 受众呼应：${profile.audience}
  - 场景契合：${profile.scenarios}
  
  重要指令：
  1. 为每个镜头分配具体的摄像机角度 and 光影环境。
  2. 详细描述模特（如有）与产品的互动，互动动作应符合${profile.motion}中的逻辑。`;

  const prompt = `
    任务：为产品“${productName}”生成 ${quantity} 份独立的分镜方案。
    每份方案包含 1 个总指令和 9 个详细镜头描述。
    场景风格: ${sceneType}
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
 * 生成 9 宫格图片
 */
export const generateGridImage = async (prompt: string, referenceImageBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const contents: any[] = [];
  
  if (referenceImageBase64) {
    contents.push({
      inlineData: {
        data: referenceImageBase64.split(',')[1],
        mimeType: 'image/jpeg'
      }
    });
  }

  contents.push({ text: `Generate a high-end commercial 3x3 storyboard grid image. 
  PROMPT: ${prompt}. 
  Ensure strict consistency in product structure and motion logic.` });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: contents },
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
 * 生成商业视频 (Veo)
 */
export const generateVideo = async (
  prompt: string, 
  referenceImageBase64: string, 
  resolution: '720p' | '1080p' = '1080p'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const imageData = referenceImageBase64.split(',')[1];
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Cinematic commercial video for a product. High production value. Smooth motion. Maintain product structural consistency. ${prompt}`,
    image: {
      imageBytes: imageData,
      mimeType: 'image/jpeg',
    },
    config: {
      numberOfVideos: 1,
      resolution: resolution,
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation returned no download link.");

  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
