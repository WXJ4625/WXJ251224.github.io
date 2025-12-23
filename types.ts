
export interface IndividualAnalysis {
  id: string;
  description: string;
}

export interface ProductAnalysis {
  individualAnalyses: IndividualAnalysis[];
  globalProfile: {
    details: string;
    usage: string;
    howToUse: string;
  };
}

export type SceneType = 'Studio' | 'Lifestyle' | 'Outdoor' | 'Tech/Laboratory' | 'Cinematic' | 'Minimalist';

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING_INDIVIDUAL = 'ANALYZING_INDIVIDUAL',
  EDITING_INDIVIDUAL = 'EDITING_INDIVIDUAL',
  ANALYZING_GLOBAL = 'ANALYZING_GLOBAL',
  EDITING_GLOBAL = 'EDITING_GLOBAL',
  GENERATING_PROMPTS = 'GENERATING_PROMPTS',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  COMPLETED = 'COMPLETED'
}
