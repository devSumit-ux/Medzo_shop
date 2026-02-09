
import React, { useState, useEffect, useRef } from 'react';
import { Save, Store, FileText, Bell, CreditCard, Shield, Loader2, AlertCircle, Upload, CheckCircle, Clock, XCircle, CheckCircle2, MapPin, Navigation, Crosshair, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Pharmacy, VerificationStatus } from '../types';
import Toast, { ToastType } from './Toast';
import { verifyGSTIN } from '../services/verification';
import { GoogleGenAI, Type } from "@google/genai";
import { CATEGORIES } from '../constants';

// Global Leaflet definition
declare const L: any;

interface SettingsProps {
  pharmacyId: string;
}

const Settings: React.FC<SettingsProps> = ({ pharmacyId }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'legal' | 'billing' | 'system' | 'verification'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'dl' | 'gst' | null>(null);
  const [toast, setToast] = useState<{ msg: string, type: ToastType, visible: boolean }>({ msg: '', type: 'success', visible: false });
  
  // AI Categorization State
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeStats, setCategorizeStats] = useState<{total: number, fixed: number} | null>(null);

  // Verification State
  const [isVerifyingGst, setIsVerifyingGst] = useState(false);
  const [gstVerified, setGstVerified] = useState(false);

  // Map State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Refs for file inputs
  const dlInputRef = useRef<HTMLInputElement>(null);
  const gstInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Pharmacy>>({
    name: '',
    address: '',
    phone: '',
    latitude: 0,
    longitude: 0,
    gstin: '',
    drug_license_no: '',
    legal_trade_name: '',
    upi_id: '',
    invoice_terms: 'Goods once sold will not be taken back.',
    low_stock_threshold: 10,
    expiry_alert_days: 90,
    drug_license_url: '',
    gst_certificate_url: '',
    verification_status: 'unverified'
  });

  useEffect(() => {
    fetchSettings();
  }, [pharmacyId]);

  // Map Initialization Effect
  useEffect(() => {
    if (showMapPicker && mapContainerRef.current && !mapInstanceRef.current && typeof L !== 'undefined') {
        // Default to current form location or India center
        const startLat = formData.latitude || 20.5937;
        const startLng = formData.longitude || 78.9629;
        const zoomLevel = formData.latitude ? 16 : 5;
        
        const map = L.map(mapContainerRef.current).setView([startLat, startLng], zoomLevel);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Add initial marker if location exists
        if (formData.latitude && formData.longitude) {
            markerRef.current = L.marker([formData.latitude, formData.longitude]).addTo(map);
        }

        // Click handler
        map.on('click', (e: any) => {
            const { lat, lng } = e.latlng;
            updateLocationState(lat, lng);
            
            if (markerRef.current) {
                markerRef.current.setLatLng([lat, lng]);
            } else {
                markerRef.current = L.marker([lat, lng]).addTo(map);
            }
        });

        mapInstanceRef.current = map;
        
        // Force map resize calculation after render
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }

    return () => {
        if (!showMapPicker && mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
            markerRef.current = null;
        }
    };
  }, [showMapPicker]);

  const updateLocationState = (lat: number, lng: number) => {
      setFormData(prev => ({
          ...prev,
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6))
      }));
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser", "error");
        return;
    }
    
    showToast("Detecting location...", "success");
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            updateLocationState(latitude, longitude);
            
            if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([latitude, longitude], 16);
                if (markerRef.current) {
                    markerRef.current.setLatLng([latitude, longitude]);
                } else if (typeof L !== 'undefined') {
                    markerRef.current = L.marker([latitude, longitude]).addTo(mapInstanceRef.current);
                }
            }
            showToast("Location updated!", "success");
        },
        (error) => {
            showToast("Could not detect location. Please enable GPS.", "error");
        },
        { enableHighAccuracy: true }
    );
  };

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pharmacies')
      .select('*')
      .eq('id', pharmacyId)
      .single();

    if (data) {
      setFormData({
        name: data.name,
        address: data.address,
        phone: data.phone || '',
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        gstin: data.gstin || '',
        drug_license_no: data.drug_license_no || '',
        legal_trade_name: data.legal_trade_name || '',
        upi_id: data.upi_id || '',
        invoice_terms: data.invoice_terms || 'Goods once sold will not be taken back.',
        low_stock_threshold: data.low_stock_threshold || 10,
        expiry_alert_days: data.expiry_alert_days || 90,
        drug_license_url: data.drug_license_url || '',
        gst_certificate_url: data.gst_certificate_url || '',
        verification_status: (data.verification_status as VerificationStatus) || 'unverified'
      });
      if (data.legal_trade_name) setGstVerified(true);
    }
    setLoading(false);
  };

  const showToast = (msg: string, type: ToastType) => {
    setToast({ msg, type, visible: true });
  };

  const performGstVerification = async () => {
      if (!formData.gstin) return;
      setIsVerifyingGst(true);
      
      const result = await verifyGSTIN(formData.gstin);
      
      setIsVerifyingGst(false);
      
      if (result.isValid) {
          setGstVerified(true);
          setFormData(prev => ({ 
              ...prev, 
              legal_trade_name: result.data.legalName 
          }));
          showToast(`Verified: ${result.data.legalName}`, 'success');
      } else {
          setGstVerified(false);
          showToast(result.message, 'error');
      }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from('pharmacies')
      .update({
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        latitude: formData.latitude,
        longitude: formData.longitude,
        gstin: formData.gstin,
        drug_license_no: formData.drug_license_no,
        legal_trade_name: formData.legal_trade_name || null,
        upi_id: formData.upi_id,
        invoice_terms: formData.invoice_terms,
        low_stock_threshold: formData.low_stock_threshold,
        expiry_alert_days: formData.expiry_alert_days,
        drug_license_url: formData.drug_license_url,
        gst_certificate_url: formData.gst_certificate_url
      })
      .eq('id', pharmacyId);

    if (error) {
      showToast(`Failed to save: ${error.message}`, 'error');
    } else {
      showToast('Settings updated successfully!', 'success');
    }
    setSaving(false);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'dl' | 'gst') => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(type);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${pharmacyId}/${type}_${Date.now()}.${fileExt}`;
    
    try {
        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('documents').getPublicUrl(fileName);
        
        if (type === 'dl') {
            setFormData(prev => ({ ...prev, drug_license_url: data.publicUrl }));
        } else {
            setFormData(prev => ({ ...prev, gst_certificate_url: data.publicUrl }));
        }
        
        showToast('Document uploaded successfully', 'success');
        
        // Auto-save the URL to DB
        await supabase.from('pharmacies').update({
            [type === 'dl' ? 'drug_license_url' : 'gst_certificate_url']: data.publicUrl
        }).eq('id', pharmacyId);

    } catch (error: any) {
        showToast('Upload failed: ' + error.message, 'error');
    } finally {
        setUploading(null);
    }
  };

  const submitForVerification = async () => {
      if (!formData.drug_license_url) {
          showToast('Please upload Drug License first', 'error');
          return;
      }
      
      setSaving(true);
      const { error } = await supabase
        .from('pharmacies')
        .update({ verification_status: 'pending_review' })
        .eq('id', pharmacyId);

      if (error) {
          showToast(`Failed to submit: ${error.message}`, 'error');
      } else {
          setFormData(prev => ({ ...prev, verification_status: 'pending_review' }));
          showToast('Submitted for verification!', 'success');
      }
      setSaving(false);
  };

  const runAiCategorization = async () => {
      setCategorizing(true);
      setCategorizeStats(null);
      try {
          // 1. Fetch medicines with 'General' or empty category
          const { data: meds } = await supabase
            .from('medicines')
            .select('id, name')
            .eq('pharmacy_id', pharmacyId)
            .or('category.eq.General,category.is.null');

          if (!meds || meds.length === 0) {
              showToast("All medicines are already categorized!", "success");
              setCategorizing(false);
              return;
          }

          // Process in chunks of 20 to avoid token limits
          const chunks = [];
          const chunkSize = 20;
          for (let i = 0; i < meds.length; i += chunkSize) {
              chunks.push(meds.slice(i, i + chunkSize));
          }

          let updatedCount = 0;
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

          for (const chunk of chunks) {
              const names = chunk.map(m => m.name).join(', ');
              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: `
                    Classify these medicines into exactly ONE of these categories: ${CATEGORIES.join(', ')}. 
                    If unknown, use "General".
                    Medicines: ${names}.
                    Return JSON array: [{ name: "...", category: "..." }]
                  `,
                  config: {
                      responseMimeType: "application/json",
                      responseSchema: {
                          type: Type.ARRAY,
                          items: {
                              type: Type.OBJECT,
                              properties: {
                                  name: { type: Type.STRING },
                                  category: { type: Type.STRING }
                              }
                          }
                      }
                  }
              });

              if (response.text) {
                  const results = JSON.parse(response.text);
                  // Update DB one by one (or could use upsert if configured)
                  for (const result of results) {
                      const med = chunk.find(m => m.name.includes(result.name) || result.name.includes(m.name));
                      if (med && result.category && result.category !== 'General') {
                          await supabase.from('medicines').update({ category: result.category }).eq('id', med.id);
                          updatedCount++;
                      }
                  }
              }
          }
          
          setCategorizeStats({ total: meds.length, fixed: updatedCount });
          showToast(`Categorized ${updatedCount} medicines!`, 'success');

      } catch (error: any) {
          console.error(error);
          showToast("AI Categorization failed: " + error.message, 'error');
      } finally {
          setCategorizing(false);
      }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-10 animate-fade-in relative">
      <Toast 
        message={toast.msg} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast(prev => ({...prev, visible: false}))} 
      />

      {/* Map Picker Modal */}
      {showMapPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-lg flex items-center"><MapPin className="w-5 h-5 mr-2 text-emerald-600"/> Pin Shop Location</h3>
                      <button onClick={() => setShowMapPicker(false)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">Confirm Location</button>
                  </div>
                  <div className="flex-1 relative bg-slate-100">
                      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full"></div>
                  </div>
                  <div className="p-3 bg-white border-t flex justify-between items-center">
                      <p className="text-sm text-slate-500 pl-2">Tap on the map to accurately place your shop pin.</p>
                      <button 
                        onClick={handleDetectLocation}
                        className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold hover:bg-emerald-100 transition border border-emerald-100"
                      >
                        <Crosshair className="w-4 h-4 mr-2" /> Detect My Location
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Store Settings</h2>
          <p className="text-slate-500 mt-1">Configure your pharmacy profile and preferences.</p>
        </div>
        <button 
            onClick={() => handleSave()}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center disabled:opacity-70"
        >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Save Changes</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <div className="md:col-span-1 space-y-2">
            {[
                { id: 'general', label: 'General Info', icon: Store },
                { id: 'verification', label: 'Verification', icon: CheckCircle },
                { id: 'legal', label: 'Legal & Info', icon: Shield },
                { id: 'billing', label: 'Billing & Payments', icon: CreditCard },
                { id: 'system', label: 'System Preferences', icon: Bell },
            ].map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center px-4 py-3 rounded-xl font-medium transition-all ${
                        activeTab === tab.id 
                        ? 'bg-white text-emerald-700 shadow-md border border-emerald-100' 
                        : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                    }`}
                >
                    <tab.icon className={`w-5 h-5 mr-3 ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {tab.label}
                    {tab.id === 'verification' && formData.verification_status === 'pending_review' && (
                        <div className="w-2 h-2 rounded-full bg-amber-500 ml-auto animate-pulse"></div>
                    )}
                </button>
            ))}
        </div>

        {/* Form Content */}
        <div className="md:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 min-h-[500px]">
                
                {/* General Tab */}
                {activeTab === 'general' && (
                    <div className="space-y-6 animate-fade-in">
                        <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">General Information</h3>
                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Pharmacy Name <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number</label>
                                <input 
                                    type="text" 
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                    placeholder="+91"
                                />
                            </div>
                            
                            {/* Location Section */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-3 flex items-center">
                                    <MapPin className="w-3.5 h-3.5 mr-1" /> Shop Location
                                </label>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-400 mb-1 font-mono">Latitude</p>
                                        <input 
                                            type="text" 
                                            readOnly
                                            value={formData.latitude || 0}
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-mono"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-400 mb-1 font-mono">Longitude</p>
                                        <input 
                                            type="text" 
                                            readOnly
                                            value={formData.longitude || 0}
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="mt-3 flex gap-3">
                                    <button 
                                        onClick={() => setShowMapPicker(true)}
                                        className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-emerald-700 transition flex items-center justify-center"
                                    >
                                        <MapPin className="w-4 h-4 mr-2" /> Open Map Locator
                                    </button>
                                    <button 
                                        onClick={handleDetectLocation}
                                        className="py-2 px-4 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition flex items-center"
                                        title="Use Current Device Location"
                                    >
                                        <Crosshair className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Full Address</label>
                                <textarea 
                                    value={formData.address}
                                    onChange={e => setFormData({...formData, address: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium h-32 resize-none"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Verification Tab */}
                {activeTab === 'verification' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                            <h3 className="text-lg font-bold text-slate-800">Shop Verification</h3>
                            <div className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide border flex items-center ${
                                formData.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                formData.verification_status === 'pending_review' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                formData.verification_status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                                'bg-slate-50 text-slate-600 border-slate-100'
                            }`}>
                                {formData.verification_status === 'verified' && <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
                                {formData.verification_status === 'pending_review' && <Clock className="w-3.5 h-3.5 mr-1.5" />}
                                {formData.verification_status === 'rejected' && <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                                {formData.verification_status?.replace('_', ' ')}
                            </div>
                        </div>

                        {formData.verification_status === 'verified' ? (
                            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-center">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h4 className="text-xl font-bold text-emerald-800 mb-2">Your Shop is Verified!</h4>
                                <p className="text-emerald-600 text-sm">You have full access to all Medzo Shop features and increased visibility.</p>
                            </div>
                        ) : (
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6 flex items-start">
                                <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-blue-800">
                                    {formData.verification_status === 'pending_review' 
                                        ? "Your documents are currently under review by our admin team. This usually takes 24-48 hours."
                                        : "Upload your legal documents to get verified. Verified shops get 3x more orders."}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Drug License Upload */}
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed text-center">
                                <h4 className="font-bold text-slate-800 mb-2">Drug License</h4>
                                {formData.drug_license_url ? (
                                    <div className="relative group">
                                        <img src={formData.drug_license_url} alt="Drug License" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                                        {formData.verification_status !== 'verified' && (
                                            <button 
                                                onClick={() => dlInputRef.current?.click()}
                                                className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold opacity-0 group-hover:opacity-100 transition rounded-lg"
                                            >
                                                Change
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => dlInputRef.current?.click()}
                                        className="w-full h-32 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center hover:border-emerald-500 hover:text-emerald-600 transition text-slate-400 gap-2"
                                    >
                                        {uploading === 'dl' ? <Loader2 className="animate-spin"/> : <Upload className="w-6 h-6" />}
                                        <span className="text-xs font-bold">Upload Image</span>
                                    </button>
                                )}
                                <input ref={dlInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleDocumentUpload(e, 'dl')} />
                            </div>

                            {/* GST Cert Upload */}
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed text-center">
                                <h4 className="font-bold text-slate-800 mb-2">GST Certificate</h4>
                                {formData.gst_certificate_url ? (
                                    <div className="relative group">
                                        <img src={formData.gst_certificate_url} alt="GST Cert" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                                        {formData.verification_status !== 'verified' && (
                                            <button 
                                                onClick={() => gstInputRef.current?.click()}
                                                className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold opacity-0 group-hover:opacity-100 transition rounded-lg"
                                            >
                                                Change
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => gstInputRef.current?.click()}
                                        className="w-full h-32 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center hover:border-emerald-500 hover:text-emerald-600 transition text-slate-400 gap-2"
                                    >
                                        {uploading === 'gst' ? <Loader2 className="animate-spin"/> : <Upload className="w-6 h-6" />}
                                        <span className="text-xs font-bold">Upload Image</span>
                                    </button>
                                )}
                                <input ref={gstInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => handleDocumentUpload(e, 'gst')} />
                            </div>
                        </div>

                        {formData.verification_status === 'unverified' || formData.verification_status === 'rejected' ? (
                            <button 
                                onClick={submitForVerification}
                                disabled={saving}
                                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit for Verification'}
                            </button>
                        ) : null}

                        {formData.verification_status === 'pending_review' && (
                             <p className="text-center text-xs text-slate-400 italic">Documents submitted. You cannot change them while under review.</p>
                        )}
                    </div>
                )}

                {/* Legal Tab */}
                {activeTab === 'legal' && (
                    <div className="space-y-6 animate-fade-in">
                         <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Legal & Compliance</h3>
                         <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Drug License Number (DL No.)</label>
                                <input 
                                    type="text" 
                                    value={formData.drug_license_no}
                                    onChange={e => setFormData({...formData, drug_license_no: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium font-mono uppercase"
                                    placeholder="KA-BLR-2024-XXXX"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">GSTIN (Tax ID)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={formData.gstin}
                                        onChange={e => setFormData({...formData, gstin: e.target.value})}
                                        className={`w-full p-3 bg-slate-50 border rounded-xl outline-none transition-all font-medium font-mono uppercase ${gstVerified ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 focus:ring-2 focus:ring-emerald-500'}`}
                                        placeholder="29AAAAA0000A1Z5"
                                    />
                                    <button 
                                        onClick={performGstVerification}
                                        disabled={isVerifyingGst}
                                        className="bg-emerald-50 text-emerald-600 px-4 rounded-xl border border-emerald-100 font-bold text-sm hover:bg-emerald-100 transition"
                                    >
                                        {isVerifyingGst ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Verify'}
                                    </button>
                                </div>
                                {formData.legal_trade_name && (
                                    <p className="text-xs text-emerald-600 mt-2 font-bold flex items-center">
                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Legal Trade Name: {formData.legal_trade_name}
                                    </p>
                                )}
                            </div>
                         </div>
                    </div>
                )}

                {/* Billing Tab */}
                {activeTab === 'billing' && (
                    <div className="space-y-6 animate-fade-in">
                         <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Billing Configuration</h3>
                         <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">UPI ID (For QR Code)</label>
                                <input 
                                    type="text" 
                                    value={formData.upi_id}
                                    onChange={e => setFormData({...formData, upi_id: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                    placeholder="your-pharmacy@upi"
                                />
                                <p className="text-xs text-slate-400 mt-2">This will generate a dynamic QR code on customer bills for easy payment.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice Terms & Conditions</label>
                                <textarea 
                                    value={formData.invoice_terms}
                                    onChange={e => setFormData({...formData, invoice_terms: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium h-24"
                                />
                            </div>
                         </div>
                    </div>
                )}

                {/* System Tab */}
                {activeTab === 'system' && (
                    <div className="space-y-6 animate-fade-in">
                         <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">System Preferences</h3>
                         <div className="grid grid-cols-1 gap-6">
                            {/* AI Categorization Tool */}
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100">
                                <h4 className="font-bold text-blue-800 flex items-center mb-2">
                                    <Sparkles className="w-5 h-5 mr-2" /> AI Inventory Intelligence
                                </h4>
                                <p className="text-sm text-blue-600 mb-4">
                                    Automatically scan all your "General" or uncategorized medicines and assign them correct therapeutic categories (e.g., Pain Relief, Antibiotic) using AI.
                                </p>
                                <button 
                                    onClick={runAiCategorization}
                                    disabled={categorizing}
                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 transition flex items-center disabled:opacity-70"
                                >
                                    {categorizing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Sparkles className="w-4 h-4 mr-2" />}
                                    {categorizing ? 'Processing Inventory...' : 'Auto-Categorize Inventory'}
                                </button>
                                {categorizeStats && (
                                    <p className="mt-3 text-xs font-bold text-emerald-600">
                                        Success! Scanned {categorizeStats.total} items, updated {categorizeStats.fixed} categories.
                                    </p>
                                )}
                            </div>

                            <hr className="border-slate-100" />

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Low Stock Threshold</label>
                                <div className="flex items-center">
                                    <input 
                                        type="number" 
                                        value={formData.low_stock_threshold}
                                        onChange={e => setFormData({...formData, low_stock_threshold: Number(e.target.value)})}
                                        className="w-32 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                                    />
                                    <span className="ml-3 text-slate-500 text-sm">Units</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">Products below this quantity will be marked as 'Low Stock' in dashboard.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Expiry Alert Window</label>
                                <div className="flex items-center">
                                    <input 
                                        type="number" 
                                        value={formData.expiry_alert_days}
                                        onChange={e => setFormData({...formData, expiry_alert_days: Number(e.target.value)})}
                                        className="w-32 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                                    />
                                    <span className="ml-3 text-slate-500 text-sm">Days</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">Get warned about medicines expiring within this many days.</p>
                            </div>
                         </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
