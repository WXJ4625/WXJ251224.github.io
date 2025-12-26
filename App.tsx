
import React, { useState, useEffect } from 'react';
import { 
  Camera, Trash2, Search, Loader2, Zap, Copy, ImageIcon, Sparkles, LayoutGrid, FileDown, 
  Package, X, History, ChevronRight, Box, AlertCircle, Edit3, Scan, Users, MapPin, CheckCircle2, Save, Download, Video, Play, Activity, Clock, Layers, Maximize2
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, HistoryRecord, ProductPrompt, VideoResolution, VideoAspectRatio } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateProductProfileFromText, generateGridImage, generateVideoWithExtension } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];
const DURATION_OPTIONS = [
  { label: '5-7s (标准)', value: 5 },
  { label: '12-14s (延长)', value: 12 },
  { label: '19-21s (中长)', value: 19 },
  { label: '26-28s (长视频)', value: 26 }
];

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
  
  const [videoUrls, setVideoUrls] = useState<Record<number, string>>({});
  const [videoLoading, setVideoLoading] = useState<Record<number, boolean>>({});
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('1080p');
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [targetDuration, setTargetDuration] = useState<number>(5);
  const [videoStatus, setVideoStatus] = useState<Record<number, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const handleError = (err: any) => {
    console.error(err);
    setError(err instanceof Error ? err.message : String(err) || "未知错误");
    setState(AppState.IDLE);
  };

  useEffect(() => {
    const stored = localStorage.getItem('storyboard_history');
    if (stored) {
      try { setHistory(JSON.parse(stored)); } catch (e: any) { console.error(e); }
    }
  }, []);

  const formatPromptForEditing = (p: ProductPrompt): string => {
    let text = `【总指令】: ${p.instruction}\n\n`;
    p.shots.forEach((shot, i) => {
      text += `镜头 ${i + 1} [${shot.cameraAngle} | ${shot.lighting}]: ${shot.description}\n`;
    });
    return text;
  };

  const saveToHistory = (prompts: ProductPrompt[], currentAnalysis: ProductAnalysis) => {
    const newRecord: HistoryRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      productName: productName || '未命名产品',
      referenceImage: images.find(i => i.type === 'image')?.data || images[0]?.data || '',
      prompts: JSON.parse(JSON.stringify(prompts)),
      analysis: JSON.parse(JSON.stringify(currentAnalysis))
    };
    const updated = [newRecord, ...history].slice(0, 50);
    setHistory(updated);
    localStorage.setItem('storyboard_history', JSON.stringify(updated));
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
      setAnalysis({ individualAnalyses: raw, globalProfile: profile });
      setState(AppState.EDITING_GLOBAL);
    } catch (err: any) { handleError(err); }
  };

  const skipToManualStrategy = async () => {
    if (!productName.trim()) { setError("请输入产品名称"); return; }
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await generateProductProfileFromText(productName);
      setAnalysis({ individualAnalyses: [], globalProfile: profile });
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
      saveToHistory(results, analysis);
      setState(AppState.COMPLETED);
    } catch (err: any) { handleError(err); }
  };

  /**
   * Fix for missing handlePromptEdit function (Error on line 423)
   */
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

  const handleGenerateVideo = async (idx: number) => {
    // Fix: Explicitly cast window.aistudio to avoid unknown type errors (Error on line 187/193)
    const aistudio = (window as any).aistudio;
    const hasKey = await aistudio.hasSelectedApiKey();
    if (!hasKey) {
       await aistudio.openSelectKey();
    }

    // Fix: Ensure prompt and gridImage are recognized as strings by the compiler
    const prompt = editablePrompts[idx] as string;
    const gridImage = gridImages[idx] as string;

    if (!prompt) { setError("分镜提示词不能为空。"); return; }
    if (!gridImage) { setError("请先生成预览网格图，作为视频生成的参考。"); return; }

    setVideoLoading(prev => ({ ...prev, [idx]: true }));
    try {
      const videoUrl = await generateVideoWithExtension(prompt, gridImage, {
        resolution: videoResolution,
        aspectRatio: videoAspectRatio,
        targetDuration: targetDuration
      }, (msg) => setVideoStatus(prev => ({ ...prev, [idx]: msg })));
      setVideoUrls(prev => ({ ...prev, [idx]: videoUrl }));
    } catch (err: any) {
      if (err.message === "API_KEY_EXPIRED") {
         await aistudio.openSelectKey();
      }
      handleError(err); 
    } finally { 
      setVideoLoading(prev => ({ ...prev, [idx]: false })); 
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
      downloadFile(url, `${productName}_grid_${idx}.png`);
    });
  };

  const downloadAllVideos = () => {
    Object.entries(videoUrls).forEach(([idx, url]) => {
      downloadFile(url, `${productName}_video_${idx}.mp4`);
    });
  };

  const downloadAllAsCSV = () => {
    if (editablePrompts.length === 0) return;
    let csvContent = "\uFEFF";
    csvContent += "方案编号,完整分镜提示词\n";
    editablePrompts.forEach((prompt, idx) => {
      const escapedPrompt = prompt.replace(/"/g, '""');
      csvContent += `${idx + 1},"${escapedPrompt}"\n`;
    });
    const blob = new window.Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${productName || 'storyboard'}_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [idx]: true }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [idx]: false })), 2000);
    });
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32">
      <header className="flex flex-col md:flex-row items-center justify-between mb-16 gap-10">
        <div className="text-left">
          <div className="inline-flex items-center gap-4 p-4 bg-black rounded-3xl mb-6 shadow-xl">
             <Sparkles className="text-white w-8 h-8" />
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Storyboard Pro</h1>
          </div>
          <p className="text-slate-400 text-lg font-medium">商业级 AI 策划与高保真视频生产</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowHistory(true)} className="px-6 py-3 bg-slate-100 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-200 transition-all"><History className="w-5 h-5" /> 历史记录</button>
          <button onClick={async () => { /* @ts-ignore */ await (window as any).aistudio.openSelectKey(); }} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-sm shadow-xl hover:bg-slate-800 transition-all">Veo 云鉴权</button>
        </div>
      </header>

      {/* STEP 1: ASSETS */}
      <section className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 mb-16 shadow-sm">
        <div className="flex items-center gap-6 mb-10">
          <span className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center text-xl font-black shadow-lg">01</span>
          <h2 className="text-3xl font-black tracking-tight">资产采集与分析</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-6 mb-10">
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
              <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-xl hover:bg-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <label className="aspect-square flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:bg-white transition-all group hover:border-black">
            <div className="flex gap-2 mb-2">
              <Camera className="w-6 h-6 text-slate-300 group-hover:text-black transition-colors" />
              <Video className="w-6 h-6 text-slate-300 group-hover:text-black transition-colors" />
            </div>
            <span className="text-[10px] font-black uppercase text-slate-400">上传视频/图片</span>
            <input type="file" className="hidden" accept="image/*,video/*" multiple onChange={handleFileUpload} />
          </label>
        </div>

        <div className="mb-10">
          <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest">产品名称</label>
          <input 
            type="text" 
            placeholder="例如：高端无线吹风机..." 
            className="w-full p-6 text-2xl font-black bg-white border-2 border-slate-100 rounded-[2rem] outline-none focus:border-black shadow-sm transition-all"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button onClick={startIndividualAnalysis} disabled={images.length === 0 || !productName || state.includes('ANALYZING')} className="flex-1 py-6 bg-black text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 shadow-xl disabled:bg-slate-200 transition-all hover:bg-slate-800">
            {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Search className="w-6 h-6" /> 扫描实拍资产并同步运动逻辑</>}
          </button>
          <button onClick={skipToManualStrategy} disabled={!productName || state.includes('ANALYZING')} className="px-8 py-6 bg-white border-2 border-slate-200 rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 hover:bg-slate-50 transition-all shadow-sm">
            {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Edit3 className="w-6 h-6" /> 直接 AI 策划方案</>}
          </button>
        </div>
      </section>

      {/* STEP 2: PROFILE & CONFIG */}
      {analysis && (
        <section className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 mb-16 animate-in slide-in-from-bottom-8 shadow-sm">
          <div className="flex items-center gap-6 mb-10">
            <span className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-lg">02</span>
            <h2 className="text-3xl font-black tracking-tight">生产全局配置</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
             {[
               { id: 'structure', icon: Box, label: '产品结构', color: 'bg-blue-50 text-blue-600' },
               { id: 'details', icon: Scan, label: '材质细节', color: 'bg-emerald-50 text-emerald-600' },
               { id: 'audience', icon: Users, label: '受众调性', color: 'bg-purple-50 text-purple-600' },
               { id: 'scenarios', icon: MapPin, label: '典型环境', color: 'bg-orange-50 text-orange-600' },
               { id: 'motion', icon: Activity, label: '运动方向', color: 'bg-red-50 text-red-600' }
             ].map(item => (
               <div key={item.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-4">
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center shadow-inner`}><item.icon className="w-5 h-5" /></div>
                  <label className="text-[10px] font-black uppercase text-slate-400">{item.label}</label>
                  <textarea 
                    className="w-full text-xs font-bold text-slate-600 bg-slate-50/50 p-4 rounded-xl min-h-[120px] outline-none focus:bg-white border border-transparent focus:border-indigo-100 resize-none shadow-inner transition-all leading-relaxed"
                    value={analysis.globalProfile[item.id as keyof ProductAnalysis['globalProfile']]}
                    onChange={(e) => {
                      const newProfile = { ...analysis.globalProfile, [item.id]: e.target.value };
                      setAnalysis({ ...analysis, globalProfile: newProfile });
                    }}
                  />
               </div>
             ))}
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 mb-10 space-y-8">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest">视觉场景风格</label>
                   <div className="flex flex-wrap gap-2">
                      {SCENE_OPTIONS.map(opt => (
                        <button key={opt} onClick={() => setSceneType(opt)} className={`px-4 py-2 rounded-xl text-[10px] font-black border-2 transition-all ${sceneType === opt ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'}`}>{opt}</button>
                      ))}
                   </div>
                </div>
                <div className="flex gap-6">
                   <div className="flex-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest">分镜套数</label>
                      <input type="number" value={promptCount} onChange={e => setPromptCount(parseInt(e.target.value))} className="w-full p-3 bg-slate-50 rounded-xl font-black text-center border-2 border-transparent focus:border-indigo-100 outline-none shadow-inner" min="1" max="10" />
                   </div>
                   <div className="flex-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block tracking-widest">输出语言</label>
                      <button onClick={() => setLanguage(l => l === 'zh' ? 'en' : 'zh')} className="w-full p-3 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm">{language === 'zh' ? '中文' : 'English'}</button>
                   </div>
                </div>
             </div>

             <div className="pt-8 border-t border-slate-50">
                <div className="flex items-center gap-3 mb-6">
                   <Video className="w-5 h-5 text-indigo-600" />
                   <h3 className="text-sm font-black uppercase tracking-widest">Veo 渲染参数 (视频专用)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block">目标时长 ({targetDuration}s)</label>
                      <div className="flex gap-2">
                         {DURATION_OPTIONS.map(opt => (
                           <button key={opt.value} onClick={() => {
                             setTargetDuration(opt.value);
                             if (opt.value > 5) setVideoResolution('720p'); // Extension only for 720p
                           }} className={`flex-1 p-3 rounded-xl font-black text-[9px] border-2 transition-all ${targetDuration === opt.value ? 'bg-black text-white' : 'bg-slate-50 text-slate-400 hover:border-slate-200'}`}>{opt.label}</button>
                         ))}
                      </div>
                      {targetDuration > 5 && <p className="text-[8px] mt-2 text-indigo-500 font-bold italic">* 延长视频功能仅支持 720p 分辨率</p>}
                   </div>
                   <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block">分辨率</label>
                      <div className="flex gap-2">
                         {['720p', '1080p'].map(res => (
                           <button key={res} disabled={targetDuration > 5 && res === '1080p'} onClick={() => setVideoResolution(res as any)} className={`flex-1 p-3 rounded-xl font-black text-[10px] border-2 transition-all ${videoResolution === res ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 text-slate-400 hover:border-slate-200'} disabled:opacity-30 disabled:cursor-not-allowed`}>{res}</button>
                         ))}
                      </div>
                   </div>
                   <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-3 block">画幅比例</label>
                      <div className="flex gap-2">
                         {['16:9', '9:16'].map(ratio => (
                           <button key={ratio} onClick={() => setVideoAspectRatio(ratio as any)} className={`flex-1 p-3 rounded-xl font-black text-[10px] border-2 transition-all ${videoAspectRatio === ratio ? 'bg-black text-white' : 'bg-slate-50 text-slate-400 hover:border-slate-200'}`}>{ratio}</button>
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-8 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl flex items-center justify-center gap-4 shadow-2xl hover:bg-indigo-700 transition-all disabled:bg-slate-300">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Zap className="w-8 h-8" /> 生成深度一致性分镜策划</>}
          </button>
        </section>
      )}

      {/* STEP 3: OUTPUT */}
      {editablePrompts.length > 0 && (
        <section className="space-y-10 animate-in fade-in duration-500">
          <div className="bg-black p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-xl flex-col lg:flex-row gap-6">
            <h2 className="text-2xl font-black flex items-center gap-4"><Package className="w-8 h-8 text-indigo-400" /> 分镜方案交付库 ({editablePrompts.length} 套)</h2>
            <div className="flex gap-4 flex-wrap">
              <button onClick={downloadAllImages} className="px-6 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-xs flex items-center gap-2 border border-white/10 transition-all shadow-md">
                <Download className="w-4 h-4" /> 导出所有预览图
              </button>
              <button onClick={downloadAllVideos} className="px-6 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md">
                <Video className="w-4 h-4" /> 导出所有 MP4
              </button>
              <button onClick={downloadAllAsCSV} className="px-6 py-4 bg-indigo-500 text-white rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-indigo-600 transition-all shadow-md">
                <FileDown className="w-4 h-4" /> 导出策划案 (CSV)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-12">
             {editablePrompts.map((promptText, idx) => (
               <div key={idx} className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl flex flex-col lg:flex-row gap-8 relative overflow-hidden group">
                  <div className="flex-1 space-y-6 flex flex-col">
                    <div className="flex items-center justify-between">
                       <span className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] tracking-widest uppercase italic shadow-sm">交付方案 {idx + 1}</span>
                       <button onClick={() => copyToClipboard(promptText, idx)} className="flex items-center gap-2 text-indigo-600 font-black text-xs hover:opacity-70 transition-all bg-indigo-50 px-4 py-2 rounded-xl">
                          {copyStates[idx] ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          复制提示词
                       </button>
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-2">
                       <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest"><Edit3 className="w-3 h-3" /> 编辑方案细节</label>
                       <textarea 
                         className="w-full flex-1 min-h-[350px] p-6 text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-[2rem] border-2 border-transparent focus:border-indigo-100 focus:bg-white outline-none transition-all resize-none shadow-inner"
                         value={promptText}
                         onChange={(e) => handlePromptEdit(idx, e.target.value)}
                       />
                    </div>

                    <div className="flex gap-4">
                      <button onClick={() => handleGenerateImage(idx)} disabled={imageLoading[idx]} className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-200 transition-all disabled:opacity-50 border border-slate-200">
                        {imageLoading[idx] ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ImageIcon className="w-4 h-4" /> 渲染 3x3 分镜网格</>}
                      </button>
                      <button onClick={() => handleGenerateVideo(idx)} disabled={videoLoading[idx] || !gridImages[idx]} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:bg-slate-200 shadow-lg">
                        {videoLoading[idx] ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Video className="w-4 h-4" /> 启动 Veo 商业渲染 ({targetDuration}s)</>}
                      </button>
                    </div>
                  </div>

                  <div className="w-full lg:w-[480px] space-y-4">
                    {/* Image Preview */}
                    <div className="aspect-square bg-slate-100 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden group shadow-inner">
                       {gridImages[idx] ? (
                         <>
                           <img src={gridImages[idx]} className="w-full h-full object-cover animate-in fade-in" />
                           <button onClick={() => downloadFile(gridImages[idx]!, `${productName}_grid_${idx}.png`)} className="absolute bottom-4 right-4 p-3 bg-black/60 text-white rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:bg-black"><Download className="w-4 h-4" /></button>
                         </>
                       ) : (
                         <div className="text-center text-slate-300">
                            <LayoutGrid className="w-16 h-16 mx-auto mb-4 opacity-10" />
                            <p className="text-[10px] font-black uppercase tracking-widest">分镜网格待生成</p>
                         </div>
                       )}
                       {imageLoading[idx] && (
                          <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex items-center justify-center flex-col gap-4">
                             <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                             <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest animate-pulse">正在解析结构并绘制...</p>
                          </div>
                       )}
                    </div>

                    {/* Video Output */}
                    <div className="aspect-video bg-slate-900 rounded-[2rem] border-2 border-slate-800 flex items-center justify-center relative overflow-hidden shadow-2xl">
                       {videoUrls[idx] ? (
                         <>
                           <video src={videoUrls[idx]} controls className="w-full h-full object-cover animate-in fade-in" />
                           <button onClick={() => downloadFile(videoUrls[idx]!, `${productName}_video_${idx}.mp4`)} className="absolute top-4 right-4 p-3 bg-white/10 text-white rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:bg-white/30"><Download className="w-4 h-4" /></button>
                         </>
                       ) : (
                         <div className="text-center text-slate-700">
                            <Video className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Veo 渲染输出区</p>
                         </div>
                       )}
                       {videoLoading[idx] && (
                          <div className="absolute inset-0 bg-black/85 backdrop-blur-xl flex items-center justify-center flex-col gap-6 p-10">
                             <div className="relative">
                               <Loader2 className="w-16 h-16 text-indigo-400 animate-spin" />
                               <Layers className="absolute inset-0 m-auto w-6 h-6 text-white animate-pulse" />
                             </div>
                             <div className="text-center space-y-3">
                               <p className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.4em]">Veo Engine Running</p>
                               <p className="text-xs font-bold text-white max-w-[280px] leading-relaxed animate-pulse">{videoStatus[idx] || '正在渲染...'}</p>
                               <p className="text-[9px] font-medium text-slate-500 max-w-[240px] leading-relaxed mx-auto italic opacity-60">确保产品物理运动轨迹与上传资产保持完全一致，正在进行高保真模特互动模拟...</p>
                             </div>
                          </div>
                       )}
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
           <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><AlertCircle className="w-10 h-10" /></div>
              <h3 className="text-xl font-black mb-4">生产异常</h3>
              <p className="text-slate-500 font-bold mb-8 leading-relaxed text-sm">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-4 bg-black text-white rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-colors">确认</button>
           </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
           <div className="bg-white w-full max-w-2xl max-h-[70vh] rounded-[3rem] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
              <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-xl font-black flex items-center gap-3"><History className="w-5 h-5 text-indigo-600" /> 方案溯源</h3>
                 <button onClick={() => setShowHistory(false)} className="p-3 border rounded-xl hover:bg-slate-100 transition-colors shadow-sm"><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4">
                 {history.length === 0 ? <p className="text-center py-20 text-slate-400 font-bold italic">暂无历史记录</p> : history.map(rec => (
                    <div key={rec.id} className="p-5 bg-slate-50 rounded-[2rem] flex items-center justify-between group cursor-pointer hover:bg-white border-2 border-transparent hover:border-indigo-100 transition-all shadow-sm" onClick={() => {
                       setProductName(rec.productName);
                       setAnalysis(rec.analysis);
                       setGeneratedPrompts(rec.prompts);
                       setEditablePrompts(rec.prompts.map(p => formatPromptForEditing(p)));
                       setShowHistory(false);
                       setGridImages({});
                       setVideoUrls({});
                       setState(AppState.COMPLETED);
                    }}>
                       <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-white rounded-2xl border shadow-inner flex items-center justify-center overflow-hidden">
                             {rec.referenceImage ? <img src={rec.referenceImage} className="w-full h-full object-cover" /> : <Box className="w-6 h-6 text-slate-200" />}
                          </div>
                          <div>
                             <h4 className="font-black text-slate-800">{rec.productName}</h4>
                             <p className="text-[8px] text-slate-400 uppercase font-black flex items-center gap-2"><Clock className="w-2.5 h-2.5" /> {new Date(rec.timestamp).toLocaleString()} • {rec.prompts.length} 套方案</p>
                          </div>
                       </div>
                       <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-indigo-600 transition-all transform group-hover:translate-x-1" />
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t py-4 px-12 flex justify-between items-center shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] z-[40]">
        <div className="flex items-center gap-4">
          <div className={`w-2.5 h-2.5 rounded-full ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'} shadow-sm`}></div>
          <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">{state === AppState.GENERATING_VIDEO ? 'VE 商业引擎正在渲染...' : `生产状态: ${state}`}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="px-5 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-[9px] font-black uppercase text-indigo-600 tracking-tighter italic flex items-center gap-2">
            <Activity className="w-3 h-3" /> Consistency Protocol v2.4 Active
          </div>
          <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest opacity-40">Powered by Veo 3.1 & Gemini 3 Pro</div>
        </div>
      </footer>
    </div>
  );
};

export default App;
