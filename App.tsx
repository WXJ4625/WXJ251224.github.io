
import React, { useState, useEffect } from 'react';
import { 
  Camera, Trash2, Search, Loader2, Zap, Copy, ImageIcon, Sparkles, LayoutGrid, FileDown, 
  Package, X, History, ChevronRight, Box, AlertCircle, Edit3, Scan, Users, MapPin, CheckCircle2, Save, Download, Video, Play, Activity, Clock, Layers, Maximize2, ChevronDown, ChevronUp, Monitor, ZapOff, Trash, Cpu, Wand2
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, HistoryRecord, ProductPrompt, VideoResolution, VideoAspectRatio, VideoEngine } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateProductProfileFromText, generateGridImage, generateVideoWithExtension, refineVideoPromptWithGemini } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];
const DURATION_OPTIONS = [
  { label: '5-7s (标准)', value: 5 },
  { label: '12-14s (延长)', value: 12 },
  { label: '19-21s (中长)', value: 19 }
];

const compressImage = (base64Str: string, maxWidth = 200): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve('');
  });
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [productName, setProductName] = useState<string>('');
  const [images, setImages] = useState<{id: string, data: string, type: 'image' | 'video'}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  
  const [generatedPrompts, setGeneratedPrompts] = useState<ProductPrompt[]>([]);
  const [editablePrompts, setEditablePrompts] = useState<string[]>([]);
  const [refinedPrompts, setRefinedPrompts] = useState<Record<number, string>>({});
  const [refining, setRefining] = useState<Record<number, boolean>>({});
  
  const [gridImages, setGridImages] = useState<Record<number, string>>({});
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
  
  const [setVideoUrls, setSetVideoUrls] = useState<Record<number, string>>({});
  const [setVideoLoading, setSetVideoLoading] = useState<Record<number, boolean>>({});
  const [setVideoStatus, setSetVideoStatus] = useState<Record<number, string>>({});

  const [videoResolution, setVideoResolution] = useState<VideoResolution>('1080p');
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [videoEngine, setVideoEngine] = useState<VideoEngine>('veo-3.1-fast-generate-preview');
  const [targetDuration, setTargetDuration] = useState<number>(5);

  const [error, setError] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [expandedSets, setExpandedSets] = useState<Record<number, boolean>>({ 0: true });

  // Modified handleError to handle API key selection resets based on guidelines
  const handleError = (err: any) => {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.includes("500") || message.includes("503")) {
      setError("API 频率限制或服务器压力。请等待 1 分钟，或切换“渲染引擎”。");
    } else if (message.includes("Requested entity was not found")) {
      setError("API Key 效验失败或权限不足，请重新选择有效的付费项目 Key。");
      /* @ts-ignore */
      if (window.aistudio && window.aistudio.openSelectKey) {
        /* @ts-ignore */
        window.aistudio.openSelectKey();
      }
    } else {
      setError(message || "未知错误");
    }
    setState(AppState.IDLE);
  };

  useEffect(() => {
    const stored = localStorage.getItem('storyboard_history');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setHistory(parsed as HistoryRecord[]);
      } catch (e) {}
    }
  }, []);

  const formatPromptForEditing = (p: ProductPrompt): string => {
    let text = `【全局调性】: ${p.instruction}\n\n`;
    p.shots.forEach((shot, i) => {
      text += `镜头 ${i + 1} [${shot.cameraAngle} | ${shot.lighting}]: ${shot.description}\n`;
    });
    return text;
  };

  const saveToHistory = async (prompts: ProductPrompt[], currentAnalysis: ProductAnalysis) => {
    const originalRef = images.find(i => i.type === 'image')?.data || images[0]?.data || '';
    const thumbnail = originalRef ? await compressImage(originalRef) : '';
    const newRecord: HistoryRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      productName: productName || '未命名产品',
      referenceImage: thumbnail,
      prompts: JSON.parse(JSON.stringify(prompts)),
      analysis: JSON.parse(JSON.stringify(currentAnalysis))
    };
    const updated = [newRecord, ...history].slice(0, 12);
    setHistory(updated);
    try {
      localStorage.setItem('storyboard_history', JSON.stringify(updated));
    } catch (e) {
      localStorage.setItem('storyboard_history', JSON.stringify(updated.slice(0, 3)));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    files.forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, { 
            id: Math.random().toString(36).substr(2, 9), 
            data: ev.target!.result as string, 
            type: isVideo ? 'video' : 'image' 
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const startIndividualAnalysis = async () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setState(AppState.ANALYZING_INDIVIDUAL);
    setError(null);
    try {
      const raw = await analyzeIndividualImages(images, productName);
      const profile = await synthesizeProductProfile(raw, productName);
      const newAnalysis = { individualAnalyses: raw, globalProfile: profile };
      setAnalysis(newAnalysis);
      setState(AppState.EDITING_GLOBAL);
    } catch (err: any) { handleError(err); }
  };

  const handleRefineWithGemini = async (idx: number) => {
    if (!analysis) return;
    setRefining(prev => ({ ...prev, [idx]: true }));
    try {
      const refined = await refineVideoPromptWithGemini(editablePrompts[idx], analysis.globalProfile, productName);
      setRefinedPrompts(prev => ({ ...prev, [idx]: refined }));
    } catch (err: any) {
      handleError(err);
    } finally {
      setRefining(prev => ({ ...prev, [idx]: false }));
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    try {
      const results = await generateStoryboards(analysis.globalProfile, productName, promptCount, language, sceneType);
      setGeneratedPrompts(results);
      setEditablePrompts(results.map(p => formatPromptForEditing(p)));
      await saveToHistory(results, analysis);
      setState(AppState.COMPLETED);
    } catch (err: any) { handleError(err); }
  };

  // Added handleGenerateImage function to fix the "Cannot find name 'handleGenerateImage'" error
  const handleGenerateImage = async (setIdx: number) => {
    const basePrompt = refinedPrompts[setIdx] || editablePrompts[setIdx] || "";
    // Find the first image to use as a consistent reference
    const firstImg = images.find(img => img.type === 'image');
    
    setImageLoading(prev => ({ ...prev, [setIdx]: true }));
    setError(null);
    try {
      const imageUrl = await generateGridImage(basePrompt, firstImg?.data);
      setGridImages(prev => ({ ...prev, [setIdx]: imageUrl }));
    } catch (err: any) {
      handleError(err);
    } finally {
      setImageLoading(prev => ({ ...prev, [setIdx]: false }));
    }
  };

  const handleGenerateFullVideo = async (setIdx: number, mode: 'grid' | 'direct' = 'grid') => {
    const aistudio = (window as any).aistudio;
    const hasKey = (await aistudio.hasSelectedApiKey()) as boolean;
    if (!hasKey) await aistudio.openSelectKey();

    const basePrompt = refinedPrompts[setIdx] || editablePrompts[setIdx] || "";
    let referenceVisual = "";
    if (mode === 'grid') {
      referenceVisual = gridImages[setIdx] || "";
      if (!referenceVisual) { setError("请先生成分镜大图。"); return; }
    } else {
      const firstImg = images.find(img => img.type === 'image');
      if (!firstImg) { setError("流水线中没有可用的产品图片。"); return; }
      referenceVisual = firstImg.data;
    }
    
    setSetVideoLoading(prev => ({ ...prev, [setIdx]: true }));
    try {
      const videoUrl = await generateVideoWithExtension(basePrompt, referenceVisual, {
        resolution: videoResolution,
        aspectRatio: videoAspectRatio,
        targetDuration: targetDuration,
        engine: videoEngine
      }, (msg: string) => setSetVideoStatus(prev => ({ ...prev, [setIdx]: msg })));
      setSetVideoUrls(prev => ({ ...prev, [setIdx]: videoUrl }));
    } catch (err: any) {
      handleError(err); 
    } finally { setSetVideoLoading(prev => ({ ...prev, [setIdx]: false })); }
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [idx]: true }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [idx]: false })), 2000);
    });
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32">
      <header className="flex flex-col md:flex-row items-center justify-between mb-16 gap-10">
        <div className="text-left">
          <div className="inline-flex items-center gap-4 p-4 bg-black rounded-3xl mb-6 shadow-xl">
             <Sparkles className="text-white w-8 h-8" />
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Storyboard Pro</h1>
          </div>
          <p className="text-slate-400 text-lg font-medium">Gemini 3 策划与 Veo 渲染协同流水线</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowHistory(true)} className="px-6 py-3 bg-slate-100 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-200 transition-all shadow-sm"><History className="w-5 h-5" /> 历史记录</button>
          <button onClick={async () => { /* @ts-ignore */ await (window as any).aistudio.openSelectKey(); }} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-sm shadow-xl hover:bg-slate-800 transition-all">云鉴权</button>
        </div>
      </header>

      {/* STEP 1: ASSETS */}
      <section className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 mb-16 shadow-sm">
        <div className="flex items-center gap-6 mb-10">
          <span className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center text-xl font-black shadow-lg">01</span>
          <h2 className="text-3xl font-black tracking-tight">产品核心资产</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-6 mb-10">
          {images.map((img) => (
            <div key={img.id} className="relative aspect-square rounded-[2rem] overflow-hidden border-2 border-white shadow-md bg-white">
              {img.type === 'video' ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100">
                  <Play className="w-8 h-8 text-slate-400 mb-1" />
                  <span className="text-[8px] font-black uppercase text-slate-400">Video Ref</span>
                </div>
              ) : (
                <img src={img.data} className="w-full h-full object-cover" />
              )}
              <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-xl shadow-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <label className="aspect-square flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:bg-white transition-all group hover:border-black">
            <Camera className="w-6 h-6 text-slate-300 group-hover:text-black mb-2" />
            <span className="text-[10px] font-black uppercase text-slate-400">添加资产</span>
            <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} />
          </label>
        </div>
        <div className="mb-10">
          <input type="text" placeholder="请输入产品名称，如：智能美妆镜" className="w-full p-8 text-2xl font-black bg-white border-2 border-slate-100 rounded-[2.5rem] outline-none focus:border-black shadow-inner" value={productName} onChange={(e) => setProductName(e.target.value)} />
        </div>
        <button onClick={startIndividualAnalysis} disabled={images.length === 0 || !productName || state.includes('ANALYZING')} className="w-full py-7 bg-black text-white rounded-[2.5rem] font-black text-lg flex items-center justify-center gap-4 shadow-2xl disabled:bg-slate-200 transition-all">
          {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-7 h-7 animate-spin" /> : <><Search className="w-7 h-7" /> 启动 Gemini 资产深度扫描</>}
        </button>
      </section>

      {/* STEP 2: CONFIG */}
      {analysis && (
        <section className="bg-slate-50 p-10 rounded-[4rem] border border-slate-100 mb-16 shadow-sm">
          <div className="flex items-center gap-6 mb-10">
            <span className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-black shadow-xl">02</span>
            <h2 className="text-3xl font-black tracking-tight">渲染引擎配置</h2>
          </div>
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 mb-12 space-y-12">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div>
                   <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block">视觉引擎 (Rendering Engine)</label>
                   <div className="flex p-2 bg-slate-100 rounded-3xl gap-2">
                      <button onClick={() => setVideoEngine('veo-3.1-fast-generate-preview')} className={`flex-1 py-4 rounded-2xl font-black text-[11px] transition-all ${videoEngine.includes('fast') ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400'}`}>Veo Fast (推荐)</button>
                      <button onClick={() => setVideoEngine('veo-3.1-generate-preview')} className={`flex-1 py-4 rounded-2xl font-black text-[11px] transition-all ${!videoEngine.includes('fast') ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-400'}`}>Veo Standard (高保真)</button>
                   </div>
                </div>
                <div className="flex gap-8">
                   <div className="flex-1">
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block">策划套数</label>
                      <input type="number" value={promptCount} onChange={e => setPromptCount(parseInt(e.target.value))} className="w-full p-4 bg-slate-50 rounded-2xl font-black text-center" min="1" max="10" />
                   </div>
                   <div className="flex-1">
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block">场景风格</label>
                      <select value={sceneType} onChange={e => setSceneType(e.target.value as any)} className="w-full p-4 bg-slate-50 rounded-2xl font-black text-xs outline-none">
                        {SCENE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                   </div>
                </div>
             </div>
          </div>
          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-9 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl flex items-center justify-center gap-5 shadow-2xl hover:bg-indigo-700 transition-all">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Zap className="w-10 h-10" /> 生成高精策划方案</>}
          </button>
        </section>
      )}

      {/* STEP 3: OUTPUT */}
      {editablePrompts.length > 0 && (
        <section className="space-y-16">
          <div className="bg-black p-10 rounded-[3.5rem] text-white flex justify-between items-center shadow-2xl">
            <h2 className="text-3xl font-black flex items-center gap-5"><Package className="w-10 h-10 text-indigo-400" /> 已就绪分镜库</h2>
            <div className="flex gap-4">
               <div className="px-6 py-3 bg-white/10 rounded-2xl flex items-center gap-4">
                  <span className="text-[11px] font-black text-emerald-400 uppercase italic">Gemini Directed • Veo Powered</span>
               </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-20">
             {editablePrompts.map((promptText, setIdx) => (
               <div key={setIdx} className="bg-white p-10 rounded-[4.5rem] border-2 border-slate-100 shadow-2xl flex flex-col gap-12 relative overflow-hidden">
                  <div className="flex items-center justify-between border-b pb-10">
                    <span className="px-8 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-base italic">方案 {setIdx + 1}</span>
                    <div className="flex gap-4">
                      <button onClick={() => handleRefineWithGemini(setIdx)} disabled={refining[setIdx]} className="flex items-center gap-3 text-amber-600 font-black text-sm bg-amber-50 px-8 py-4 rounded-[1.5rem] border-2 border-amber-100 hover:bg-amber-100 transition-all">
                        {refining[setIdx] ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                        Gemini 导演润色
                      </button>
                      <button onClick={() => copyToClipboard(promptText, setIdx)} className="flex items-center gap-3 text-indigo-600 font-black text-sm bg-indigo-50 px-8 py-4 rounded-[1.5rem] border-2 border-indigo-100 hover:bg-indigo-100 transition-all">
                        {copyStates[setIdx] ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />} 复制脚本
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-16">
                      <div className="flex-1 space-y-8 flex flex-col">
                        <div className="flex-1 flex flex-col gap-4">
                           <label className="text-[12px] font-black uppercase text-slate-400 flex items-center gap-3">导演脚本 (Script)</label>
                           <textarea className="w-full flex-1 min-h-[400px] p-10 text-base font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-[3rem] border-2 border-transparent focus:border-indigo-100 outline-none transition-all" value={promptText} onChange={(e) => {
                             const next = [...editablePrompts];
                             next[setIdx] = e.target.value;
                             setEditablePrompts(next);
                           }} />
                        </div>
                        {refinedPrompts[setIdx] && (
                          <div className="bg-amber-50/50 p-8 rounded-[2.5rem] border-2 border-amber-100/50 animate-in slide-in-from-top-4">
                             <div className="flex items-center gap-3 mb-4">
                                <Sparkles className="w-5 h-5 text-amber-600" />
                                <span className="text-[11px] font-black uppercase text-amber-600">Gemini 导演已增强渲染指令</span>
                             </div>
                             <p className="text-xs text-amber-700 font-medium italic line-clamp-3 leading-relaxed">{refinedPrompts[setIdx]}</p>
                          </div>
                        )}
                        <button onClick={() => handleGenerateImage(setIdx)} disabled={imageLoading[setIdx]} className="w-full py-7 bg-slate-900 text-white rounded-[2rem] font-black text-base flex items-center justify-center gap-4 shadow-xl">
                          {imageLoading[setIdx] ? <Loader2 className="w-6 h-6 animate-spin" /> : <><ImageIcon className="w-6 h-6" /> 重新渲染 3x3 预览</>}
                        </button>
                      </div>

                      <div className="w-full xl:w-[600px] space-y-8">
                        <div className="aspect-[16/9] bg-slate-100 rounded-[3.5rem] border-2 border-dashed flex items-center justify-center relative overflow-hidden shadow-2xl">
                           {gridImages[setIdx] ? <img src={gridImages[setIdx]} className="w-full h-full object-cover" /> : <LayoutGrid className="w-24 h-24 text-slate-200" />}
                           {imageLoading[setIdx] && <div className="absolute inset-0 bg-white/90 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>}
                        </div>

                        <div className="pt-10 border-t flex flex-col gap-6">
                           <div className="relative aspect-[9/16] bg-slate-200 rounded-[3.5rem] overflow-hidden shadow-2xl flex items-center justify-center mx-auto max-w-[320px]">
                              {setVideoUrls[setIdx] ? <video src={setVideoUrls[setIdx]} controls className="w-full h-full object-cover" /> : <Monitor className="w-16 h-16 text-slate-400" />}
                              {setVideoLoading[setIdx] && (
                                <div className="absolute inset-0 bg-black/85 backdrop-blur-xl flex items-center justify-center flex-col p-6">
                                  <Loader2 className="animate-spin text-white mb-4 w-12 h-12" />
                                  <p className="text-white text-[10px] font-black uppercase text-center tracking-widest">{setVideoStatus[setIdx]}</p>
                                </div>
                              )}
                           </div>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <button onClick={() => handleGenerateFullVideo(setIdx, 'grid')} disabled={setVideoLoading[setIdx] || !gridImages[setIdx]} className="py-6 bg-emerald-600 text-white rounded-[2rem] font-black text-base flex items-center justify-center gap-4 shadow-xl hover:scale-105 transition-all">
                                {setVideoLoading[setIdx] ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Zap className="w-6 h-6" /> 采用预览渲染 (Gemini 指导)</>}
                              </button>
                              <button onClick={() => handleGenerateFullVideo(setIdx, 'direct')} disabled={setVideoLoading[setIdx] || images.length === 0} className="py-6 bg-slate-900 text-white rounded-[2rem] font-black text-base flex items-center justify-center gap-4 shadow-xl hover:scale-105 transition-all">
                                {setVideoLoading[setIdx] ? <Loader2 className="w-6 h-6 animate-spin" /> : <><ZapOff className="w-6 h-6" /> 直接渲染</>}
                              </button>
                           </div>
                        </div>
                      </div>
                  </div>
               </div>
             ))}
          </div>
        </section>
      )}

      {/* ERROR MODAL */}
      {error && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
           <div className="bg-white p-12 rounded-[4rem] shadow-2xl max-w-md w-full text-center border-4 border-slate-50">
              <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner"><AlertCircle className="w-12 h-12" /></div>
              <h3 className="text-2xl font-black mb-6">异常状态报告</h3>
              <p className="text-slate-500 font-bold mb-10 leading-relaxed text-sm">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-5 bg-black text-white rounded-[1.5rem] font-black shadow-2xl transition-all">确认并返回</button>
           </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
           <div className="bg-white w-full max-w-3xl max-h-[80vh] rounded-[4rem] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
              <div className="p-10 border-b flex justify-between items-center bg-slate