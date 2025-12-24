
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, 
  Trash2, 
  Search, 
  Loader2, 
  Zap, 
  Settings2, 
  Table as TableIcon, 
  CheckCircle2, 
  Copy, 
  ImageIcon, 
  Download, 
  Check, 
  Sparkles,
  LayoutGrid,
  Video,
  Play,
  Key,
  ClipboardCopy,
  ClipboardCheck,
  Layers,
  FileDown,
  ArrowRight,
  Package,
  ExternalLink,
  ChevronDown,
  Monitor,
  Maximize2,
  Scissors,
  X,
  Save,
  RefreshCw,
  History,
  Clock,
  ChevronRight,
  Box,
  Activity
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, VideoResult, HistoryRecord, ProductPrompt } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateStoryboardImage, generateVideo } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

/**
 * 提取视频关键帧的辅助工具
 */
const extractFramesFromVideo = async (dataUrl: string, count: number = 4): Promise<string[]> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = dataUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    
    const frames: string[] = [];
    video.onloadedmetadata = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve([]);
      
      canvas.width = video.videoWidth / 2; // Resize for speed
      canvas.height = video.videoHeight / 2;
      
      const duration = video.duration;
      for (let i = 1; i <= count; i++) {
        const time = (duration / (count + 1)) * i;
        video.currentTime = time;
        await new Promise(r => video.onseeked = r);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.7));
      }
      resolve(frames);
    };
    video.onerror = () => resolve([]);
  });
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [productName, setProductName] = useState<string>('');
  const [images, setImages] = useState<{id: string, data: string, type: 'image' | 'video'}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [videoCount, setVideoCount] = useState<number>(1);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  
  const [generatedPrompts, setGeneratedPrompts] = useState<ProductPrompt[]>([]);
  const [renderedImages, setRenderedImages] = useState<Record<number, string>>({});
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number } | null>(null);
  const [videoResults, setVideoResults] = useState<Record<number, VideoResult[]>>({});
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    const stored = localStorage.getItem('storyboard_history');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (prompts: ProductPrompt[], currentAnalysis: ProductAnalysis) => {
    const newRecord: HistoryRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      productName: productName || '未命名产品',
      referenceImage: images.find(i => i.type === 'image')?.data || images[0]?.data || '',
      prompts: JSON.parse(JSON.stringify(prompts)),
      analysis: JSON.parse(JSON.stringify(currentAnalysis))
    };
    const updatedHistory = [newRecord, ...history].slice(0, 50); 
    setHistory(updatedHistory);
    localStorage.setItem('storyboard_history', JSON.stringify(updatedHistory));
  };

  const loadHistoryRecord = (record: HistoryRecord) => {
    setProductName(record.productName);
    setAnalysis(record.analysis);
    setGeneratedPrompts(record.prompts);
    setImages([{ id: 'historical-' + record.id, data: record.referenceImage, type: 'image' }]);
    setRenderedImages({});
    setState(AppState.COMPLETED);
    setShowHistory(false);
  };

  const clearHistory = () => {
    if (confirm("确定清空所有历史记录吗？此操作不可撤销。")) {
      setHistory([]);
      localStorage.removeItem('storyboard_history');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopyStates(prev => ({ ...prev, [key]: false })), 2000);
    }).catch(err => console.error('Failed to copy: ', err));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' = 'image') => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 12) {
      setError("最多支持上传 12 个参考资产");
      return;
    }
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, { 
            id: Math.random().toString(36).substr(2, 9), 
            data: ev.target!.result as string,
            type
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  const startIndividualAnalysis = async () => {
    if (images.length === 0) {
      setError("请先上传产品图片或视频。");
      return;
    }
    if (!productName.trim()) {
      setError("请输入产品名称。");
      return;
    }
    setState(AppState.ANALYZING_INDIVIDUAL);
    setError(null);
    try {
      const rawResults = await analyzeIndividualImages(images, productName);
      
      // 增强：对视频提取关键帧用于 UI 展示
      const enhancedResults = await Promise.all(rawResults.map(async (res) => {
        const matchingAsset = images.find(img => img.id === res.id);
        if (matchingAsset?.type === 'video') {
          const frames = await extractFramesFromVideo(matchingAsset.data);
          return { ...res, keyframes: frames };
        }
        return res;
      }));

      setAnalysis({
        individualAnalyses: enhancedResults,
        globalProfile: { details: '', usage: '', howToUse: '' }
      });
      setState(AppState.EDITING_INDIVIDUAL);
    } catch (err: any) {
      setError("分析资产失败，请检查网络连接。");
      setState(AppState.IDLE);
    }
  };

  const startGlobalSynthesis = async () => {
    if (!analysis) return;
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await synthesizeProductProfile(analysis.individualAnalyses, productName);
      setAnalysis({ ...analysis, globalProfile: profile });
      setState(AppState.EDITING_GLOBAL);
    } catch (err) {
      setError("提炼全局档案失败。");
      setState(AppState.EDITING_INDIVIDUAL);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    setRenderedImages({});
    try {
      const results = await generateStoryboards(analysis.globalProfile, productName, promptCount, language, sceneType);
      
      const parsed = results.map(raw => {
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
        const instruction = lines[0] || '';
        const shots = lines.filter(l => l.match(/^(?:镜头|Lens|Shot)\s*0?\d\s*:/i)).map(l => {
          const p = l.split(':');
          return p.slice(1).join(':').trim();
        });
        while (shots.length < 9) shots.push("");
        return { instruction, shots: shots.slice(0, 9) };
      });

      setGeneratedPrompts(parsed);
      saveToHistory(parsed, analysis);
      setState(AppState.COMPLETED);
    } catch (err) {
      setError("生成分镜提示词失败。");
      setState(AppState.EDITING_GLOBAL);
    }
  };

  const handleShotEdit = (schemeIdx: number, shotIdx: number, val: string) => {
    const next = [...generatedPrompts];
    next[schemeIdx].shots[shotIdx] = val;
    setGeneratedPrompts(next);
  };

  const handleInstructionEdit = (schemeIdx: number, val: string) => {
    const next = [...generatedPrompts];
    next[schemeIdx].instruction = val;
    setGeneratedPrompts(next);
  };

  const constructFullPrompt = (schemeIdx: number) => {
    const { instruction, shots } = generatedPrompts[schemeIdx];
    return `${instruction}\n${shots.map((s, i) => `镜头0${i+1}: ${s}`).join('\n')}`;
  };

  const getSerialID = (index: number) => {
    const date = new Date();
    const YYYYMMDD = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    const seq = (index + 1).toString().padStart(3, '0');
    return `${productName || '产品'}-${YYYYMMDD}${seq}`;
  };

  const renderSingleImage = async (index: number) => {
    const fullPrompt = constructFullPrompt(index);
    if (!fullPrompt || images.length === 0) return;
    setState(AppState.GENERATING_IMAGE);
    try {
      const refImg = images.find(i => i.type === 'image')?.data || images[0].data;
      const img = await generateStoryboardImage(fullPrompt, refImg);
      setRenderedImages(prev => ({ ...prev, [index]: img }));
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError(`分镜方案 ${index + 1} 渲染失败。`);
      setState(AppState.COMPLETED);
    }
  };

  const startGenerateAllImages = async () => {
    if (generatedPrompts.length === 0 || images.length === 0) return;
    setState(AppState.GENERATING_IMAGE);
    const total = generatedPrompts.length;
    setBatchProgress({ current: 0, total });
    
    for (let i = 0; i < total; i++) {
      setBatchProgress({ current: i + 1, total });
      try {
        const fullPrompt = constructFullPrompt(i);
        const refImg = images.find(img => img.type === 'image')?.data || images[0].data;
        const img = await generateStoryboardImage(fullPrompt, refImg);
        setRenderedImages(prev => ({ ...prev, [i]: img }));
      } catch (err) {
        console.error(`Index ${i} failed`, err);
      }
    }
    setBatchProgress(null);
    setState(AppState.COMPLETED);
  };

  const downloadAllRenderedImages = () => {
    Object.keys(renderedImages).forEach((key) => {
      const idx = parseInt(key);
      const link = document.createElement('a');
      link.href = renderedImages[idx];
      link.download = `${idx + 1}.png`; 
      link.click();
    });
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;
    const headers = ['序号', '产品名称-年月日序号', '主指令', '镜头01', '镜头02', '镜头03', '镜头04', '镜头05', '镜头06', '镜头07', '镜头08', '镜头09'];
    const rows = generatedPrompts.map((p, index) => {
      return [
        (index + 1).toString(),
        getSerialID(index),
        p.instruction,
        ...p.shots
      ].map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyboard_${productName}_${new Date().getTime()}.csv`;
    link.click();
  };

  const splitImageIntoNine = (imageBase64: string, prefix: string) => {
    const img = new Image();
    img.src = imageBase64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cellWidth = img.width / 3;
      const cellHeight = img.height / 3;
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.clearRect(0, 0, cellWidth, cellHeight);
          ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
          const splitData = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = splitData;
          link.download = `${prefix}_shot_${row * 3 + col + 1}.png`;
          link.click();
        }
      }
    };
  };

  const generateSingleVideo = async (index: number) => {
    const fullPrompt = constructFullPrompt(index);
    const finalImage = renderedImages[index];
    if (!fullPrompt || !finalImage) return;
    
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
    
    setState(AppState.GENERATING_VIDEO);
    try {
      const urls: VideoResult[] = [];
      for (let i = 0; i < videoCount; i++) {
        setVideoStatus(`正在通过 Veo 渲染视频 ${i + 1}/${videoCount}...`);
        const videoUrl = await generateVideo(fullPrompt, finalImage, (status) => setVideoStatus(status));
        urls.push({ id: Math.random().toString(36).substr(2, 9), url: videoUrl });
      }
      setVideoResults(prev => ({ ...prev, [index]: urls }));
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("视频渲染失败，请检查鉴权。");
      setState(AppState.COMPLETED);
    } finally {
      setVideoStatus('');
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32 flex flex-col gap-16">
      <header className="flex flex-col md:flex-row items-center justify-between gap-10">
        <div className="text-left">
          <div className="inline-flex items-center gap-4 p-4 bg-black rounded-3xl mb-6 shadow-xl">
             <Sparkles className="text-white w-8 h-8" />
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Storyboard Pro</h1>
          </div>
          <p className="text-slate-400 text-lg font-medium tracking-tight uppercase tracking-[0.1em]">AI 商业分镜全自动产线 • 结构锁定 • 溯源可调</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHistory(true)} className="px-8 py-4 bg-slate-100 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-slate-200 transition-all border border-slate-200">
            <History className="w-5 h-5" /> 历史溯源库
          </button>
          <button onClick={async () => { /* @ts-ignore */ await window.aistudio.openSelectKey(); }} className="px-8 py-4 bg-black text-white rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-xl">云鉴权管理</button>
        </div>
      </header>

      {/* STEP 1: ASSET UPLOAD */}
      <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 shadow-sm w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div className="flex items-center gap-6">
            <span className="w-16 h-16 rounded-[2rem] bg-black text-white flex items-center justify-center text-2xl font-black">01</span>
            <h2 className="text-4xl font-black">资产采集与命名</h2>
          </div>
          <div className="px-6 py-3 bg-white rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm">
            首张图将作为 3x3 网格的结构参考源
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-8 mb-12">
          {images.map((img, i) => (
            <div key={img.id} className={`relative aspect-square rounded-[2rem] overflow-hidden border-4 transition-all ${i === 0 ? 'border-black ring-8 ring-black/5 shadow-2xl scale-105 z-10' : 'border-white shadow-md'}`}>
              {img.type === 'video' ? (
                <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                   <Video className="w-10 h-10 text-slate-400" />
                </div>
              ) : (
                <img src={img.data} className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <span className="text-white font-black text-[10px] tracking-widest uppercase">{i === 0 ? '核心结构源' : img.type === 'video' ? '视频参考' : '视角参考'}</span>
              </div>
              <button onClick={() => removeImage(img.id)} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-xl">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {images.length < 12 && (
            <>
              <label className="aspect-square flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:bg-white hover:border-black transition-all group">
                <Camera className="w-10 h-10 text-slate-300 group-hover:text-black" />
                <span className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-black">传图</span>
                <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, 'image')} />
              </label>
              <label className="aspect-square flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:bg-white hover:border-blue-500 transition-all group">
                <Video className="w-10 h-10 text-slate-300 group-hover:text-blue-500" />
                <span className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-500">传视频</span>
                <input type="file" className="hidden" accept="video/mp4,video/quicktime" multiple onChange={(e) => handleFileUpload(e, 'video')} />
              </label>
            </>
          )}
        </div>

        <div className="mb-12">
          <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4 block">产品识别名称</label>
          <input 
            type="text" 
            placeholder="例如：智能扭腰机、高端全自动筋膜枪..." 
            className="w-full p-8 text-3xl font-black bg-white border-4 border-slate-100 rounded-[2.5rem] outline-none focus:border-black transition-all shadow-inner"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
        </div>

        <button 
          disabled={images.length === 0 || !productName || state === AppState.ANALYZING_INDIVIDUAL}
          onClick={startIndividualAnalysis}
          className="w-full py-8 rounded-[2.5rem] bg-black text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] active:scale-[0.98] transition-all shadow-2xl disabled:bg-slate-200 disabled:shadow-none"
        >
          {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Search className="w-10 h-10" /> 启动资产深度解析</>}
        </button>
      </section>

      {/* INDIVIDUAL ANALYSIS DISPLAY - Enhanced with Motion Dynamics and Keyframes */}
      {analysis && analysis.individualAnalyses.length > 0 && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">02</span>
            <h2 className="text-4xl font-black">结构与动态解析</h2>
          </div>
          <div className="space-y-12">
            {analysis.individualAnalyses.map((item, idx) => {
              const matchingAsset = images.find(img => img.id === item.id);
              const isVideoAsset = matchingAsset?.type === 'video';

              return (
                <div key={item.id} className="flex flex-col gap-8 p-10 bg-white rounded-[3rem] shadow-sm items-start border border-slate-100">
                  <div className="flex flex-col lg:flex-row gap-10 w-full">
                    <div className="w-full lg:w-60 aspect-square rounded-[2rem] overflow-hidden border-4 border-slate-50 flex-shrink-0 relative">
                      {isVideoAsset ? (
                        <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                          <Video className="w-12 h-12 text-slate-500" />
                          <div className="absolute top-4 left-4 px-3 py-1 bg-blue-500 text-white text-[10px] font-black rounded-lg uppercase">Video Asset</div>
                        </div>
                      ) : (
                        <img src={matchingAsset?.data} className="w-full h-full object-cover" />
                      )}
                    </div>
                    
                    <div className="flex-1 space-y-6 w-full">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">核心结构与材质描述</label>
                        <textarea 
                          className="w-full p-6 text-lg font-bold bg-slate-50 border-0 rounded-3xl focus:ring-4 focus:ring-indigo-50 outline-none resize-none min-h-[120px]"
                          value={item.description}
                          onChange={(e) => {
                            const n = [...analysis.individualAnalyses];
                            n[idx].description = e.target.value;
                            setAnalysis({...analysis, individualAnalyses: n});
                          }}
                        />
                      </div>

                      {isVideoAsset && item.motionDynamics && (
                        <div className="space-y-4 animate-in fade-in duration-500">
                          <div className="flex items-center gap-3">
                            <Activity className="w-4 h-4 text-blue-500" />
                            <label className="text-[10px] font-black uppercase tracking-widest text-blue-500">动态结构与运动分析 (Motion Dynamics)</label>
                          </div>
                          <textarea 
                            className="w-full p-6 text-lg font-bold bg-blue-50/30 text-blue-900 border-2 border-blue-50 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none resize-none min-h-[120px]"
                            value={item.motionDynamics}
                            onChange={(e) => {
                              const n = [...analysis.individualAnalyses];
                              n[idx].motionDynamics = e.target.value;
                              setAnalysis({...analysis, individualAnalyses: n});
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Keyframes Gallery for Video */}
                  {isVideoAsset && item.keyframes && item.keyframes.length > 0 && (
                    <div className="w-full pt-8 border-t border-slate-50">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 block">提取的关键帧 (Keyframes Extraction)</label>
                       <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                          {item.keyframes.map((frame, fidx) => (
                            <div key={fidx} className="aspect-video rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm hover:scale-105 transition-transform cursor-pointer" onClick={() => setZoomImage(frame)}>
                               <img src={frame} className="w-full h-full object-cover" />
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button disabled={state === AppState.ANALYZING_GLOBAL} onClick={startGlobalSynthesis} className="w-full mt-12 py-8 rounded-[2.5rem] bg-indigo-600 text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] shadow-xl">
            {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Zap className="w-10 h-10" /> 提炼全局核心基因</>}
          </button>
        </section>
      )}

      {/* STORYBOARD CONFIG */}
      {analysis && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-emerald-600 text-white flex items-center justify-center text-2xl font-black">03</span>
            <h2 className="text-4xl font-black">分镜生产设定</h2>
          </div>
          <div className="bg-white p-12 rounded-[3rem] shadow-sm mb-12 space-y-12">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 block">产品结构与交互锁定 (AI 已自动提取)</label>
              <textarea 
                className="w-full p-8 text-2xl font-black bg-slate-50 border-0 rounded-[2rem] focus:ring-8 focus:ring-emerald-50 min-h-[140px]" 
                value={analysis.globalProfile.details} 
                onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} 
              />
            </div>
            <div className="flex flex-col xl:flex-row gap-12">
              <div className="flex-1 space-y-8">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 block">商业叙事场景</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {SCENE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setSceneType(opt)} className={`py-6 px-4 rounded-3xl text-sm font-black border-4 transition-all ${sceneType === opt ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200'}`}>{opt}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 space-y-8">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 block">产出份数与语言 (1-50)</label>
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div className="flex bg-slate-100 p-2 rounded-[2rem] w-full">
                    <button onClick={() => setLanguage('zh')} className={`flex-1 py-4 text-sm font-black rounded-2xl ${language === 'zh' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400'}`}>中文策划</button>
                    <button onClick={() => setLanguage('en')} className={`flex-1 py-4 text-sm font-black rounded-2xl ${language === 'en' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400'}`}>ENG Creative</button>
                  </div>
                  <input type="number" min="1" max="50" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-24 bg-slate-100 p-4 text-center text-2xl font-black rounded-[2rem] outline-none border-4 border-transparent focus:border-emerald-300 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>
          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-8 rounded-[2.5rem] bg-emerald-600 text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] shadow-2xl transition-all">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Settings2 className="w-10 h-10" /> 立即启动全自动分镜生产</>}
          </button>
        </section>
      )}

      {/* FINAL OUTPUT AREA */}
      {generatedPrompts.length > 0 && (
        <section className="space-y-16 animate-in fade-in duration-1000 w-full">
          <div className="bg-black p-12 rounded-[4rem] text-white flex flex-col xl:flex-row items-center justify-between gap-12 shadow-2xl">
            <div className="space-y-4 text-center xl:text-left">
              <h2 className="text-4xl font-black flex items-center justify-center xl:justify-start gap-6">
                <Package className="w-12 h-12 text-emerald-400" />
                资产看板
              </h2>
              <p className="text-slate-500 font-bold text-lg">产品：{productName} | 已自动策划 {generatedPrompts.length} 套独立方案</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <button onClick={downloadPromptsAsCSV} className="px-10 py-5 bg-white text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all shadow-lg">
                <FileDown className="w-6 h-6" /> 导出策划表格 (CSV)
              </button>
              <button onClick={startGenerateAllImages} disabled={state === AppState.GENERATING_IMAGE} className="px-10 py-5 bg-emerald-500 text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all shadow-lg">
                {batchProgress ? <><Loader2 className="w-6 h-6 animate-spin" /> {batchProgress.current}/{batchProgress.total}</> : <><Layers className="w-6 h-6" /> 一键渲染全部方案图</>}
              </button>
              {Object.keys(renderedImages).length > 0 && (
                <button onClick={downloadAllRenderedImages} className="px-10 py-5 bg-indigo-500 text-white rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all shadow-lg">
                  <Download className="w-6 h-6" /> 批量下载成品 (序号命名)
                </button>
              )}
            </div>
          </div>

          <div className="space-y-24">
            {generatedPrompts.map((p, idx) => (
              <div key={idx} className="bg-white p-12 rounded-[4rem] shadow-2xl border-4 border-slate-50 flex flex-col gap-12 overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                  <div className="flex items-center gap-8">
                    <span className="w-16 h-16 rounded-[2rem] bg-slate-900 text-white flex items-center justify-center text-2xl font-black">#{idx + 1}</span>
                    <div className="flex flex-col">
                       <h3 className="text-2xl font-black tracking-tight">{getSerialID(idx)}</h3>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Storyboard Project Identity</span>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => renderSingleImage(idx)} className="px-8 py-4 bg-black text-white rounded-2xl font-black text-xs hover:scale-105 transition-all flex items-center gap-3">
                       {state === AppState.GENERATING_IMAGE ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> 渲染此 3x3 九宫格</>}
                    </button>
                  </div>
                </div>

                <div className="space-y-12 bg-slate-50 p-12 rounded-[3rem] border border-slate-100">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 block">主指令 (包含结构一致性核心关键词)</label>
                    <textarea 
                      className="w-full p-6 text-lg font-bold bg-white border-2 border-transparent rounded-3xl focus:border-emerald-500 outline-none resize-none leading-relaxed italic shadow-sm"
                      value={p.instruction}
                      rows={2}
                      onChange={(e) => handleInstructionEdit(idx, e.target.value)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {p.shots.map((shotContent, si) => (
                      <div key={si} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:border-emerald-500 group">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-4">
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">0{si+1}</div>
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">镜头定位 (Shot)</span>
                          </div>
                          <button onClick={() => copyToClipboard(shotContent, `shot-${idx}-${si}`)} className="p-2 text-slate-300 hover:text-emerald-500 transition-colors">
                             {copyStates[`shot-${idx}-${si}`] ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <textarea 
                          className="w-full p-2 text-sm font-medium text-slate-700 bg-transparent border-0 outline-none resize-none min-h-[120px]"
                          value={shotContent}
                          onChange={(e) => handleShotEdit(idx, si, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                  {renderedImages[idx] && (
                    <div className="space-y-8">
                       <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest">成品九宫格预览</h4>
                          <div className="flex gap-4">
                             <button onClick={() => setZoomImage(renderedImages[idx])} className="px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-slate-200">
                               <Maximize2 className="w-3.5 h-3.5" /> 放大细节
                             </button>
                             <button onClick={() => splitImageIntoNine(renderedImages[idx], getSerialID(idx))} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-emerald-100">
                               <Scissors className="w-3.5 h-3.5" /> 拆解为 9 张单图
                             </button>
                          </div>
                       </div>
                       <div className="aspect-video bg-slate-900 rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl cursor-zoom-in group relative" onClick={() => setZoomImage(renderedImages[idx])}>
                          <img src={renderedImages[idx]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                             <Search className="text-white w-12 h-12" />
                          </div>
                       </div>
                    </div>
                  )}
                  {renderedImages[idx] && (
                    <div className="space-y-8">
                      <div className="flex items-center justify-between">
                         <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest">动态视频扩展 (Veo 驱动)</h4>
                         <button onClick={() => generateSingleVideo(idx)} disabled={state === AppState.GENERATING_VIDEO} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 flex items-center gap-3">
                           {state === AppState.GENERATING_VIDEO ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" /> 生产 1080P 预览</>}
                         </button>
                      </div>
                      <div className="grid grid-cols-1 gap-8">
                        {(videoResults[idx] || []).map((v, vi) => (
                          <div key={v.id} className="aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-slate-50 relative group">
                            <video src={v.url} controls className="w-full h-full object-cover" />
                            <a href={v.url} download={`${getSerialID(idx)}_video_${vi+1}.mp4`} className="absolute bottom-6 right-6 p-4 bg-white text-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-2xl hover:scale-110"><Download className="w-6 h-6" /></a>
                          </div>
                        ))}
                        {!(videoResults[idx] || []).length && (
                          <div className="aspect-video bg-slate-100 rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                             <Video className="w-16 h-16 mb-4 opacity-50" />
                             <p className="text-sm font-bold">待生产动态资产</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MODALS */}
      {zoomImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
           <button onClick={() => setZoomImage(null)} className="absolute top-8 right-8 text-white p-4 hover:bg-white/10 rounded-full transition-all">
             <X className="w-10 h-10" />
           </button>
           <img src={zoomImage} className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_100px_rgba(255,255,255,0.1)]" />
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in">
           <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col">
              <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                 <div className="flex items-center gap-6">
                   <div className="p-4 bg-indigo-600 rounded-2xl text-white">
                      <History className="w-8 h-8" />
                   </div>
                   <h3 className="text-3xl font-black text-slate-900 tracking-tight">产品分镜历史库</h3>
                 </div>
                 <button onClick={() => setShowHistory(false)} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50">
                    <X className="w-6 h-6" />
                 </button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-6">
                 {history.length === 0 ? (
                    <div className="py-20 text-center text-slate-300">
                       <Clock className="w-16 h-16 mx-auto mb-6 opacity-20" />
                       <p className="text-xl font-bold">暂无历史生产记录</p>
                    </div>
                 ) : (
                    history.map(record => (
                       <div key={record.id} className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-all cursor-pointer" onClick={() => loadHistoryRecord(record)}>
                          <div className="flex items-center gap-8">
                             <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-white">
                                <img src={record.referenceImage} className="w-full h-full object-cover" />
                             </div>
                             <div>
                                <h4 className="text-2xl font-black text-slate-900 mb-1">{record.productName}</h4>
                                <div className="flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
                                   <span>{new Date(record.timestamp).toLocaleString()}</span>
                                   <span>•</span>
                                   <span>{record.prompts.length} 套方案已锁定</span>
                                </div>
                             </div>
                          </div>
                          <div className="p-4 bg-white rounded-2xl shadow-sm text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                             <ChevronRight className="w-6 h-6" />
                          </div>
                       </div>
                    ))
                 )}
              </div>
              <div className="p-10 border-t border-slate-100 flex justify-end gap-6 bg-slate-50">
                 <button onClick={clearHistory} className="px-8 py-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs hover:bg-red-100">清空溯源数据库</button>
              </div>
           </div>
        </div>
      )}

      {/* FOOTER STATUS BAR */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-3xl border-t border-slate-200 py-6 px-12 flex items-center justify-between z-50 shadow-[0_-10px_50px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-6">
          <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)] ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-emerald-500 animate-pulse'}`}></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">流水线实时状态</span>
            <span className="text-xs font-black text-slate-900 tracking-tight">
              {state === AppState.GENERATING_IMAGE ? '正在批量渲染九宫格成品...' : 
               state === AppState.GENERATING_VIDEO ? videoStatus || '正在通过 Veo 渲染动态流...' : 
               state === AppState.ANALYZING_INDIVIDUAL ? '正在对产线资产进行深度扫描(包含动态分析)...' :
               state === AppState.GENERATING_PROMPTS ? '正在进行创意分镜策划...' :
               '流水线就绪 (Structural Locking Enabled)'}
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-4 px-6 py-2 bg-indigo-50 border border-indigo-100 rounded-2xl text-[10px] font-black text-indigo-600 uppercase tracking-widest">
           <Box className="w-3.5 h-3.5" /> 结构与运动锁定：已激活
        </div>
      </footer>

      {error && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
           <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full text-center space-y-6 animate-in zoom-in duration-200">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                 <X className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">操作提示</h3>
              <p className="text-slate-500 font-medium leading-relaxed">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-5 bg-black text-white rounded-2xl font-black text-lg hover:scale-105 transition-all">我明白了</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
