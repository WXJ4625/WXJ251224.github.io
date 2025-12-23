
import React, { useState, useMemo, useRef } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType, VideoResult } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateStoryboardImage, generateVideo } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [images, setImages] = useState<{id: string, data: string}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [videoCount, setVideoCount] = useState<number>(1);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  
  // Track prompts as editable objects
  const [generatedPrompts, setGeneratedPrompts] = useState<{instruction: string, shots: string[]}[]>([]);
  
  const [renderedImages, setRenderedImages] = useState<Record<number, string>>({});
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number } | null>(null);
  
  const [videoResults, setVideoResults] = useState<Record<number, VideoResult[]>>({});
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopyStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
    }).catch(err => console.error('Failed to copy: ', err));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 10) {
      setError("最多只能上传10张参考图");
      return;
    }
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), data: ev.target!.result as string }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  const startIndividualAnalysis = async () => {
    if (images.length === 0) return;
    setState(AppState.ANALYZING_INDIVIDUAL);
    setError(null);
    try {
      const results = await analyzeIndividualImages(images);
      setAnalysis({
        individualAnalyses: results,
        globalProfile: { details: '', usage: '', howToUse: '' }
      });
      setState(AppState.EDITING_INDIVIDUAL);
    } catch (err: any) {
      setError("分析失败，请检查网络。");
      setState(AppState.IDLE);
    }
  };

  const startGlobalSynthesis = async () => {
    if (!analysis) return;
    setState(AppState.ANALYZING_GLOBAL);
    try {
      const profile = await synthesizeProductProfile(analysis.individualAnalyses);
      setAnalysis({ ...analysis, globalProfile: profile });
      setState(AppState.EDITING_GLOBAL);
    } catch (err) {
      setError("综合失败。");
      setState(AppState.EDITING_INDIVIDUAL);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    setRenderedImages({});
    try {
      const results = await generateStoryboards(analysis.globalProfile, promptCount, language, sceneType);
      
      const parsed = results.map(raw => {
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
        const instruction = lines[0] || '';
        const shots = lines.filter(l => l.match(/^(?:镜头|Lens|Shot)\s*0?\d\s*:/i)).map(l => {
          const p = l.split(':');
          return p.slice(1).join(':').trim();
        });
        // Ensure exactly 9 shots for editing logic consistency
        while (shots.length < 9) shots.push("");
        return { instruction, shots: shots.slice(0, 9) };
      });

      setGeneratedPrompts(parsed);
      setState(AppState.COMPLETED);
    } catch (err) {
      setError("生成失败。");
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

  const renderSingleImage = async (index: number) => {
    const fullPrompt = constructFullPrompt(index);
    if (!fullPrompt || images.length === 0) return;
    setState(AppState.GENERATING_IMAGE);
    try {
      const img = await generateStoryboardImage(fullPrompt, images[0].data);
      setRenderedImages(prev => ({ ...prev, [index]: img }));
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError(`分镜 ${index + 1} 渲染失败。`);
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
        const img = await generateStoryboardImage(fullPrompt, images[0].data);
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
      link.download = `storyboard_grid_${idx + 1}.png`;
      link.click();
    });
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;
    const headers = ['编号', '全局主指令', '镜头01', '镜头02', '镜头03', '镜头04', '镜头05', '镜头06', '镜头07', '镜头08', '镜头09'];
    const rows = generatedPrompts.map((p, index) => {
      return [
        (index + 1).toString(),
        p.instruction,
        ...p.shots
      ].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyboard_prompts_${new Date().getTime()}.csv`;
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

  const checkAndOpenKeySelector = async () => {
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  };

  const generateSingleVideo = async (index: number) => {
    const fullPrompt = constructFullPrompt(index);
    const finalImage = renderedImages[index];
    if (!fullPrompt || !finalImage) return;

    await checkAndOpenKeySelector();
    setState(AppState.GENERATING_VIDEO);
    
    try {
      const urls: VideoResult[] = [];
      for (let i = 0; i < videoCount; i++) {
        setVideoStatus(`[方案 ${index+1}] 正在生成视频 ${i + 1}/${videoCount}...`);
        const videoUrl = await generateVideo(fullPrompt, finalImage, (status) => setVideoStatus(`[方案 ${index+1}] ${status}`));
        urls.push({ id: Math.random().toString(36).substr(2, 9), url: videoUrl });
      }
      setVideoResults(prev => ({ ...prev, [index]: urls }));
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("视频渲染失败。");
      setState(AppState.COMPLETED);
    } finally {
      setVideoStatus('');
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-12 bg-white min-h-screen text-slate-900 font-sans pb-32 flex flex-col gap-16">
      <header className="text-center">
        <div className="inline-flex items-center justify-center p-6 bg-black rounded-[2.5rem] mb-8 shadow-2xl">
          <Sparkles className="text-white w-14 h-14" />
        </div>
        <h1 className="text-7xl font-black text-slate-900 tracking-tighter mb-6 italic uppercase">
          Storyboard Pro Factory
        </h1>
        <p className="text-slate-400 text-2xl font-medium tracking-tight">
          垂直极速分镜工厂 • 提示词在线编辑 • 结构锁定渲染
        </p>
      </header>

      {/* STEP 1: UPLOAD */}
      <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 shadow-sm w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div className="flex items-center gap-6">
            <span className="w-16 h-16 rounded-[2rem] bg-black text-white flex items-center justify-center text-2xl font-black">01</span>
            <h2 className="text-4xl font-black">上传产品原型</h2>
          </div>
          <div className="px-6 py-3 bg-white rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm">
            首张图将被设定为物理结构锁定的唯一参考源
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-8 mb-12">
          {images.map((img, i) => (
            <div key={img.id} className={`relative aspect-[3/4] rounded-[2.5rem] overflow-hidden border-4 transition-all ${i === 0 ? 'border-black ring-8 ring-black/5 shadow-2xl scale-105 z-10' : 'border-white shadow-md'}`}>
              <img src={img.data} className="w-full h-full object-cover" alt="ref" />
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <span className="text-white font-black text-xs tracking-widest uppercase">{i === 0 ? '结构核心源' : `视角 ${i+1}`}</span>
              </div>
              <button onClick={() => removeImage(img.id)} className="absolute top-4 right-4 bg-red-500 text-white p-2.5 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {images.length < 12 && (
            <label className="aspect-[3/4] flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[2.5rem] cursor-pointer hover:bg-white hover:border-black transition-all group">
              <Camera className="w-12 h-12 text-slate-300 group-hover:text-black transition-colors" />
              <span className="mt-6 text-sm font-black text-slate-400 uppercase tracking-widest group-hover:text-black">点击上传</span>
              <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
            </label>
          )}
        </div>

        <button 
          disabled={images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL}
          onClick={startIndividualAnalysis}
          className="w-full py-8 rounded-[2.5rem] bg-black text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] active:scale-[0.98] transition-all shadow-2xl disabled:bg-slate-200 disabled:shadow-none"
        >
          {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Search className="w-10 h-10" /> 深度扫描产品基因</>}
        </button>
      </section>

      {/* STEP 2: ANALYSIS */}
      {analysis && analysis.individualAnalyses.length > 0 && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-indigo-600 text-white flex items-center justify-center text-2xl font-black">02</span>
            <h2 className="text-4xl font-black">视角拆解</h2>
          </div>
          <div className="space-y-8">
            {analysis.individualAnalyses.map((item, idx) => (
              <div key={item.id} className="flex flex-col lg:flex-row gap-10 p-10 bg-white rounded-[3rem] shadow-sm items-start border border-slate-100">
                <div className="w-full lg:w-48 aspect-square rounded-[2rem] overflow-hidden border-4 border-slate-50 flex-shrink-0">
                  <img src={images.find(img => img.id === item.id)?.data} className="w-full h-full object-cover" />
                </div>
                <div className="flex-grow w-full">
                  <textarea 
                    className="w-full p-8 text-xl font-bold bg-slate-50 border-0 rounded-3xl focus:ring-8 focus:ring-indigo-50 outline-none resize-none min-h-[120px] leading-relaxed"
                    value={item.description}
                    onChange={(e) => {
                      const n = [...analysis.individualAnalyses];
                      n[idx].description = e.target.value;
                      setAnalysis({...analysis, individualAnalyses: n});
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button disabled={state === AppState.ANALYZING_GLOBAL} onClick={startGlobalSynthesis} className="w-full mt-12 py-8 rounded-[2.5rem] bg-indigo-600 text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] transition-all shadow-xl active:scale-[0.98]">
            {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Zap className="w-10 h-10" /> 生成全局档案</>}
          </button>
        </section>
      )}

      {/* STEP 3: CONFIG */}
      {analysis && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
        <section className="bg-slate-50 p-12 rounded-[3.5rem] border border-slate-100 animate-in slide-in-from-bottom-12 w-full">
          <div className="flex items-center gap-6 mb-12">
            <span className="w-16 h-16 rounded-[2rem] bg-emerald-600 text-white flex items-center justify-center text-2xl font-black">03</span>
            <h2 className="text-4xl font-black">全局策略配置</h2>
          </div>
          <div className="bg-white p-12 rounded-[3rem] shadow-sm mb-12 space-y-12">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 block">产品结构与交互基调</label>
              <textarea 
                className="w-full p-10 text-2xl font-black bg-slate-50 border-0 rounded-[2.5rem] focus:ring-8 focus:ring-emerald-50 min-h-[160px] leading-snug" 
                value={analysis.globalProfile.details} 
                onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} 
              />
            </div>
            
            <div className="flex flex-col xl:flex-row gap-12">
              <div className="flex-1 space-y-8">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 block">商业场景</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {SCENE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setSceneType(opt)} className={`py-6 px-4 rounded-3xl text-sm font-black border-4 transition-all ${sceneType === opt ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200'}`}>{opt}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 space-y-8">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 block">产出设置</label>
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div className="flex bg-slate-100 p-2.5 rounded-[2rem] w-full">
                    <button onClick={() => setLanguage('zh')} className={`flex-1 py-5 text-sm font-black rounded-2xl ${language === 'zh' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400'}`}>中文</button>
                    <button onClick={() => setLanguage('en')} className={`flex-1 py-5 text-sm font-black rounded-2xl ${language === 'en' ? 'bg-white shadow-lg text-emerald-600' : 'text-slate-400'}`}>ENG</button>
                  </div>
                  <div className="flex items-center gap-6 bg-slate-100 px-10 py-5 rounded-[2rem]">
                    <span className="text-sm font-black text-slate-400 uppercase">份数</span>
                    <input type="number" min="1" max="50" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-16 bg-transparent text-center text-2xl font-black outline-none border-b-4 border-emerald-300 text-emerald-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-8 rounded-[2.5rem] bg-emerald-600 text-white font-black text-2xl flex items-center justify-center gap-6 hover:scale-[1.005] shadow-2xl transition-all">
            {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Settings2 className="w-10 h-10" /> 立即策划分镜</>}
          </button>
        </section>
      )}

      {/* STEP 4: OUTPUTS */}
      {generatedPrompts.length > 0 && (
        <section className="space-y-16 animate-in fade-in duration-1000 w-full">
          <div className="bg-black p-12 rounded-[4rem] text-white flex flex-col xl:flex-row items-center justify-between gap-12 shadow-2xl">
            <div className="space-y-4 text-center xl:text-left">
              <h2 className="text-4xl font-black flex items-center justify-center xl:justify-start gap-6">
                <Package className="w-12 h-12 text-emerald-400" />
                分镜工厂产线
              </h2>
              <p className="text-slate-500 font-bold text-lg">当前已生成 {generatedPrompts.length} 套独立方案，支持分镜级别在线微调</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <button onClick={downloadPromptsAsCSV} className="px-10 py-5 bg-white text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all">
                <FileDown className="w-6 h-6" /> 导出表格
              </button>
              <button onClick={startGenerateAllImages} disabled={state === AppState.GENERATING_IMAGE} className="px-10 py-5 bg-emerald-500 text-black rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all">
                {batchProgress ? <><Loader2 className="w-6 h-6 animate-spin" /> {batchProgress.current}/{batchProgress.total}</> : <><Layers className="w-6 h-6" /> 一键渲染全部</>}
              </button>
              {Object.keys(renderedImages).length > 0 && (
                <button onClick={downloadAllRenderedImages} className="px-10 py-5 bg-indigo-500 text-white rounded-[2rem] font-black text-lg flex items-center gap-4 hover:scale-105 transition-all">
                  <Download className="w-6 h-6" /> 批量下载大图
                </button>
              )}
            </div>
          </div>

          <div className="space-y-24">
            {generatedPrompts.map((p, idx) => (
              <div key={idx} className="bg-white p-12 rounded-[4rem] shadow-2xl border-4 border-slate-50 flex flex-col gap-12">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                  <div className="flex items-center gap-8">
                    <span className="w-16 h-16 rounded-[2rem] bg-slate-900 text-white flex items-center justify-center text-2xl font-black">#{idx + 1}</span>
                    <h3 className="text-3xl font-black tracking-tight">方案详情 (点击文本可直接修改)</h3>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <button onClick={() => renderSingleImage(idx)} className="px-8 py-4 bg-black text-white rounded-2xl font-black text-xs hover:scale-105 transition-all flex items-center gap-3">
                      {state === AppState.GENERATING_IMAGE ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> 重新渲染九宫格</>}
                    </button>
                  </div>
                </div>

                <div className="space-y-12">
                  {/* EDITABLE PROMPTS */}
                  <div className="bg-slate-50 p-12 rounded-[3rem] border border-slate-100">
                    <div className="mb-10">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 block">全局九宫格指令</label>
                      <textarea 
                        className="w-full p-6 text-lg font-bold bg-white border-2 border-transparent rounded-3xl focus:border-emerald-500 outline-none resize-none leading-relaxed italic shadow-sm"
                        value={p.instruction}
                        rows={2}
                        onChange={(e) => handleInstructionEdit(idx, e.target.value)}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {p.shots.map((shotContent, si) => (
                        <div key={si} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm focus-within:ring-4 focus-within:ring-emerald-50 transition-all">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">镜头 0{si+1}</span>
                            <button onClick={() => copyToClipboard(shotContent, `shot-${idx}-${si}`)} className="p-1 hover:text-emerald-500 text-slate-300">
                               {copyStates[`shot-${idx}-${si}`] ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          <textarea 
                            className="w-full p-2 text-sm font-medium text-slate-700 bg-transparent border-0 outline-none resize-none min-h-[80px]"
                            value={shotContent}
                            onChange={(e) => handleShotEdit(idx, si, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* MEDIA SECTION */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                    {renderedImages[idx] && (
                      <div className="space-y-8">
                         <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest">渲染成品预览</h4>
                            <div className="flex gap-4">
                               <button onClick={() => setZoomImage(renderedImages[idx])} className="px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-slate-200">
                                 <Maximize2 className="w-3.5 h-3.5" /> 放大查看
                               </button>
                               <button onClick={() => splitImageIntoNine(renderedImages[idx], `scheme_${idx+1}`)} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black flex items-center gap-2 hover:bg-emerald-100">
                                 <Scissors className="w-3.5 h-3.5" /> 拆解为9张小图
                               </button>
                            </div>
                         </div>
                         <div className="aspect-video bg-slate-900 rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl group cursor-zoom-in" onClick={() => setZoomImage(renderedImages[idx])}>
                            <img src={renderedImages[idx]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                         </div>
                      </div>
                    )}

                    {renderedImages[idx] && (
                      <div className="space-y-8">
                        <div className="flex items-center justify-between">
                           <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest">视频资产工厂</h4>
                           <div className="flex items-center gap-4 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100">
                              <input type="number" min="1" max="10" value={videoCount} onChange={e => setVideoCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-8 bg-transparent text-center font-black outline-none border-b-2 border-blue-200 text-blue-600" />
                              <button onClick={() => generateSingleVideo(idx)} disabled={state === AppState.GENERATING_VIDEO} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700">
                                {state === AppState.GENERATING_VIDEO ? <Loader2 className="w-3 h-3 animate-spin" /> : '生成视频'}
                              </button>
                           </div>
                        </div>
                        <div className="grid grid-cols-1 gap-8">
                          {(videoResults[idx] || []).map((v, vi) => (
                            <div key={v.id} className="aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-slate-50 relative group">
                              <video src={v.url} controls className="w-full h-full object-cover" />
                              <a href={v.url} download={`video_${idx+1}_${vi+1}.mp4`} className="absolute bottom-6 right-6 p-4 bg-white text-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-2xl"><Download className="w-6 h-6" /></a>
                            </div>
                          ))}
                          {(!videoResults[idx] || videoResults[idx].length === 0) && (
                            <div className="aspect-video bg-slate-50 rounded-[2.5rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-200 gap-4">
                               <Video className="w-12 h-12" />
                               <span className="text-[10px] font-black uppercase tracking-widest">就绪</span>
                            </div>
                          )}
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

      {/* ZOOM MODAL */}
      {zoomImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
           <button onClick={() => setZoomImage(null)} className="absolute top-8 right-8 text-white p-4 hover:bg-white/10 rounded-full transition-all">
             <X className="w-10 h-10" />
           </button>
           <div className="w-full h-full max-w-7xl max-h-[85vh] flex items-center justify-center">
             <img src={zoomImage} className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_100px_rgba(255,255,255,0.1)]" />
           </div>
           <div className="absolute bottom-12 flex gap-6">
              <button onClick={() => splitImageIntoNine(zoomImage, 'zoomed')} className="px-8 py-4 bg-emerald-500 text-black font-black rounded-2xl flex items-center gap-3 hover:scale-105 transition-all">
                <Scissors className="w-5 h-5" /> 立即切图下载
              </button>
              <a href={zoomImage} download="large_storyboard.png" className="px-8 py-4 bg-white text-black font-black rounded-2xl flex items-center gap-3 hover:scale-105 transition-all">
                <Download className="w-5 h-5" /> 下载全图
              </a>
           </div>
        </div>
      )}

      {/* STATUS FOOTER */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t border-slate-200 py-6 px-12 flex items-center justify-between z-50">
        <div className="flex items-center gap-6">
          <div className={`w-3 h-3 rounded-full animate-pulse ${state === AppState.IDLE ? 'bg-slate-300' : 'bg-emerald-500'}`}></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">系统状态</span>
            <span className="text-xs font-black text-slate-900 tracking-tight">
              {state === AppState.GENERATING_IMAGE ? '正在同步渲染分镜九宫格...' : 
               state === AppState.GENERATING_VIDEO ? videoStatus || '正在渲染动态流...' : 
               '工厂待命中 (结构锁定激活)'}
            </span>
          </div>
        </div>
        <button onClick={async () => { /* @ts-ignore */ await window.aistudio.openSelectKey(); }} className="px-6 py-3 bg-black text-white rounded-2xl font-black text-xs hover:bg-zinc-800 transition-all flex items-center gap-3">
          <Key className="w-4 h-4" /> 鉴权中心
        </button>
      </footer>

      {error && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
           <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl max-w-lg w-full text-center space-y-8">
              <h3 className="text-3xl font-black text-slate-900">操作异常</h3>
              <p className="text-slate-500 text-lg font-medium">{error}</p>
              <button onClick={() => setError(null)} className="w-full py-6 bg-black text-white rounded-3xl font-black text-xl hover:bg-zinc-800">关闭</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
