
export interface IndividualAnalysis {
  id: string;
  description: string;
}

export interface ShotDetail {
  cameraAngle: string;
  lighting: string;
  description: string;
}

export interface ProductPrompt {
  instruction: string;
  shots: ShotDetail[];
}

export interface HistoryRecord {
  id: string;
  timestamp: number;
  productName: string;
  referenceImage: string;
  prompts: ProductPrompt[];
  analysis: ProductAnalysis;
}

export interface ProductAnalysis {
  individualAnalyses: IndividualAnalysis[];
  globalProfile: {
    structure: string;  // 产品结构
    details: string;    // 产品细节
    audience: string;   // 受众群体
    scenarios: string;  // 使用场景
    motion: string;     // 运动/动态规律
  };
}

export type SceneType = 'Studio' | 'Lifestyle' | 'Outdoor' | 'Tech/Laboratory' | 'Cinematic' | 'Minimalist';
export type VideoResolution = '720p' | '1080p';
export type VideoAspectRatio = '16:9' | '9:16';
export type VideoEngine = 'veo-3.1-fast-generate-preview' | 'veo-3.1-generate-preview';

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING_INDIVIDUAL = 'ANALYZING_INDIVIDUAL',
  EDITING_INDIVIDUAL = 'EDITING_INDIVIDUAL',
  ANALYZING_GLOBAL = 'ANALYZING_GLOBAL',
  EDITING_GLOBAL = 'EDITING_GLOBAL',
  GENERATING_PROMPTS = 'GENERATING_PROMPTS',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  GENERATING_VIDEO = 'GENERATING_VIDEO',
  COMPLETED = 'COMPLETED'
}
