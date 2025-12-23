
export interface ProductAnalysis {
  details: string;
  usage: string;
  howToUse: string;
}

export type SceneType = 'Studio' | 'Lifestyle' | 'Outdoor' | 'Tech/Laboratory' | 'Cinematic' | 'Minimalist';

export interface StoryboardItem {
  id: number;
  description: string;
}

export interface GeneratedPrompt {
  language: 'zh' | 'en';
  fullPrompt: string;
  shots: string[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  EDITING_ANALYSIS = 'EDITING_ANALYSIS',
  GENERATING_PROMPTS = 'GENERATING_PROMPTS',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  COMPLETED = 'COMPLETED'
}
