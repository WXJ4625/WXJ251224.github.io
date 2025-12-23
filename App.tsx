
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, 
  Trash2, 
  Search, 
  Loader2, 
  Box, 
  Zap, 
  RefreshCw, 
  Settings2, 
  Table as TableIcon, 
  CheckCircle2, 
  Copy, 
  ImageIcon, 
  Download, 
  Check, 
  Sparkles,
  ChevronRight,
  Info,
  Edit3,
  LayoutGrid,
  Layers,
  FileText,
  Video,
  Play,
  Key,
  ClipboardCopy,
  ClipboardCheck,
  ExternalLink,
  Cpu
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
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number>(0);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [videoStatus, setVideoStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopyStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
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

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

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
      setError("逐图分析失败，请检查网络。");
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
      setError("综合推导失败。");
      setState(AppState.EDITING_INDIVIDUAL);
    }
  };

  const startPromptGeneration = async () => {
    if (!analysis) return;
    setState(AppState.GENERATING_PROMPTS);
    try {
      const results = await generateStoryboards(analysis.globalProfile, promptCount, language, sceneType);
      setGeneratedPrompts(results);
      setSelectedPromptIndex(0);
      setState(AppState.COMPLETED);
    } catch (err) {
      setError("分镜生成失败。");
      setState(AppState.EDITING_GLOBAL);
    }
  };

  const startGenerateImage = async () => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt || images.length === 0) return;
    setState(AppState.GENERATING_IMAGE);
    setFinalImage(null);
    try {
      // 传递第一张参考图以锁定产品结构
      const img = await generateStoryboardImage(prompt, images[0].data);
      setFinalImage(img);
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("图片渲染失败。");
      setState(AppState.COMPLETED);
    }
  };

  const checkAndOpenKeySelector = async () => {
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  };

  const startGenerateVideo = async () => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt || !finalImage) return;

    await checkAndOpenKeySelector();

    setState(AppState.GENERATING_VIDEO);
    setVideoResults([]);
    
    try {
      const urls: VideoResult[] = [];
      for (let i = 0; i < videoCount; i++) {
        setVideoStatus(`正在生成第 ${i + 1} / ${videoCount} 个视频...`);
        const videoUrl = await generateVideo(prompt, finalImage, (status) => setVideoStatus(`[视频 ${i + 1}/${videoCount}] ${status}`));
        urls.push({ id: Math.random().toString(36).substr(2, 9), url: videoUrl });
        setVideoResults([...urls]); 
      }
      setState(AppState.COMPLETED);
    } catch (err: any) {
      if (err.message === "API_KEY_EXPIRED") {
        setError("API Key 失效，请重新选择有余额的付费项目 Key。");
        // @ts-ignore
        await window.aistudio.openSelectKey();
      } else {
        setError("视频渲染失败，请检查 API Key 权限。");
      }
      setState(AppState.COMPLETED);
    } finally {
      setVideoStatus('');
    }
  };

  const downloadPromptsAsCSV = () => {
    if (generatedPrompts.length === 0) return;
    const headers = ['ID', 'Context', 'Lens 01', 'Lens 02', 'Lens 03', 'Lens 04', 'Lens 05', 'Lens 06', 'Lens 07', 'Lens 08', 'Lens 09'];
    const rows = generatedPrompts.map((prompt, index) => {
      const lines = prompt.split(/\n+/).map(l => l.trim()).filter(l => l);
      const id = (index + 1).toString();
      const context = lines[0] || '';
      const lensData = new Array(9).fill('');
      for (let i = 1; i <= 9; i++) {
        const pattern = new RegExp(`(?:镜头|Lens|Shot)\\s*0?${i}\\s*:?\\s*(.*)`, 'i');
        const match = lines.find(l => pattern.test(l));
        if (match) {
          lensData[i - 1] = match.replace(/^(?:镜头|Lens|Shot)\s*0?${i}\s*:?\\s*/i, '').trim();
        }
      }
      return [id, context, ...lensData].map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `storyboards_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parsedShots = useMemo(() => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt) return null;
    const lines = prompt.split('\n').map(l => l.trim()).filter(l => l);
    const gridInstruction = lines[0] || '';
    const shots: { label: string, content: string }[] = [];
    
    lines.slice(1).forEach(line => {
      if (line.match(/^(?:镜头|Lens|Shot)\s*0?\d\s*:/i)) {
        const parts = line.split(':');
        shots.push({
          label: parts[0].trim(),
          content: parts.slice(1).join(':').trim()
        });
      }
    });
    return { gridInstruction, shots };
  }, [generatedPrompts, selectedPromptIndex]);

  // 针对外部免费 AI (DeepSeek, 豆包等) 优化的超级提示词
  const externalAIPrompt = useMemo(() => {
    if (!analysis || !parsedShots) return "";
    return `
# 商业产品分镜生成任务 (Storyboard Request)
## 产品核心结构细节 (Structural Reference):
${analysis.globalProfile.details}

## 场景风格 (Style/Scene): ${sceneType}

## 任务目标 (Objective): 
生成一张 16:9 比例的 3x3 九宫格分镜大图。所有分镜必须保证产品物理结构、Logo位置和材质细节的一致性。

## 分镜描述 (Shot List):
${parsedShots.shots.map(s => `${s.label}: ${s.content}`).join('\n')}

## 最终生成指令 (Final Command):
根据上述分镜列表，生成一张包含 9 个画面的聚合图。画面 1 到 9 顺序排列，产品结构锁定，环境光影同步。
    `.trim();
  }, [analysis, parsedShots]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 bg-slate-50 min-h-screen text-slate-800 font-sans pb-24">
      <header className="mb-12 text-center animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="inline-flex items-center justify-center p-4 bg-blue-600 rounded-3xl mb-6 shadow-xl shadow-blue-200">
          <Sparkles className="text-white w-10 h-10" />
        </div>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-4">
          Storyboard Master AI
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-xl font-medium">
          产品结构锁定渲染 • 全场景推导 • 支持 DeepSeek/豆包外部兼容
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* 左侧工作流 */}
        <div className="lg:col-span-5 space-y-8">
          
          <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100">
            <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
              <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold">1</span>
              上传产品图 (结构锁定源)
            </h2>
            
            <div className="grid grid-cols-5 gap-4 mb-8">
              {images.map((img, i) => (
                <div key={img.id} className={`relative aspect-square rounded-2xl overflow-hidden border-2 group transition-all hover:scale-105 shadow-sm ${i === 0 ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'}`}>
                  <img src={img.data} className="w-full h-full object-cover" alt={`Ref ${i+1}`} />
                  <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg backdrop-blur-sm ${i === 0 ? 'bg-blue-600' : 'bg-black/60'}`}>
                     <span className="text-[9px] font-black text-white">{i === 0 ? '主结构' : `图${i+1}`}</span>
                  </div>
                  <button onClick={() => removeImage(img.id)} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {images.length < 10 && (
                <label className="aspect-square flex flex-col items-center justify-center border-3 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                  <Camera className="w-8 h-8 text-slate-300 group-hover:text-blue-500" />
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                </label>
              )}
            </div>

            <button 
              disabled={images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL}
              onClick={startIndividualAnalysis}
              className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 ${
                images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-200'
              }`}
            >
              {state === AppState.ANALYZING_INDIVIDUAL ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Search className="w-6 h-6" /> 开始逐图结构分析</>}
            </button>
          </section>

          {analysis && analysis.individualAnalyses.length > 0 && (
            <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 animate-in fade-in slide-in-from-bottom-8">
              <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
                <span className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">2</span>
                细节审核与推导
              </h2>
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-3 custom-scrollbar">
                {analysis.individualAnalyses.map((item, idx) => (
                  <div key={item.id} className="flex gap-4 p-4 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                    <img src={images.find(img => img.id === item.id)?.data} className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-sm" />
                    <textarea 
                      className="flex-grow p-3 text-xs bg-white border-0 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      value={item.description}
                      rows={2}
                      onChange={(e) => {
                        const n = [...analysis.individualAnalyses];
                        n[idx].description = e.target.value;
                        setAnalysis({...analysis, individualAnalyses: n});
                      }}
                    />
                  </div>
                ))}
              </div>
              <button disabled={state === AppState.ANALYZING_GLOBAL} onClick={startGlobalSynthesis} className="w-full mt-6 py-4 rounded-2xl bg-indigo-600 text-white font-black flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg transition-all">
                {state === AppState.ANALYZING_GLOBAL ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-5 h-5" /> 生成全局结构档案</>}
              </button>
            </section>
          )}

          {analysis && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
            <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 animate-in fade-in slide-in-from-bottom-8">
              <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
                <span className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg font-bold">3</span>
                分镜生成控制台
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">最终锁定的产品结构</label>
                  <textarea className="w-full p-4 text-sm bg-slate-50 border-0 rounded-2xl focus:ring-2 focus:ring-emerald-500 min-h-[80px]" value={analysis.globalProfile.details} onChange={e => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block">场景风格</label>
                  <div className="grid grid-cols-3 gap-2">
                    {SCENE_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => setSceneType(opt)} className={`py-3 px-2 rounded-xl text-[10px] font-black border-2 transition-all ${sceneType === opt ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-100 text-slate-500'}`}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    <button onClick={() => setLanguage('zh')} className={`px-5 py-2.5 text-xs font-black rounded-xl ${language === 'zh' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>ZH</button>
                    <button onClick={() => setLanguage('en')} className={`px-5 py-2.5 text-xs font-black rounded-xl ${language === 'en' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>EN</button>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl">
                    <span className="text-xs font-black text-slate-500">份数:</span>
                    <input type="number" min="1" max="50" value={promptCount} onChange={e => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-10 bg-transparent text-center font-black outline-none border-b-2 border-emerald-200" />
                  </div>
                </div>
                <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className="w-full py-5 rounded-[1.5rem] bg-emerald-600 text-white font-black text-lg flex items-center justify-center gap-3 hover:bg-emerald-700 shadow-xl transition-all">
                  {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Settings2 className="w-6 h-6" /> 生成分镜提示词</>}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* 右侧展示区 */}
        <div className="lg:col-span-7 space-y-8">
          {generatedPrompts.length > 0 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              <section className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-2xl font-black">分镜方案列表</h2>
                   <div className="flex items-center gap-4">
                      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar max-w-[200px]">
                        {generatedPrompts.map((_, i) => (
                          <button key={i} onClick={() => setSelectedPromptIndex(i)} className={`flex-shrink-0 w-8 h-8 rounded-lg font-black border-2 transition-all ${selectedPromptIndex === i ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>{i+1}</button>
                        ))}
                      </div>
                   </div>
                </div>

                {/* 提示词展示与独立复制 */}
                <div className="space-y-4 mb-8">
                  <div className="bg-slate-900 rounded-[1.5rem] overflow-hidden shadow-2xl border-4 border-slate-800">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                         <LayoutGrid className="w-3.5 h-3.5" /> 9宫格主指令 (Gemini/MJ 适用)
                      </span>
                      <button 
                        onClick={() => copyToClipboard(parsedShots?.gridInstruction || '', 'copy-grid')} 
                        className="text-[10px] font-black px-4 py-2 bg-emerald-600/10 text-emerald-400 rounded-lg hover:bg-emerald-600/20 transition-all flex items-center gap-2"
                      >
                        {copyStates['copy-grid'] ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copyStates['copy-grid'] ? '已复制' : '复制主指令'}
                      </button>
                    </div>
                    <div className="p-5 text-emerald-400 font-mono text-[12px] leading-relaxed max-h-[100px] overflow-y-auto custom-scrollbar italic bg-slate-900 shadow-inner">
                      {parsedShots?.gridInstruction}
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-[1.5rem] border border-dashed border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                       <span className="text-[10px] font-black text-slate-500 flex items-center gap-2">
                         <Cpu className="w-4 h-4" /> 外部免费 AI 适配区 (DeepSeek / 豆包 / 元宝)
                       </span>
                       <div className="flex gap-2">
                          <button 
                            onClick={() => copyToClipboard(externalAIPrompt, 'copy-external')} 
                            className="px-4 py-2 bg-slate-800 text-white text-[10px] font-black rounded-lg hover:bg-black transition-all flex items-center gap-2 shadow-md"
                          >
                            {copyStates['copy-external'] ? <ClipboardCheck className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                            复制一键生成超级提示词
                          </button>
                       </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed italic">
                      提示：如果您希望节省额度，请点击上方按钮复制后，粘贴至 DeepSeek R1 或 豆包网页版，它们能极好地处理这种复杂的 3x3 九宫格逻辑。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {parsedShots?.shots.map((shot, idx) => (
                      <div key={idx} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-all group">
                         <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{shot.label}</span>
                            <button 
                              onClick={() => copyToClipboard(`${shot.label}: ${shot.content}`, `copy-shot-${idx}`)}
                              className="p-1.5 text-slate-300 hover:text-emerald-600 transition-colors"
                            >
                              {copyStates[`copy-shot-${idx}`] ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                         </div>
                         <p className="text-[11px] font-medium text-slate-600 leading-relaxed line-clamp-2">
                           {shot.content}
                         </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button onClick={startGenerateImage} disabled={state === AppState.GENERATING_IMAGE || images.length === 0} className="flex-1 py-5 rounded-3xl bg-slate-900 text-white font-black flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl group">
                    {state === AppState.GENERATING_IMAGE ? <><Loader2 className="w-6 h-6 animate-spin" /> 正在参考主图结构渲染...</> : <><ImageIcon className="w-6 h-6 group-hover:rotate-6 transition-all" /> 极速渲染九宫格图</>}
                  </button>
                  
                  {finalImage && (
                    <div className="flex items-center gap-4 bg-blue-50/50 px-6 rounded-3xl border border-blue-100">
                      <span className="text-xs font-black text-blue-500">视频数:</span>
                      <input type="number" min="1" max="50" value={videoCount} onChange={e => setVideoCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-10 bg-transparent text-center font-black outline-none border-b-2 border-blue-300 text-blue-600" />
                      <button onClick={startGenerateVideo} disabled={state === AppState.GENERATING_VIDEO} className="ml-2 bg-blue-600 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 shadow-lg">
                        {state === AppState.GENERATING_VIDEO ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Video className="w-4 h-4" /> 生成商业短片</>}
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {finalImage && (
                <section className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-slate-900 relative">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                      内置渲染成品展示
                    </h2>
                    <a href={finalImage} download="storyboard.png" className="flex items-center gap-2 text-indigo-600 font-black hover:underline transition-all"><Download className="w-5 h-5" /> 下载原图</a>
                  </div>
                  <div className="rounded-[1.5rem] overflow-hidden bg-slate-900 shadow-inner group relative">
                    <img src={finalImage} className="w-full h-auto object-contain cursor-zoom-in" alt="Grid" />
                    <div className="absolute top-4 left-4 bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full shadow-lg">结构锁定: 1:1 参考主图</div>
                  </div>
                </section>
              )}

              {videoResults.length > 0 && (
                <section className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-blue-600 space-y-8 animate-in slide-in-from-bottom-10">
                  <h2 className="text-2xl font-black flex items-center gap-3"><Play className="w-8 h-8 text-blue-600" /> 商业高清成品 ({videoResults.length})</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {videoResults.map((v, i) => (
                      <div key={v.id} className="relative rounded-[2rem] overflow-hidden bg-black aspect-video group shadow-xl border-4 border-slate-50">
                        <video src={v.url} controls className="w-full h-full object-cover" />
                        <div className="absolute top-4 left-4 bg-blue-600/90 backdrop-blur-md text-white text-[10px] font-black px-3 py-1 rounded-full border border-white/20">高清渲染 {i+1}</div>
                        <a href={v.url} download={`video_${i+1}.mp4`} className="absolute bottom-4 right-4 p-4 bg-white text-blue-600 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90"><Download className="w-6 h-6" /></a>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {!generatedPrompts.length && state !== AppState.GENERATING_PROMPTS && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-200 border-4 border-dashed border-slate-100 rounded-[3rem] p-16 bg-white/50">
               <div className="p-10 bg-white rounded-full mb-8 shadow-xl"><LayoutGrid className="w-20 h-20 text-slate-100" /></div>
               <h3 className="text-2xl font-black text-slate-300">分镜创意画布</h3>
               <p className="text-slate-400 mt-4 max-w-sm text-center font-medium leading-relaxed">
                 完成左侧结构分析后，这里将为您呈现基于参考图物理特性的商业分镜预览及视频。
               </p>
            </div>
          )}
          
          {state === AppState.GENERATING_VIDEO && (
             <div className="h-full min-h-[500px] flex flex-col items-center justify-center space-y-10 bg-blue-50/20 rounded-[4rem] border-4 border-blue-100 border-dashed animate-pulse p-12 text-center">
                <div className="relative">
                  <Loader2 className="w-24 h-24 text-blue-400 animate-spin" />
                  <Video className="w-10 h-10 text-blue-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div>
                   <p className="text-3xl font-black text-blue-600 mb-4">{videoStatus || "正在驱动云端视频渲染引擎..."}</p>
                   <p className="text-blue-400 text-lg font-bold">正在确保每一帧中的产品结构与您的参考图一致...</p>
                   <div className="mt-8 flex justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-0"></div>
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-150"></div>
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce delay-300"></div>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm max-w-sm">
                   <p className="text-[10px] font-black uppercase text-blue-400 mb-2">免费/低成本提示</p>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">
                     当前正在使用 Gemini 极速渲染。如果您已有 DeepSeek 等免费 API，建议点击上方“一键复制”获取更精准的外部提示词。
                   </p>
                   <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[10px] text-blue-600 font-bold underline mt-2 flex items-center justify-center gap-1">
                      计费政策说明 <ExternalLink className="w-2.5 h-2.5" />
                   </a>
                </div>
             </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-12">
          <div className="bg-red-600 text-white px-10 py-5 rounded-[2rem] shadow-2xl flex items-center gap-5 border-4 border-white">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center font-black">!</div>
            <p className="font-black text-lg">{error}</p>
            <button onClick={() => setError(null)} className="ml-6 p-2.5 hover:bg-red-500 rounded-2xl transition-all"><Check className="w-6 h-6" /></button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 py-3 px-8 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Structural Lock Mode: Active • External Compatibility: Ready</span>
        </div>
        <button 
          onClick={async () => {
             // @ts-ignore
             await window.aistudio.openSelectKey();
          }}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 transition-colors"
        >
          <Key className="w-3 h-3" /> 视频渲染鉴权中心
        </button>
      </div>
    </div>
  );
};

export default App;
