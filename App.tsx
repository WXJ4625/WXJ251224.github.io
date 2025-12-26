
import React, { useState, useEffect } from 'react';
import { 
  Camera, Trash2, Search, Loader2, Zap, Copy, ImageIcon, Sparkles, LayoutGrid, FileDown, 
  Package, X, History, ChevronRight, Box, AlertCircle, Edit3, Scan, Users, MapPin, CheckCircle2, Save, Download, Video, Play, Activity, Clock, Layers, Maximize2, ChevronDown, ChevronUp, Monitor, ZapOff, Trash
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, HistoryRecord, ProductPrompt, VideoResolution, VideoAspectRatio } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateProductProfileFromText, generateGridImage, generateVideoWithExtension } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];
const DURATION_OPTIONS = [
  { label: '5-7s (标准)', value: 5 },
  { label: '12-14s (延长)', value: 12 },
  { label: '19-21s (中长)', value: 19 }
];

// 辅助函数：压缩图片以节省存储空间
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
      resolve(canvas.toDataURL('image/jpeg', 0.6)); // 使用较低质量的 JPEG 缩略图
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
  const [gridImages, setGridImages] = useState<Record<number, string>>({});
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
  
  const [setVideoUrls, setSetVideoUrls] = useState<Record<number, string>>({});
  const [setVideoLoading, setSetVideoLoading] = useState<Record<number, boolean>>({});
  const [setVideoStatus, setSetVideoStatus] = useState<Record<number, string>>({});

  const [videoResolution, setVideoResolution] = useState<VideoResolution>('1080p');
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [targetDuration, setTargetDuration] = useState<number>(5);

  const [error, setError] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [expandedSets, setExpandedSets] = useState<Record<number, boolean>>({ 0: true });

  const handleError = (err: any) => {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    setError(message || "未知错误");
    setState(AppState.IDLE);
  };

  useEffect(() => {
    const stored = localStorage.getItem('storyboard_history');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed as HistoryRecord[]);
        }
      } catch (e: any) {
        console.error("加载历史记录失败", e);
      }
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
    // 压缩封面图以节省空间
    const originalRef = images.find(i => i.type === 'image')?.data || images[0]?.data || '';
    const thumbnail = originalRef ? await compressImage(originalRef) : '';

    const newRecord: HistoryRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      productName: productName || '未命名产品',
      referenceImage: thumbnail, // 仅存储缩略图
      prompts: JSON.parse(JSON.stringify(prompts)),
      analysis: JSON.parse(JSON.stringify(currentAnalysis))
    };

    const updated = [newRecord, ...history].slice(0, 12); // 限制历史记录为12条
    setHistory(updated);

    try {
      localStorage.setItem('storyboard_history', JSON.stringify(updated));
    } catch (e) {
      console.warn("存储空间依然不足，尝试进一步清理", e);
      // 如果报错，只保留最近3条或清空部分
      localStorage.setItem('storyboard_history', JSON.stringify(updated.slice(0, 3)));
    }
  };

  const clearHistory = () => {
    if (window.confirm("确定要清空所有历史记录吗？")) {
      setHistory([]);
      localStorage.removeItem('storyboard_history');
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

  const skipToManualStrategy = async () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await generateProductProfileFromText(productName);
      const newAnalysis = { individualAnalyses: [], globalProfile: profile };
      setAnalysis(newAnalysis);
      setState(AppState.EDITING_GLOBAL);
    } catch (err: any) { handleError(err); }
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

  const handlePromptEdit = (idx: number, value: string) => {
    setEditablePrompts(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const handleGenerateImage = async (idx: number) => {
    const prompt = editablePrompts[idx];
    if (!prompt) { setError("提示词内容不能为空"); return; }
    setImageLoading(prev => ({ ...prev, [idx]: true }));
    try {
      const referenceImg = images.find(img => img.type === 'image')?.data;
      const imageUrl = await generateGridImage(prompt, referenceImg);
      setGridImages(prev => ({ ...prev, [idx]: imageUrl }));
    } catch (err: any) { handleError(err); } finally { setImageLoading(prev => ({ ...prev, [idx]: false })); }
  };

  const handleGenerateFullVideo = async (setIdx: number, mode: 'grid' | 'direct' = 'grid') => {
    const aistudio = (window as any).aistudio;
    const hasKey = (await aistudio.hasSelectedApiKey()) as boolean;
    if (!hasKey) {
       await aistudio.openSelectKey();
    }

    const scriptText = editablePrompts[setIdx] || "";
    let referenceVisual = "";

    if (mode === 'grid') {
      referenceVisual = gridImages[setIdx] || "";
      if (!referenceVisual) { 
        setError("请先生成分镜大图以锁定产品结构一致性。若想直接生成，请点击‘直接生成’按钮。"); 
        return; 
      }
    } else {
      const firstImg = images.find(img => img.type === 'image');
      if (!firstImg) {
        setError("流水线中没有可用的产品图片资产。请先上传产品图片。");
        return;
      }
      referenceVisual = firstImg.data;
    }
    
    if (!scriptText) { setError("分镜脚本不能为空。"); return; }

    const profile = analysis?.globalProfile;
    const finalPrompt = `Final commercial video following this script: ${scriptText}. 
    Product Core Structure: ${profile?.structure || ''}.
    Product Fine Details: ${profile?.details || ''}. 
    Motion Rules: ${profile?.motion || ''}.
    STRICT REQUIREMENT: The product in this video MUST maintain 100% structural and detail consistency.`;

    setSetVideoLoading(prev => ({ ...prev, [setIdx]: true }));
    try {
      const videoUrl = await generateVideoWithExtension(finalPrompt, referenceVisual, {
        resolution: videoResolution,
        aspectRatio: videoAspectRatio,
        targetDuration: targetDuration
      }, (msg: string) => setSetVideoStatus(prev => ({ ...prev, [setIdx]: msg })));
      setSetVideoUrls(prev => ({ ...prev, [setIdx]: videoUrl }));
    } catch (err: any) {
      if (err?.message && String(err.message).includes("Requested entity was not found")) {
         await aistudio.openSelectKey();
      }
      handleError(err); 
    } finally { 
      setSetVideoLoading(prev => ({ ...prev, [setIdx]: false })); 
    }
  };

  const downloadFile = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllImages = () => {
    Object.entries(gridImages).forEach(([idx, url]) => {
      downloadFile(url as string, `${productName}_grid_${idx}.png`);
    });
  };

  const downloadAllVideos = () => {
    Object.entries(setVideoUrls).forEach(([idx, url]) => {
      downloadFile(url as string, `${productName}_video_${idx}.mp4`);
    });
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [idx]: true }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [idx]: false })), 2000);
    });
  };

  const toggleSetExpansion = (idx: number) => {
    setExpandedSets(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32">
      <header className="flex flex-col md:flex-row items-center justify-between mb-16 gap-10">
        <div className="text-left">
          <div className="inline-flex items-center gap-4 p-4 bg-black rounded-3xl mb-6 shadow-xl">
             <Sparkles className="text-white w-8 h-8" />
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Storyboard Pro</h1>
          </div>
          <p className="text-slate-400 text-lg font-medium">商业级 AI 策划与产品结构一致性视频生成流水线</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowHistory(true)} className="px-6 py-3 bg-slate-100 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-200 transition-all shadow-sm"><History className="w-5 h-5" /> 历史记录</button>
          <button onClick={async () => { /* @ts-ignore */ await (window as any).aistudio.openSelectKey(); }} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-sm shadow-xl hover:bg-slate-800 transition-all">Veo 云鉴权</button>
        </div>
      </header>

      {/* STEP 1: ASSETS */}
      <section className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 mb-16 shadow-sm">
        <div className="flex items-center gap-6 mb-10">
          <span className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center text-xl font-black shadow-lg">01</span>
          <h2 className="text-3xl font-black tracking-tight">核心产品资产上传</h2>
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
              <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-xl hover:bg-red-600 transition-colors shadow-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <label className="aspect-square flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:bg-white transition-all group hover:border-black">
            <div className="flex gap-2 mb-2">
              <Camera className="w-6 h-6 text-slate-300 group-hover:text-black transition-colors" />
              <Video className="w-6 h-6 text-slate-300 group-hover:text-black transition-colors" />
            </div>
            <span className="text-[10px] font-black uppercase text-slate-400">上传产品图片/参考视频</span>
            <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} />
          </label>
        </div>

        <div className="mb-10">
          <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest">产品名称</label>
          <input 
            type="text" 
            placeholder="例如：高端无线吹风机..." 
            className="w-full p-8 text-2xl font-black bg-white border-2 border-slate-100 rounded-[2.5rem] outline-none focus:border-black shadow-inner transition-all"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          <button onClick={startIndividualAnalysis} disabled={images.length === 0 || !productName || state.includes('ANALYZING')} className="flex-1 py-7 bg-black text-white rounded-[2.5rem] font-black text-lg flex items-center justify-center gap-4 shadow-2xl disabled:bg-slate-200 transition-all hover:bg-slate-800">
            {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-7 h-7 animate-spin" /> : <><Search className="w-7 h-7" /> 扫描实拍资产并提取结构细节</>}
          </button>
          <button onClick={skipToManualStrategy} disabled={!productName || state.includes('ANALYZING')} className="px-10 py-7 bg-white border-2 border-slate-200 rounded-[2.5rem] font-black text-lg flex items-center justify-center gap-4 hover:bg-slate-50 transition-all shadow-sm">
            {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-7 h-7 animate-spin" /> : <><Edit3 className="w-7 h-7" /> AI 纯文字策划模式</>}
          </button>
        </div>
      </section>

      {/* STEP 2: PROFILE & CONFIG */}
      {analysis && (
        <section className="bg-slate-50 p-10 rounded-[4rem] border border-slate-100 mb-16 animate-in slide-in-from-bottom-8 shadow-sm">
          <div className="flex items-center gap-6 mb-10">
            <span className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-black shadow-xl">02</span>
            <h2 className="text-3xl font-black tracking-tight">全局产品基因配置</h2>
          </div>

          <div className="space-y-8 mb-12">
             {[
               { id: 'structure', icon: Box, label: '产品结构细节 (物理属性)', color: 'bg-blue-50 text-blue-600' },
               { id: 'details', icon: Scan, label: '材质纹理与 Logo 细节', color: 'bg-emerald-50 text-emerald-600' },
               { id: 'audience', icon: Users, label: '受众调性与品牌风格', color: 'bg-purple-50 text-purple-600' },
               { id: 'scenarios', icon: MapPin, label: '视觉场景与应用环境', color: 'bg-orange-50 text-orange-600' },
               { id: 'motion', icon: Activity, label: '运动规律与轨迹表现', color: 'bg-red-50 text-red-600' }
             ].map(item => (
               <div key={item.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col gap-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl ${item.color} flex items-center justify-center shadow-inner`}><item.icon className="w-6 h-6" /></div>
                    <label className="text-[13px] font-black uppercase text-slate-900 tracking-wider italic">{item.label}</label>
                  </div>
                  <textarea 
                    className="w-full text-base font-medium text-slate-700 bg-slate-50/50 p-8 rounded-[2rem] outline-none focus:bg-white border-2 border-transparent focus:border-indigo-100 resize-y min-h-[120px] shadow-inner transition-all leading-relaxed"
                    value={analysis.globalProfile[item.id as keyof ProductAnalysis['globalProfile']]}
                    onChange={(e) => {
                      const newProfile = { ...analysis.globalProfile, [item.id]: e.target.value };
                      setAnalysis({ ...analysis, globalProfile: newProfile });
                    }}
                    placeholder={`描述产品${item.label}...`}
                  />
               </div>
             ))}
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 mb-12 space-y-12">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div>
                   <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block tracking-[0.2em]">视觉场景风格</label>
                   <div className="flex flex-wrap gap-3">
                      {SCENE_OPTIONS.map(opt => (
                        <button key={opt} onClick={() => setSceneType(opt)} className={`px-6 py-3 rounded-2xl text-[11px] font-black border-2 transition-all ${sceneType === opt ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}>{opt}</button>
                      ))}
                   </div>
                </div>
                <div className="flex gap-8">
                   <div className="flex-1">
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block tracking-[0.2em]">策划套数</label>
                      <input type="number" value={promptCount} onChange={e => setPromptCount(parseInt(e.target.value))} className="w-full p-4 bg-slate-50 rounded-2xl font-black text-center text-lg border-2 border-transparent focus:border-indigo-100 outline-none shadow-inner" min="1" max="10" />
                   </div>
                   <div className="flex-1">
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block tracking-[0.2em]">输出语言</label>
                      <button onClick={() => setLanguage(l => l === 'zh' ? 'en' : 'zh')} className="w-full p-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-sm hover:bg-indigo-100 transition-all border-2 border-indigo-100 shadow-sm">{language === 'zh' ? '中文' : 'English'}</button>
                   </div>
                </div>
             </div>

             <div className="pt-10 border-t border-slate-50">
                <div className="flex items-center gap-4 mb-8">
                   <Video className="w-7 h-7 text-indigo-600" />
                   <h3 className="text-lg font-black uppercase tracking-widest text-slate-900">Veo 渲染参数 (Final Video Config)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                   <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block">成品时长 ({targetDuration}s)</label>
                      <div className="flex gap-3">
                         {DURATION_OPTIONS.map(opt => (
                           <button key={opt.value} onClick={() => {
                             setTargetDuration(opt.value);
                             if (opt.value > 5) setVideoResolution('720p');
                           }} className={`flex-1 p-4 rounded-2xl font-black text-[10px] border-2 transition-all ${targetDuration === opt.value ? 'bg-black text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:border-slate-300'}`}>{opt.label}</button>
                         ))}
                      </div>
                   </div>
                   <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block">渲染分辨率</label>
                      <div className="flex gap-3">
                         {['720p', '1080p'].map(res => (
                           <button key={res} disabled={targetDuration > 5 && res === '1080p'} onClick={() => setVideoResolution(res as any)} className={`flex-1 p-4 rounded-2xl font-black text-[11px] border-2 transition-all ${videoResolution === res ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:border-slate-300'} disabled:opacity-30 disabled:cursor-not-allowed`}>{res}</button>
                         ))}
                      </div>
                   </div>
                   <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block">视频比例 (移动端 9:16)</label>
                      <div className="flex gap-3">
                         {['16:9', '9:16'].map(ratio => (
                           <button key={ratio} onClick={() => setVideoAspectRatio(ratio as any)} className={`flex-1 p-4 rounded-2xl font-black text-[11px] border-2 transition-all ${videoAspectRatio === ratio ? 'bg-black text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:border-slate-300'}`}>{ratio}</button>
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-9 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl flex items-center justify-center gap-5 shadow-[0_20px_50px_-15px_rgba(79,70,229,0.4)] hover:bg-indigo-700 transition-all disabled:bg-slate-300">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Zap className="w-10 h-10" /> 生成高保真策划案 & 分镜设计</>}
          </button>
        </section>
      )}

      {/* STEP 3: OUTPUT */}
      {editablePrompts.length > 0 && (
        <section className="space-y-16 animate-in fade-in duration-700">
          <div className="bg-black p-10 rounded-[3.5rem] text-white flex justify-between items-center shadow-2xl flex-col lg:flex-row gap-8">
            <h2 className="text-3xl font-black flex items-center gap-5"><Package className="w-10 h-10 text-indigo-400" /> 已就绪分镜库 ({editablePrompts.length} 套方案)</h2>
            <div className="flex gap-4 flex-wrap">
              <button onClick={downloadAllImages} className="px-8 py-5 bg-white/10 hover:bg-white/20 text-white rounded-[1.5rem] font-black text-xs flex items-center gap-3 border border-white/10 transition-all shadow-md">
                <Download className="w-5 h-5" /> 导出预览图
              </button>
              <button onClick={downloadAllVideos} className="px-8 py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[1.5rem] font-black text-xs flex items-center gap-3 transition-all">
                <Video className="w-5 h-5" /> 导出所有已生成视频
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-20">
             {editablePrompts.map((promptText, setIdx) => (
               <div key={setIdx} className="bg-white p-10 rounded-[4.5rem] border-2 border-slate-100 shadow-2xl flex flex-col gap-12 relative overflow-hidden group">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-10">
                    <div className="flex items-center gap-8">
                       <span className="px-8 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-base tracking-widest uppercase italic shadow-xl">交付方案 {setIdx + 1}</span>
                       <button onClick={() => toggleSetExpansion(setIdx)} className="flex items-center gap-3 text-slate-400 font-bold text-sm hover:text-black transition-all">
                          {expandedSets[setIdx] ? <><ChevronUp className="w-5 h-5" /> 收起</> : <><ChevronDown className="w-5 h-5" /> 展开详情</>}
                       </button>
                    </div>
                    <button onClick={() => copyToClipboard(promptText, setIdx)} className="flex items-center gap-3 text-indigo-600 font-black text-sm hover:bg-indigo-100 transition-all bg-indigo-50 px-8 py-4 rounded-[1.5rem] border-2 border-indigo-100 shadow-sm">
                      {copyStates[setIdx] ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      复制脚本
                    </button>
                  </div>

                  {expandedSets[setIdx] && (
                    <div className="flex flex-col xl:flex-row gap-16 animate-in slide-in-from-top-6 duration-500">
                      <div className="flex-1 space-y-8 flex flex-col">
                        <div className="flex-1 flex flex-col gap-4">
                           <label className="text-[12px] font-black uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em]"><Edit3 className="w-5 h-5" /> 分镜脚本调整 (Editable Script)</label>
                           <textarea 
                             className="w-full flex-1 min-h-[400px] p-10 text-base font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-[3rem] border-2 border-transparent focus:border-indigo-100 focus:bg-white outline-none transition-all resize-none shadow-inner"
                             value={promptText}
                             onChange={(e) => handlePromptEdit(setIdx, e.target.value)}
                           />
                        </div>
                        <button onClick={() => handleGenerateImage(setIdx)} disabled={imageLoading[setIdx]} className="w-full py-7 bg-slate-900 text-white rounded-[2rem] font-black text-base flex items-center justify-center gap-4 hover:bg-black transition-all shadow-xl">
                          {imageLoading[setIdx] ? <Loader2 className="w-6 h-6 animate-spin" /> : <><ImageIcon className="w-6 h-6" /> 重新渲染 3x3 预览大图</>}
                        </button>
                      </div>

                      <div className="w-full xl:w-[600px] space-y-8">
                        <div>
                           <label className="text-[11px] font-black uppercase text-slate-400 mb-5 block tracking-[0.3em] text-center">分镜逻辑预览图</label>
                           <div className="aspect-[16/9] bg-slate-100 rounded-[3.5rem] border-2 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden shadow-2xl group/img">
                              {gridImages[setIdx] ? (
                                <>
                                  <img src={gridImages[setIdx]} className="w-full h-full object-cover animate-in fade-in duration-500" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center">
                                     <button onClick={() => downloadFile(gridImages[setIdx]!, `grid_${setIdx}.png`)} className="p-5 bg-white text-black rounded-full shadow-2xl"><Download className="w-7 h-7" /></button>
                                  </div>
                                </>
                              ) : (
                                <div className="text-center text-slate-300">
                                   <LayoutGrid className="w-24 h-24 mx-auto mb-8 opacity-20" />
                                   <p className="text-[12px] font-black uppercase tracking-[0.4em]">分镜大图待渲染</p>
                                </div>
                              )}
                              {imageLoading[setIdx] && (
                                 <div className="absolute inset-0 bg-white/95 backdrop-blur-xl flex items-center justify-center flex-col gap-8">
                                    <Loader2 className="w-16 h-16 text-indigo-600 animate-spin" />
                                    <p className="text-[12px] font-black uppercase text-indigo-600 tracking-[0.5em] animate-pulse">正在生成分镜预览...</p>
                                 </div>
                              )}
                           </div>
                        </div>

                        <div className="pt-10 border-t border-slate-50 flex flex-col gap-6">
                           <div className="flex items-center justify-between">
                              <h3 className="text-lg font-black uppercase tracking-widest text-slate-900 flex items-center gap-3">
                                 <Video className="w-6 h-6 text-emerald-500" /> 最终成片生成 (Final Video)
                              </h3>
                           </div>
                           
                           <div className="relative aspect-[9/16] bg-slate-200 rounded-[3.5rem] overflow-hidden shadow-2xl flex items-center justify-center border-4 border-white max-w-[320px] mx-auto">
                              {setVideoUrls[setIdx] ? (
                                <>
                                  <video src={setVideoUrls[setIdx]} controls className="w-full h-full object-cover animate-in fade-in duration-500" />
                                  <button onClick={() => downloadFile(setVideoUrls[setIdx]!, `final_video_${setIdx}.mp4`)} className="absolute top-5 right-5 p-3 bg-black/40 text-white rounded-2xl"><Download className="w-5 h-5" /></button>
                                </>
                              ) : (
                                <div className="text-center p-10 opacity-40">
                                   <Monitor className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                                   <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-loose">9:16 成片预览区</p>
                                </div>
                              )}
                              {setVideoLoading[setIdx] && (
                                 <div className="absolute inset-0 bg-black/85 backdrop-blur-2xl flex items-center justify-center flex-col gap-6 p-8">
                                    <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
                                    <div className="text-center">
                                       <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-2">{setVideoStatus[setIdx] || '正在渲染视频...'}</p>
                                       <p className="text-[8px] font-bold text-slate-500 italic">保持首尾帧产品结构 100% 一致</p>
                                    </div>
                                 </div>
                              )}
                           </div>

                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <button 
                                onClick={() => handleGenerateFullVideo(setIdx, 'grid')} 
                                disabled={setVideoLoading[setIdx] || !gridImages[setIdx]} 
                                className="py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black text-base flex items-center justify-center gap-4 transition-all disabled:bg-slate-300 shadow-xl hover:scale-105 active:scale-95"
                                title="基于 3x3 九宫格生成的预览大图进行视频渲染，结构一致性最高"
                              >
                                {setVideoLoading[setIdx] ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Zap className="w-6 h-6" /> 基于预览图生成</>}
                              </button>
                              <button 
                                onClick={() => handleGenerateFullVideo(setIdx, 'direct')} 
                                disabled={setVideoLoading[setIdx] || images.filter(img => img.type === 'image').length === 0} 
                                className="py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black text-base flex items-center justify-center gap-4 transition-all disabled:bg-slate-300 shadow-xl hover:scale-105 active:scale-95"
                                title="跳过九宫格，直接按照脚本和上传的产品图片输出视频"
                              >
                                {setVideoLoading[setIdx] ? <Loader2 className="w-6 h-6 animate-spin" /> : <><ZapOff className="w-6 h-6" /> 直接生成 (跳过预览)</>}
                              </button>
                           </div>
                        </div>
                      </div>
                    </div>
                  )}
               </div>
             ))}
          </div>
        </section>
      )}

      {/* MODALS & ERROR */}
      {error && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
           <div className="bg-white p-12 rounded-[4rem] shadow-2xl max-w-md w-full text-center border-4 border-slate-50">
              <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner"><AlertCircle className="w-12 h-12" /></div>
              <h3 className="text-2xl font-black mb-6">流水线报告异常</h3>
              <p className="text-slate-500 font-bold mb-10 leading-relaxed text-base">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-5 bg-black text-white rounded-[1.5rem] font-black shadow-2xl hover:bg-slate-800 transition-all">返回</button>
           </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
           <div className="bg-white w-full max-w-3xl max-h-[80vh] rounded-[4rem] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 duration-500">
              <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-2xl font-black flex items-center gap-4"><History className="w-7 h-7 text-indigo-600" /> 方案历史</h3>
                 <div className="flex gap-4">
                    <button onClick={clearHistory} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all shadow-sm flex items-center gap-2 font-black text-xs uppercase tracking-widest"><Trash className="w-4 h-4" /> 清空全部</button>
                    <button onClick={() => setShowHistory(false)} className="p-4 border-2 rounded-2xl hover:bg-slate-100 transition-all shadow-sm"><X className="w-6 h-6 text-slate-400" /></button>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-6">
                 {history.length === 0 ? <p className="text-center py-24 text-slate-400 font-bold italic text-xl">暂无记录</p> : history.map(rec => (
                    <div key={rec.id} className="p-6 bg-slate-50 rounded-[2.5rem] flex items-center justify-between group cursor-pointer hover:bg-white border-2 border-transparent hover:border-indigo-100 transition-all shadow-md" onClick={() => {
                       setProductName(rec.productName);
                       setAnalysis(rec.analysis);
                       setGeneratedPrompts(rec.prompts);
                       setEditablePrompts(rec.prompts.map(p => formatPromptForEditing(p)));
                       setShowHistory(false);
                       setGridImages({});
                       setSetVideoUrls({});
                       setState(AppState.COMPLETED);
                    }}>
                       <div className="flex items-center gap-6">
                          <div className="w-20 h-20 bg-white rounded-3xl border-2 shadow-inner flex items-center justify-center overflow-hidden">
                             {rec.referenceImage ? <img src={rec.referenceImage} className="w-full h-full object-cover" /> : <Box className="w-10 h-10 text-slate-200" />}
                          </div>
                          <div>
                             <h4 className="font-black text-xl text-slate-800 tracking-tight">{rec.productName}</h4>
                             <p className="text-[10px] text-slate-400 uppercase font-black flex items-center gap-3 mt-1"><Clock className="w-3 h-3" /> {new Date(rec.timestamp).toLocaleString()}</p>
                          </div>
                       </div>
                       <ChevronRight className="w-8 h-8 text-slate-300 group-hover:text-indigo-600 transition-all" />
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-3xl border-t py-6 px-16 flex justify-between items-center z-[40]">
        <div className="flex items-center gap-5">
          <div className={`w-3.5 h-3.5 rounded-full ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'} shadow-sm`}></div>
          <span className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em] italic">{Object.values(setVideoLoading).some(v => v) ? 'Veo 正在进行渲染...' : `流水线状态: ${state}`}</span>
        </div>
        <div className="flex items-center gap-8">
          <div className="px-6 py-2.5 bg-indigo-50 border-2 border-indigo-100 rounded-full text-[10px] font-black uppercase text-indigo-600 tracking-tighter italic flex items-center gap-3">
            <Activity className="w-4 h-4" /> Final Consistency Engine v3.0 ACTIVE
          </div>
          <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest opacity-40">Storyboard Pro | Powered by Gemini & Veo 3.1</div>
        </div>
      </footer>
    </div>
  );
};

export default App;
