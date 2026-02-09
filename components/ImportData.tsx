import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download, Loader2, ArrowRight, RefreshCw, X, Sparkles } from 'lucide-react';
import { Medicine } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface ImportDataProps {
  onImport: (items: Medicine[]) => Promise<void>;
}

const ImportData: React.FC<ImportDataProps> = ({ onImport }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'processing' | 'success'>('upload');
  const [parsedData, setParsedData] = useState<Medicine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
      const headers = "name,brand,category,stock,mrp,selling_price,batch_number,expiry_date,rack_number,packing,hsn_code,manufacturer,purchase_rate,gst_percentage";
      const sample = "Dolo 650,Micro Labs,Fever,100,30,28,BATCH123,2025-12-31,A1,1x15,3004,Micro Labs,20,12";
      const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + sample;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "inventory_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        setError("Please upload a valid CSV file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsText(file);
    
    // Reset input so same file can be selected again if needed
    e.target.value = '';
  };

  const parseCSV = (text: string) => {
      try {
          const lines = text.split('\n').filter(line => line.trim() !== '');
          if (lines.length < 2) throw new Error("File is empty or missing headers.");

          const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\r"]/g, ''));
          
          // Basic validation
          const required = ['name', 'selling_price', 'stock'];
          const missing = required.filter(r => !headers.includes(r));
          
          if (missing.length > 0) {
              throw new Error(`Missing required columns: ${missing.join(', ')}`);
          }

          const items: Medicine[] = [];
          
          for (let i = 1; i < lines.length; i++) {
              // Handle comma inside quotes if simple split fails (basic implementation)
              const currentLine = lines[i].split(',').map(cell => cell.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
              
              if (currentLine.length < headers.length) continue; 

              const row: any = {};
              headers.forEach((header, index) => {
                  row[header] = currentLine[index];
              });

              if (!row.name) continue;

              items.push({
                  id: `temp-${Date.now()}-${i}`,
                  name: row.name,
                  brand: row.brand || '',
                  category: row.category || 'General',
                  stock: parseInt(row.stock) || 0,
                  mrp: parseFloat(row.mrp) || parseFloat(row.selling_price) || 0,
                  sellingPrice: parseFloat(row.selling_price) || 0,
                  imageUrl: '',
                  // Professional fields
                  batchNumber: row.batch_number || '',
                  expiryDate: row.expiry_date || null, // Expects YYYY-MM-DD
                  rackNumber: row.rack_number || '',
                  packing: row.packing || '1x1',
                  hsnCode: row.hsn_code || '',
                  manufacturer: row.manufacturer || '',
                  purchaseRate: parseFloat(row.purchase_rate) || 0,
                  gstPercentage: parseFloat(row.gst_percentage) || 12,
                  availableStores: 1
              });
          }

          if (items.length === 0) throw new Error("No valid data found in file.");
          
          setParsedData(items);
          setStep('preview');
          setError(null);
      } catch (err: any) {
          setError(err.message || "Failed to parse CSV.");
          setStep('upload');
      }
  };

  const handleAiCategorize = async () => {
    setCategorizing(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const medicineNames = parsedData.map(m => m.name).slice(0, 50); // Limit batch size for safety/speed
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Classify the following medicines into therapeutic categories (e.g. Antibiotic, Pain Relief, Cardiac, etc). Return a JSON list. Medicines: ${medicineNames.join(', ')}`,
            config: {
                responseMimeType: 'application/json',
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
            const categories = JSON.parse(response.text);
            const map = new Map(categories.map((c:any) => [c.name.toLowerCase(), c.category]));
            
            setParsedData(prev => prev.map(item => ({
                ...item,
                category: (map.get(item.name.toLowerCase()) as string) || item.category
            })));
        }
    } catch (e) {
        setError("AI Categorization failed. Try manually.");
    } finally {
        setCategorizing(false);
    }
  };

  const handleConfirmImport = async () => {
      setStep('processing');
      try {
          await onImport(parsedData);
          setStep('success');
      } catch (e: any) {
          setError(e.message || "Import failed during saving.");
          setStep('preview');
      }
  };

  const reset = () => {
      setStep('upload');
      setParsedData([]);
      setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col animate-fade-in">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Import Inventory</h2>
            <p className="text-slate-500 mt-1">Bulk upload medicines using CSV.</p>
        </div>
        {step === 'upload' && (
            <button 
                onClick={downloadTemplate}
                className="flex items-center text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition"
            >
                <Download className="w-4 h-4 mr-2" /> Download Template
            </button>
        )}
      </div>

      {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 mb-6 flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 mr-3" />
                {error}
              </div>
              <button onClick={() => setError(null)}><X className="w-4 h-4"/></button>
          </div>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 hover:border-emerald-400 hover:bg-emerald-50/10 transition group text-center cursor-pointer relative"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv"
                onChange={handleFileUpload}
            />
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Click to Upload CSV</h3>
            <p className="text-slate-400 max-w-sm mx-auto mb-8">
                Drag and drop or select a CSV file. Ensure it matches the template format.
            </p>
            <div className="text-xs font-mono bg-slate-100 p-2 rounded text-slate-500">
                Required columns: name, selling_price, stock
            </div>
          </div>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
          <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">Preview ({parsedData.length} items)</h3>
                  <div className="flex gap-2">
                      <button 
                        onClick={handleAiCategorize}
                        disabled={categorizing}
                        className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 flex items-center transition"
                      >
                          {categorizing ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <Sparkles className="w-3 h-3 mr-1"/>}
                          Auto-Categorize
                      </button>
                      <button onClick={reset} className="text-xs font-bold text-red-500 hover:underline px-3 py-2">Cancel</button>
                  </div>
              </div>
              <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                          <tr>
                              <th className="p-3 font-bold">Name</th>
                              <th className="p-3 font-bold">Category</th>
                              <th className="p-3 font-bold">Stock</th>
                              <th className="p-3 font-bold">MRP</th>
                              <th className="p-3 font-bold">Price</th>
                              <th className="p-3 font-bold">Batch</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {parsedData.slice(0, 50).map((item, i) => (
                              <tr key={i}>
                                  <td className="p-3 font-medium text-slate-800">{item.name}</td>
                                  <td className="p-3">
                                      <span className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 border border-slate-200">{item.category}</span>
                                  </td>
                                  <td className="p-3 font-bold text-slate-700">{item.stock}</td>
                                  <td className="p-3 text-slate-500">{item.mrp}</td>
                                  <td className="p-3 font-bold text-emerald-600">{item.sellingPrice}</td>
                                  <td className="p-3 font-mono text-xs">{item.batchNumber}</td>
                              </tr>
                          ))}
                          {parsedData.length > 50 && (
                              <tr>
                                  <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                                      ... and {parsedData.length - 50} more items
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                  <button 
                    onClick={reset}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition"
                  >
                      Cancel
                  </button>
                  <button 
                    onClick={handleConfirmImport}
                    className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center"
                  >
                      Import {parsedData.length} Items <ArrowRight className="w-4 h-4 ml-2" />
                  </button>
              </div>
          </div>
      )}

      {/* Processing Step */}
      {step === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-16 h-16 text-emerald-600 animate-spin mb-6" />
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Importing Data...</h3>
              <p className="text-slate-500">Please wait while we save your inventory.</p>
          </div>
      )}

      {/* Success Step */}
      {step === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
                  <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Import Successful!</h3>
              <p className="text-slate-500 mb-8">{parsedData.length} items have been added to your inventory.</p>
              <button 
                onClick={reset}
                className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition flex items-center"
              >
                  <RefreshCw className="w-4 h-4 mr-2" /> Import More
              </button>
          </div>
      )}

    </div>
  );
};

export default ImportData;