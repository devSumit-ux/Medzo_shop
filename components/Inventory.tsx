
import React, { useState, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, X, Filter, Download, Loader2, Image as ImageIcon, AlertTriangle, Calendar, Layers, Hash, DollarSign, Sparkles, Wand2, RefreshCw } from 'lucide-react';
import { Medicine } from '../types';
import ConfirmationModal from './ConfirmationModal';
import Toast, { ToastType } from './Toast';
import { supabase } from '../supabaseClient';
import { CATEGORIES } from '../constants';
import { GoogleGenAI } from "@google/genai";

interface InventoryProps {
  data: Medicine[];
  onUpdate: (item: Medicine) => Promise<boolean>;
  onAdd: (item: Medicine) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

const Inventory: React.FC<InventoryProps> = ({ data, onUpdate, onAdd, onDelete }) => {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Medicine>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  // Bulk Generation State
  const [bulkProgress, setBulkProgress] = useState<{current: number, total: number} | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Toast State
  const [toast, setToast] = useState<{ msg: string, type: ToastType, visible: boolean }>({ msg: '', type: 'success', visible: false });

  const showToast = (msg: string, type: ToastType) => {
      setToast({ msg, type, visible: true });
  };

  const filteredData = data.filter(item => {
    const searchTerm = search.toLowerCase();
    const matchesSearch = 
        item.name.toLowerCase().includes(searchTerm) || 
        item.brand.toLowerCase().includes(searchTerm) ||
        (item.batchNumber && item.batchNumber.toLowerCase().includes(searchTerm)) ||
        (item.hsnCode && item.hsnCode.toLowerCase().includes(searchTerm)) ||
        (item.manufacturer && item.manufacturer.toLowerCase().includes(searchTerm));
    
    const stock = item.stock || 0;
    
    // Expiry Check
    const today = new Date();
    const expiry = item.expiryDate ? new Date(item.expiryDate) : null;
    const isExpired = expiry && expiry < today;
    const isNearExpiry = expiry && expiry > today && expiry.getTime() - today.getTime() < (90 * 24 * 60 * 60 * 1000); // 90 days

    let matchesFilter = true;
    if (filter === 'Low Stock') matchesFilter = stock < 10;
    if (filter === 'Out of Stock') matchesFilter = stock === 0;
    if (filter === 'Near Expiry') matchesFilter = !!isNearExpiry;
    if (filter === 'Expired') matchesFilter = !!isExpired;

    return matchesSearch && matchesFilter;
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `medicines/${fileName}`;

    try {
        const { error: uploadError } = await supabase.storage
            .from('medicines')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('medicines').getPublicUrl(filePath);
        setFormData(prev => ({ ...prev, imageUrl: data.publicUrl }));
        showToast('Image uploaded successfully', 'success');
    } catch (error: any) {
        showToast('Failed to upload image: ' + error.message, 'error');
    } finally {
        setIsUploading(false);
    }
  };

  const generateAiImage = async () => {
      if (!formData.name) {
          showToast('Enter medicine name first', 'error');
          return;
      }

      setIsGeneratingImage(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: {
                  parts: [{
                      text: `A professional, realistic pharmaceutical product photography of a medicine package labeled "${formData.name}". 
                             The packaging should look medical and clean. White background. 
                             If it's a syrup, show a bottle. If tablets, show a strip or box.`
                  }]
              }
          });

          let base64Data = '';
          if (response.candidates && response.candidates[0].content.parts) {
              for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData && part.inlineData.data) {
                      base64Data = part.inlineData.data;
                      break;
                  }
              }
          }

          if (!base64Data) throw new Error("No image generated by AI");

          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/png' });

          const fileName = `ai-gen/${Date.now()}_${formData.name.replace(/\s+/g, '_')}.png`;
          const { error: uploadError } = await supabase.storage
              .from('medicines')
              .upload(fileName, blob, {
                  contentType: 'image/png'
              });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('medicines').getPublicUrl(fileName);
          
          setFormData(prev => ({ ...prev, imageUrl: urlData.publicUrl }));
          showToast('AI Image generated & saved!', 'success');

      } catch (error: any) {
          console.error("AI Image Gen Error", error);
          showToast("Failed to generate image: " + error.message, 'error');
      } finally {
          setIsGeneratingImage(false);
      }
  };

  const handleBulkImageGeneration = async () => {
    const itemsMissingImages = data.filter(item => 
        !item.imageUrl || 
        item.imageUrl === '' || 
        item.imageUrl.includes('placeholder')
    );

    if (itemsMissingImages.length === 0) {
        showToast('All items already have images!', 'success');
        return;
    }

    if (!window.confirm(`Found ${itemsMissingImages.length} items without images. This will use AI to generate product photos for them. Continue? This may take some time.`)) {
        return;
    }

    setBulkProgress({ current: 0, total: itemsMissingImages.length });
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    for (let i = 0; i < itemsMissingImages.length; i++) {
        const item = itemsMissingImages[i];
        try {
            // 1. Generate
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [{
                        text: `A clean, professional pharmaceutical product shot of "${item.name}" (${item.packing}). White background, high quality, realistic packaging.`
                    }]
                }
            });

            // 2. Process Response
            let base64Data = '';
            if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
                base64Data = response.candidates[0].content.parts[0].inlineData.data;
            }

            if (base64Data) {
                // 3. Convert & Upload
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let k = 0; k < len; k++) bytes[k] = binaryString.charCodeAt(k);
                const blob = new Blob([bytes], { type: 'image/png' });

                const fileName = `ai-gen/bulk_${Date.now()}_${item.id}.png`;
                const { error: uploadError } = await supabase.storage.from('medicines').upload(fileName, blob, { contentType: 'image/png' });
                
                if (!uploadError) {
                    const { data: urlData } = supabase.storage.from('medicines').getPublicUrl(fileName);
                    
                    // 4. Update Database & Local State
                    const success = await onUpdate({ ...item, imageUrl: urlData.publicUrl });
                    if (!success) console.warn("Failed to update item URL in DB");
                }
            }
        } catch (err) {
            console.error(`Error generating image for ${item.name}:`, err);
        }
        
        // Update progress
        setBulkProgress({ current: i + 1, total: itemsMissingImages.length });
    }

    setBulkProgress(null);
    showToast('Bulk image generation complete!', 'success');
  };

  const detectCategory = async (name: string) => {
    if (!name || name.length < 3) return;
    if (formData.category && formData.category !== 'General') return;

    setIsCategorizing(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Classify the medicine "${name}" into one specific therapeutic category (e.g., Antibiotic, Pain Relief, Cardiac, Diabetic, Vitamin, Skin Care, Gastro, Respiratory, etc.). Return ONLY the category name text. Keep it short (1-2 words).`,
        });
        const category = response.text?.trim();
        if (category) {
            const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1);
            setFormData(prev => ({ ...prev, category: formattedCategory }));
        }
    } catch (e) {
        console.error("AI Categorization failed", e);
    } finally {
        setIsCategorizing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    let success = false;

    if (!formData.name) {
        showToast('Medicine name is required', 'error');
        setIsSaving(false);
        return;
    }

    const finalData = {
        ...formData,
        category: formData.category || 'General',
        imageUrl: formData.imageUrl || 'https://via.placeholder.com/150',
        stock: Number(formData.stock),
        mrp: Number(formData.mrp),
        sellingPrice: Number(formData.sellingPrice),
        purchaseRate: Number(formData.purchaseRate),
        gstPercentage: Number(formData.gstPercentage),
        manufacturer: formData.manufacturer || '',
        packing: formData.packing || '1x1',
        rackNumber: formData.rackNumber || '',
        hsnCode: formData.hsnCode || '',
        batchNumber: formData.batchNumber || '',
        expiryDate: formData.expiryDate || null
    };

    try {
        if (formData.id) {
            success = await onUpdate(finalData as Medicine);
            if(success) showToast('Inventory updated', 'success');
        } else {
            success = await onAdd({ ...finalData, id: 'temp-id' } as Medicine);
            if(success) showToast('Item added to inventory', 'success');
        }

        if (success) {
            setIsModalOpen(false);
        } else {
            showToast('Failed to save changes.', 'error');
        }
    } catch (error) {
        showToast('An unexpected error occurred.', 'error');
        console.error(error);
    } finally {
        setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
      if (!deleteId) return;
      const success = await onDelete(deleteId);
      if (success) {
          showToast('Item deleted', 'success');
      } else {
          showToast('Failed to delete item', 'error');
      }
      setDeleteId(null);
  };

  const calculateMargin = (sp: number, cp: number) => {
      if (!sp || !cp) return 0;
      return ((sp - cp) / sp) * 100;
  };

  return (
    <div className="space-y-6 animate-fade-in relative pb-20">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.visible} onClose={() => setToast(prev => ({...prev, visible: false}))} />

      <ConfirmationModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Item?"
        message="This will remove the medicine and its batch details permanently."
        confirmText="Delete"
        isDestructive={true}
      />

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Inventory Manager</h2>
            <p className="text-slate-500 text-sm mt-1">Track batches, expiry, and rack locations</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={handleBulkImageGeneration}
                disabled={!!bulkProgress}
                className="bg-blue-50 border border-blue-100 text-blue-700 px-4 py-2.5 rounded-xl font-bold shadow-sm hover:bg-blue-100 transition flex items-center"
            >
                {bulkProgress ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {bulkProgress.current}/{bulkProgress.total}</>
                ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> AI Auto-Image</>
                )}
            </button>
            <button 
                onClick={() => { setFormData({ packing: '10s', gstPercentage: 12, stock: 0 }); setIsModalOpen(true); }} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-200 transition flex items-center"
            >
                <Plus className="w-5 h-5 mr-2"/> Add Item
            </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search name, batch, HSN, manufacturer..." 
            className="w-full pl-11 pr-4 py-3 bg-transparent outline-none text-slate-800 placeholder-slate-400 font-medium" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
        <div className="h-8 w-[1px] bg-slate-100 hidden md:block"></div>
        <div className="flex gap-2 p-1 w-full md:w-auto overflow-x-auto">
          {['All', 'Low Stock', 'Near Expiry', 'Expired'].map(f => (
            <button 
                key={f} 
                onClick={() => setFilter(f)} 
                className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap font-bold transition-all ${
                    filter === f 
                    ? f === 'Expired' ? 'bg-red-50 text-red-700 shadow-sm' : f === 'Near Expiry' ? 'bg-amber-50 text-amber-700 shadow-sm' : 'bg-emerald-50 text-emerald-700 shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
            >
                {f}
            </button>
          ))}
        </div>
      </div>

      {/* Professional Data Grid */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50/50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                    <th className="px-6 py-4">Medicine Info</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Batch / Expiry</th>
                    <th className="px-6 py-4">Stock / Rack</th>
                    <th className="px-6 py-4">Pricing (₹)</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {filteredData.length === 0 ? (
                    <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            No inventory found matching your criteria.
                        </td>
                    </tr>
                ) : (
                    filteredData.map(item => {
                        const margin = calculateMargin(item.sellingPrice || 0, item.purchaseRate || 0);
                        const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                        const isNearExpiry = item.expiryDate && !isExpired && (new Date(item.expiryDate).getTime() - new Date().getTime() < (90 * 86400000));
                        
                        return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center">
                                    <div className="w-9 h-9 bg-slate-100 rounded-lg mr-3 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200 overflow-hidden">
                                        {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : item.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                        <p className="text-[10px] text-slate-400 font-medium">{item.packing} • {item.brand}</p>
                                        {item.hsnCode && <p className="text-[9px] text-slate-400 font-mono">HSN: {item.hsnCode}</p>}
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="text-xs font-medium px-2 py-1 bg-slate-50 rounded text-slate-600 border border-slate-100">
                                    {item.category || 'General'}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded w-fit mb-1">{item.batchNumber || 'N/A'}</span>
                                    {item.expiryDate ? (
                                        <span className={`text-[11px] font-bold flex items-center ${
                                            isExpired ? 'text-red-600' : isNearExpiry ? 'text-amber-600' : 'text-emerald-600'
                                        }`}>
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {item.expiryDate}
                                            {isExpired && <span className="ml-1 bg-red-100 text-red-700 px-1 rounded text-[9px]">EXP</span>}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-slate-400">No Expiry</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <div className="flex items-center mb-1">
                                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${
                                            (item.stock || 0) < 10 ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}></span>
                                        <span className="font-bold text-slate-700 text-sm">{item.stock}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-1.5 rounded border border-slate-100 w-fit">
                                        Rack: {item.rackNumber || 'Unassigned'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col text-xs">
                                    <div className="flex justify-between w-24 mb-0.5">
                                        <span className="text-slate-400">MRP:</span>
                                        <span className="text-slate-500 line-through decoration-slate-400">₹{item.mrp}</span>
                                    </div>
                                    <div className="flex justify-between w-24">
                                        <span className="text-slate-400">Rate:</span>
                                        <span className="font-bold text-emerald-600">₹{item.sellingPrice}</span>
                                    </div>
                                    {item.purchaseRate && item.purchaseRate > 0 && (
                                        <div className="mt-1 text-[9px] text-slate-400 flex items-center" title={`Bought at ₹${item.purchaseRate}`}>
                                            Margin: <span className={`${margin > 20 ? 'text-emerald-500' : 'text-amber-500'} font-bold ml-1`}>{margin.toFixed(1)}%</span>
                                        </div>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => { setFormData(item); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"><Edit2 className="w-4 h-4"/></button>
                                    <button onClick={() => setDeleteId(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            </td>
                        </tr>
                        );
                    })
                )}
            </tbody>
            </table>
        </div>
      </div>

      {/* Professional Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                   <div>
                       <h3 className="font-bold text-xl text-slate-900 flex items-center">
                           {formData.id ? <Edit2 className="w-5 h-5 mr-2 text-emerald-600"/> : <Plus className="w-5 h-5 mr-2 text-emerald-600"/>}
                           {formData.id ? 'Edit Item Details' : 'Add New Item'}
                       </h3>
                   </div>
                   <button onClick={() => setIsModalOpen(false)} className="bg-white p-2 rounded-full hover:bg-slate-200 text-slate-500 transition shadow-sm"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    <form id="inventoryForm" onSubmit={handleSave} className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-12 md:col-span-3 flex flex-col gap-2">
                                <div 
                                    className="w-full aspect-square rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-emerald-500 transition relative overflow-hidden group"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {formData.imageUrl ? <img src={formData.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
                                    {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin text-white w-6 h-6"/></div>}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                        <span className="text-white text-xs font-bold">Upload</span>
                                    </div>
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                
                                <button 
                                    type="button"
                                    onClick={generateAiImage}
                                    disabled={isGeneratingImage || !formData.name}
                                    className="w-full py-2 bg-purple-50 text-purple-600 border border-purple-100 rounded-lg text-xs font-bold hover:bg-purple-100 transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGeneratingImage ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <Wand2 className="w-3 h-3 mr-1"/>}
                                    AI Generate
                                </button>
                            </div>
                            
                            <div className="col-span-12 md:col-span-9 grid grid-cols-2 gap-4">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Product Name *</label>
                                    <input 
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium" 
                                        placeholder="Dolo 650" 
                                        value={formData.name || ''} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                        onBlur={(e) => detectCategory(e.target.value)}
                                        required 
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
                                        Category
                                        {isCategorizing && <span className="flex items-center text-emerald-600 text-[10px] normal-case"><Sparkles className="w-3 h-3 mr-1 animate-spin" /> Auto-categorizing...</span>}
                                    </label>
                                    <input 
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium" 
                                        placeholder="e.g. Pain Relief" 
                                        value={formData.category || ''} 
                                        onChange={e => setFormData({...formData, category: e.target.value})} 
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Brand / Marketed By</label>
                                    <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium" placeholder="Micro Labs" value={formData.brand || ''} onChange={e => setFormData({...formData, brand: e.target.value})} />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Packing *</label>
                                    <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium" placeholder="1x15 Strip" value={formData.packing || ''} onChange={e => setFormData({...formData, packing: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        <hr className="border-slate-100" />

                        {/* Batch & Location */}
                        <div>
                             <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center"><Layers className="w-4 h-4 mr-2 text-emerald-600"/> Batch & Location Details</h4>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Batch No.</label>
                                    <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-mono text-sm" placeholder="B-123" value={formData.batchNumber || ''} onChange={e => setFormData({...formData, batchNumber: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Expiry Date</label>
                                    <input type="date" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium text-sm" value={formData.expiryDate || ''} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Rack / Shelf</label>
                                    <input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-medium text-sm" placeholder="A-01" value={formData.rackNumber || ''} onChange={e => setFormData({...formData, rackNumber: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Current Stock</label>
                                    <input type="number" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-bold text-sm" value={formData.stock || 0} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} />
                                </div>
                             </div>
                        </div>

                        <hr className="border-slate-100" />

                        {/* Pricing & Tax */}
                        <div>
                             <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center"><DollarSign className="w-4 h-4 mr-2 text-emerald-600"/> Pricing & Tax (₹)</h4>
                             <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">HSN Code</label>
                                    <input className="w-full p-2 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500 font-mono text-xs" placeholder="3004" value={formData.hsnCode || ''} onChange={e => setFormData({...formData, hsnCode: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">GST %</label>
                                    <select className="w-full p-2 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500 font-bold text-xs" value={formData.gstPercentage || 12} onChange={e => setFormData({...formData, gstPercentage: Number(e.target.value)})}>
                                        <option value="0">0%</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18">18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Purchase Rate</label>
                                    <input type="number" className="w-full p-2 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500 font-medium text-xs" value={formData.purchaseRate || ''} onChange={e => setFormData({...formData, purchaseRate: Number(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">MRP (Incl Tax)</label>
                                    <input type="number" className="w-full p-2 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500 font-medium text-xs" value={formData.mrp || ''} onChange={e => setFormData({...formData, mrp: Number(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Selling Price</label>
                                    <input type="number" className="w-full p-2 bg-white border-emerald-300 rounded outline-none focus:border-emerald-500 font-bold text-emerald-700 text-xs shadow-sm" value={formData.sellingPrice || ''} onChange={e => setFormData({...formData, sellingPrice: Number(e.target.value)})} />
                                </div>
                             </div>
                        </div>

                    </form>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition text-sm">Cancel</button>
                    <button 
                        type="submit" 
                        form="inventoryForm"
                        disabled={isSaving}
                        className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition text-sm flex items-center justify-center disabled:opacity-70"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Item'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
