
import React, { useState } from 'react';
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
  Info
} from 'lucide-react';
import { AppState, ProductAnalysis, IndividualAnalysis, SceneType } from './types';
import { analyzeIndividualImages, synthesizeProductProfile, generateStoryboards, generateStoryboardImage } from './services/geminiService';

const SCENE_OPTIONS: SceneType[] = ['Studio', 'Lifestyle', 'Outdoor', 'Tech/Laboratory', 'Cinematic', 'Minimalist'];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [images, setImages] = useState<{id: string, data: string}[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [promptCount, setPromptCount] = useState<number>(3);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [sceneType, setSceneType] = useState<SceneType>('Studio');
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState<number>(0);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError("参考图分析失败，请检查网络或图片质量。");
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
      setError("全局分析推导失败。");
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

  const generateImage = async () => {
    const prompt = generatedPrompts[selectedPromptIndex];
    if (!prompt) return;
    setState(AppState.GENERATING_IMAGE);
    setFinalImage(null);
    try {
      const img = await generateStoryboardImage(prompt);
      setFinalImage(img);
      setState(AppState.COMPLETED);
    } catch (err: any) {
      setError("图片生成失败。");
      setState(AppState.COMPLETED);
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-12 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl mb-4">
          <Sparkles className="text-blue-600 w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
          AI 商业分镜生成系统
        </h1>
        <p className="mt-4 text-slate-500 max-w-2xl mx-auto text-lg">
          上传多张参考图，AI 逐图分析并综合推导产品属性，为您定制 9 宫格分镜方案。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 左侧：输入与分析配置 */}
        <div className="lg:col-span-6 space-y-6">
          <section className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
            <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-slate-800">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">1</span>
              第一步：上传参考图 (最多10张)
            </h2>
            
            <div className="grid grid-cols-5 gap-3 mb-6">
              {images.map((img, i) => (
                <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border-2 border-slate-100 group transition-all">
                  <img src={img.data} className="w-full h-full object-cover" alt={`Ref ${i+1}`} />
                  <div className="absolute inset-0 bg-black/40 opacity-100 flex items-center justify-center">
                     <span className="text-[10px] font-black text-white px-2 py-1 bg-black/20 rounded-full">图{i+1}</span>
                  </div>
                  <button 
                    onClick={() => removeImage(img.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {images.length < 10 && (
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
                  <Camera className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
                </label>
              )}
            </div>

            <button 
              disabled={images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL}
              onClick={startIndividualAnalysis}
              className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 ${
                images.length === 0 || state === AppState.ANALYZING_INDIVIDUAL 
                  ? 'bg-slate-100 text-slate-400'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
              }`}
            >
              {state === AppState.ANALYZING_INDIVIDUAL ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  开始逐图分析内容
                </>
              )}
            </button>
          </section>

          {analysis && analysis.individualAnalyses.length > 0 && (
            <section className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in slide-in-from-bottom-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black flex items-center gap-3 text-slate-800">
                  <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm">2</span>
                  第二步：参考图详情 (可修改)
                </h2>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black">可修改每一张图的分析</span>
                </div>
              </div>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {analysis.individualAnalyses.map((item, idx) => {
                  const imgData = images.find(img => img.id === item.id)?.data;
                  return (
                    <div key={item.id} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-indigo-200 transition-all group">
                      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200">
                        <img src={imgData} className="w-full h-full object-cover" alt={`Ref ${idx+1}`} />
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between mb-1.5">
                           <span className="text-[11px] font-black text-indigo-500 uppercase">参考图 {idx+1}</span>
                        </div>
                        <textarea 
                          className="w-full p-3 text-xs bg-white border-0 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                          value={item.description}
                          rows={2}
                          onChange={(e) => {
                            const newAnalyses = [...analysis.individualAnalyses];
                            newAnalyses[idx].description = e.target.value;
                            setAnalysis({ ...analysis, individualAnalyses: newAnalyses });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8">
                <button 
                  disabled={state === AppState.ANALYZING_GLOBAL}
                  onClick={startGlobalSynthesis}
                  className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    state === AppState.ANALYZING_GLOBAL 
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200'
                  }`}
                >
                  {state === AppState.ANALYZING_GLOBAL ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      根据参考图推导全局档案
                    </>
                  )}
                </button>
              </div>
            </section>
          )}

          {analysis && state !== AppState.ANALYZING_GLOBAL && (state === AppState.EDITING_GLOBAL || state === AppState.GENERATING_PROMPTS || state === AppState.COMPLETED) && (
             <section className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in slide-in-from-bottom-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-black flex items-center gap-3 text-slate-800">
                    <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm">3</span>
                    第三步：产品全局属性 (可修改)
                  </h2>
                </div>

                <div className="space-y-6">
                  <div className="group">
                    <label className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      <Box className="w-3.5 h-3.5" />
                      综合产品细节
                    </label>
                    <textarea 
                      className="w-full p-4 text-sm bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 focus:bg-white outline-none min-h-[80px] transition-all shadow-inner"
                      value={analysis.globalProfile.details}
                      onChange={(e) => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, details: e.target.value}})}
                    />
                  </div>

                  <div className="group">
                    <label className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      <Zap className="w-3.5 h-3.5" />
                      核心功能/场景
                    </label>
                    <textarea 
                      className="w-full p-4 text-sm bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 focus:bg-white outline-none min-h-[80px] transition-all shadow-inner"
                      value={analysis.globalProfile.usage}
                      onChange={(e) => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, usage: e.target.value}})}
                    />
                  </div>

                  <div className="group">
                    <label className="flex items-center gap-2 text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                      <RefreshCw className="w-3.5 h-3.5" />
                      使用操作演示
                    </label>
                    <textarea 
                      className="w-full p-4 text-sm bg-slate-50 border-2 border-transparent rounded-2xl focus:border-indigo-500 focus:bg-white outline-none min-h-[80px] transition-all shadow-inner"
                      value={analysis.globalProfile.howToUse}
                      onChange={(e) => setAnalysis({...analysis, globalProfile: {...analysis.globalProfile, howToUse: e.target.value}})}
                    />
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100 space-y-8">
                  <div className="grid grid-cols-2 gap-2">
                    {SCENE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setSceneType(opt)}
                        className={`py-3 px-4 rounded-xl text-xs font-black border-2 transition-all ${
                          sceneType === opt 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
                      <button onClick={() => setLanguage('zh')} className={`px-5 py-2.5 text-xs font-black rounded-xl transition-all ${language === 'zh' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>中文</button>
                      <button onClick={() => setLanguage('en')} className={`px-5 py-2.5 text-xs font-black rounded-xl transition-all ${language === 'en' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>English</button>
                    </div>
                    <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
                      <span className="text-xs font-black text-slate-500">数量:</span>
                      <input type="number" min="1" max="50" value={promptCount} onChange={(e) => setPromptCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} className="w-12 py-1.5 border-b-2 border-indigo-200 bg-transparent text-center text-sm font-black outline-none focus:border-indigo-600" />
                    </div>
                  </div>
                  
                  <button onClick={startPromptGeneration} disabled={state === AppState.GENERATING_PROMPTS} className={`w-full py-5 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 ${state === AppState.GENERATING_PROMPTS ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl'}`}>
                    {state === AppState.GENERATING_PROMPTS ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Settings2 className="w-6 h-6" /> 生成分镜提示词</>}
                  </button>
                </div>
             </section>
          )}
        </div>

        {/* 右侧：生成结果展示 */}
        <div className="lg:col-span-6 space-y-6">
          {generatedPrompts.length > 0 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700">
              <section className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-2xl font-black flex items-center gap-3 text-slate-800">
                      分镜方案
                    </h2>
                    <button onClick={downloadPromptsAsCSV} className="inline-flex items-center gap-2 text-xs font-black text-emerald-600 hover:text-emerald-700">
                      <TableIcon className="w-3.5 h-3.5" /> 下载表格 (.csv)
                    </button>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar max-w-[240px]">
                    {generatedPrompts.map((_, i) => (
                      <button key={i} onClick={() => setSelectedPromptIndex(i)} className={`flex-shrink-0 w-8 h-8 rounded-lg font-black transition-all border-2 ${selectedPromptIndex === i ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-100 text-slate-400'}`}>{i + 1}</button>
                    ))}
                  </div>
                </div>

                <div className="relative group mb-8">
                  <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-[1.5rem] font-mono text-xs text-slate-700 leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar shadow-inner">
                    <div className="whitespace-pre-wrap">{generatedPrompts[selectedPromptIndex]}</div>
                  </div>
                  <button onClick={() => copyToClipboard(generatedPrompts[selectedPromptIndex])} className="absolute top-3 right-3 p-2 bg-white text-slate-500 rounded-xl shadow-lg border border-slate-100 hover:text-blue-600 transition-all active:scale-90"><Copy className="w-4 h-4" /></button>
                </div>

                <div className="flex flex-col items-center">
                  <button onClick={generateImage} disabled={state === AppState.GENERATING_IMAGE} className={`group px-12 py-5 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-4 transition-all shadow-xl ${state === AppState.GENERATING_IMAGE ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-black hover:scale-[1.03] active:scale-95'}`}>
                    {state === AppState.GENERATING_IMAGE ? <><Loader2 className="w-6 h-6 animate-spin" /> 正在渲染 9 宫格...</> : <><ImageIcon className="w-6 h-6" /> 生成 9 宫格预览图</>}
                  </button>
                </div>
              </section>

              {finalImage && (
                <section className="bg-white p-6 rounded-[2.5rem] shadow-2xl border-2 border-slate-100 animate-in zoom-in-95 duration-700">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-black flex items-center gap-3">渲染成品展示</h2>
                    <a href={finalImage} download="ai-storyboard.png" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2 text-sm"><Download className="w-4 h-4" /> 下载成品</a>
                  </div>
                  <div className="rounded-[1.5rem] overflow-hidden bg-slate-100 shadow-inner group relative">
                    <img src={finalImage} className="w-full h-auto object-contain" alt="Final Storyboard" />
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center"><p className="text-[9px] font-black uppercase text-slate-400">一致性</p><p className="text-[10px] font-black text-slate-700">物理结构锁定</p></div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center"><p className="text-[9px] font-black uppercase text-slate-400">色彩</p><p className="text-[10px] font-black text-slate-700">光影同步</p></div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center"><p className="text-[9px] font-black uppercase text-slate-400">分辨率</p><p className="text-[10px] font-black text-slate-700">8K Cinematic</p></div>
                  </div>
                </section>
              )}
            </div>
          )}

          {!generatedPrompts.length && state !== AppState.GENERATING_PROMPTS && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-[3rem] p-12 text-center bg-slate-50/50">
              <div className="p-8 bg-white rounded-full mb-6 shadow-xl"><LayoutGrid className="w-16 h-16 text-slate-100" /></div>
              <h3 className="text-xl font-black text-slate-400">分镜预览区</h3>
              <p className="text-slate-400 mt-2 max-w-xs mx-auto font-medium">请完成左侧的逐图分析与档案推导，系统将为您生成专业的商业分镜方案。</p>
            </div>
          )}

          {state === AppState.GENERATING_PROMPTS && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center space-y-6 bg-indigo-50/20 rounded-[3rem] border-2 border-indigo-100 border-dashed">
              <div className="relative"><Loader2 className="w-16 h-16 text-indigo-400 animate-spin" /></div>
              <div className="text-center">
                <p className="text-xl font-black text-indigo-600">正在推导分镜方案...</p>
                <p className="text-indigo-400 text-sm mt-2 font-bold">深度学习参考图视觉特征</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10">
          <div className="bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border-4 border-white">
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center font-black">!</div>
            <p className="font-bold">{error}</p>
            <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-red-500 rounded-xl transition-all"><Check className="w-5 h-5" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
