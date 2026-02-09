import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash, Calendar, Building, Search, Loader2, CheckCircle } from 'lucide-react';
import { Medicine, Supplier } from '../types';
import { supabase } from '../supabaseClient';
import Toast, { ToastType } from './Toast';

interface PurchaseBillsProps {
    inventory: Medicine[];
}

interface PurchaseItem {
    id: string; // temp id
    name: string;
    batchNumber: string;
    expiryDate: string;
    qty: number;
    purchaseRate: number;
    mrp: number;
    sellingPrice: number;
    gstPercentage: number;
    packing: string;
    hsnCode: string;
    manufacturer: string;
}

const PurchaseBills: React.FC<PurchaseBillsProps> = ({ inventory }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string, type: ToastType, visible: boolean }>({ msg: '', type: 'success', visible: false });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*');
    if (data) setSuppliers(data);
  };

  const showToast = (msg: string, type: ToastType) => {
    setToast({ msg, type, visible: true });
  };

  const addItem = () => {
    setItems([...items, {
        id: Date.now().toString(),
        name: '',
        batchNumber: '',
        expiryDate: '',
        qty: 1,
        purchaseRate: 0,
        mrp: 0,
        sellingPrice: 0,
        gstPercentage: 12,
        packing: '1x10',
        hsnCode: '',
        manufacturer: ''
    }]);
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    
    // Auto-search logic could go here to prefill other fields if name matches existing
    if (field === 'name') {
       const existing = inventory.find(i => i.name.toLowerCase() === (value as string).toLowerCase());
       if (existing) {
           newItems[index].hsnCode = existing.hsnCode || '';
           newItems[index].manufacturer = existing.manufacturer || '';
           newItems[index].packing = existing.packing || '1x10';
           newItems[index].gstPercentage = existing.gstPercentage || 12;
       }
    }

    setItems(newItems);
  };

  const removeItem = (index: number) => {
      setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
      return items.reduce((sum, item) => sum + (item.qty * item.purchaseRate), 0);
  };

  const handleSave = async () => {
    if (!selectedSupplierId) return showToast("Please select a supplier", 'error');
    if (!invoiceNo) return showToast("Enter invoice number", 'error');
    if (items.length === 0) return showToast("Add at least one item", 'error');

    setLoading(true);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("No user");

        // 1. Get Pharmacy ID (assuming user is owner linked to one pharmacy)
        const { data: pharmacy } = await supabase.from('pharmacies').select('id').eq('owner_id', user.id).single();
        if (!pharmacy) throw new Error("Pharmacy not found");

        // 2. Create Purchase Record
        const { data: purchase, error: purchaseError } = await supabase.from('purchases').insert([{
            pharmacy_id: pharmacy.id,
            supplier_id: selectedSupplierId,
            invoice_number: invoiceNo,
            invoice_date: invoiceDate,
            total_amount: calculateTotal(),
            status: 'Completed'
        }]).select().single();

        if (purchaseError) throw purchaseError;

        // 3. Insert Inventory (Medicines)
        // In this model, every purchase entry creates a new "Batch" in medicines table
        const medicinesPayload = items.map(item => ({
            pharmacy_id: pharmacy.id,
            supplier_id: selectedSupplierId,
            name: item.name,
            batch_number: item.batchNumber,
            expiry_date: item.expiryDate || null,
            stock: item.qty,
            purchase_rate: item.purchaseRate,
            mrp: item.mrp,
            selling_price: item.sellingPrice,
            gst_percentage: item.gstPercentage,
            packing: item.packing,
            hsn_code: item.hsnCode,
            manufacturer: item.manufacturer,
            brand: item.manufacturer, // Simplified mapping
            category: 'General' // Default
        }));

        const { error: medError } = await supabase.from('medicines').insert(medicinesPayload);
        if (medError) throw medError;

        showToast("Purchase Entry Saved Successfully!", 'success');
        setItems([]);
        setInvoiceNo('');
    } catch (error: any) {
        showToast(error.message || "Failed to save purchase", 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in relative">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.visible} onClose={() => setToast(prev => ({...prev, visible: false}))} />
      
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-900">Purchase Entry (GRN)</h2>
            <p className="text-slate-500 text-sm">Enter incoming stock from suppliers</p>
        </div>
        <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase">Total Amount</p>
            <p className="text-3xl font-bold text-emerald-600">₹{calculateTotal().toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Supplier *</label>
                <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <select 
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                        value={selectedSupplierId}
                        onChange={e => setSelectedSupplierId(e.target.value)}
                    >
                        <option value="">Select Supplier</option>
                        {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice No *</label>
                <input 
                  type="text" 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium uppercase" 
                  placeholder="INV-2024-001" 
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice Date *</label>
                <input 
                  type="date" 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium" 
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                />
            </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto mb-6 border rounded-xl border-slate-200">
            <table className="w-full min-w-[1000px]">
                <thead className="bg-slate-50 text-left">
                    <tr>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-64">Product Name</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-32">Batch No</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-32">Expiry</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-24">Pack</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-20">Qty</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-24">Rate (₹)</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-24">MRP (₹)</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase w-24">Sale Price</th>
                        <th className="p-4 w-10"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                        <tr key={item.id} className="group hover:bg-slate-50/50">
                            <td className="p-2">
                                <input 
                                  type="text" 
                                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm font-medium" 
                                  placeholder="Medicine Name"
                                  list="meds-list"
                                  value={item.name} 
                                  onChange={e => updateItem(idx, 'name', e.target.value)} 
                                />
                                <datalist id="meds-list">
                                    {inventory.map(m => <option key={m.id} value={m.name} />)}
                                </datalist>
                            </td>
                            <td className="p-2">
                              <input type="text" className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm font-mono" placeholder="BATCH" value={item.batchNumber} onChange={e => updateItem(idx, 'batchNumber', e.target.value)} />
                            </td>
                            <td className="p-2">
                              <input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm" value={item.expiryDate} onChange={e => updateItem(idx, 'expiryDate', e.target.value)} />
                            </td>
                            <td className="p-2">
                              <input type="text" className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm" placeholder="1x10" value={item.packing} onChange={e => updateItem(idx, 'packing', e.target.value)} />
                            </td>
                            <td className="p-2">
                              <input type="number" className="w-full p-2 bg-emerald-50 border border-emerald-200 rounded-lg focus:border-emerald-500 outline-none text-sm font-bold text-emerald-700" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                            </td>
                            <td className="p-2">
                              <input type="number" className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm" value={item.purchaseRate} onChange={e => updateItem(idx, 'purchaseRate', Number(e.target.value))} />
                            </td>
                            <td className="p-2">
                              <input type="number" className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm" value={item.mrp} onChange={e => updateItem(idx, 'mrp', Number(e.target.value))} />
                            </td>
                            <td className="p-2">
                              <input type="number" className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none text-sm font-bold" value={item.sellingPrice} onChange={e => updateItem(idx, 'sellingPrice', Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-center">
                                <button onClick={() => removeItem(idx)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash className="w-4 h-4" /></button>
                            </td>
                        </tr>
                    ))}
                    {items.length === 0 && (
                        <tr>
                            <td colSpan={9} className="p-8 text-center text-slate-400 text-sm">
                                Start adding items to the bill
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        
        <div className="flex justify-between items-center">
             <button onClick={addItem} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition flex items-center">
                <Plus className="w-4 h-4 mr-2"/> Add Row
             </button>

             <button 
                onClick={handleSave}
                disabled={loading}
                className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center disabled:opacity-70"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Save Purchase Entry</>}
             </button>
        </div>

      </div>
    </div>
  );
};

export default PurchaseBills;