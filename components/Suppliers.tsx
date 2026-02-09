import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Supplier } from '../types';
import { Search, Plus, Phone, Mail, FileText, Edit2, Trash2, X, Loader2, Building } from 'lucide-react';
import Toast, { ToastType } from './Toast';
import ConfirmationModal from './ConfirmationModal';

interface SuppliersProps {
  pharmacyId: string;
}

const Suppliers: React.FC<SuppliersProps> = ({ pharmacyId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({});
  const [saving, setSaving] = useState(false);
  
  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string, type: ToastType, visible: boolean }>({ msg: '', type: 'success', visible: false });

  useEffect(() => {
    fetchSuppliers();
  }, [pharmacyId]);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').eq('pharmacy_id', pharmacyId).order('name');
    if (data) {
        setSuppliers(data.map(s => ({
            id: s.id,
            name: s.name,
            contact_person: s.contact_person,
            phone: s.phone,
            email: s.email,
            gstin: s.gstin,
            address: s.address
        })));
    }
    setLoading(false);
  };

  const showToast = (msg: string, type: ToastType) => {
    setToast({ msg, type, visible: true });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
        pharmacy_id: pharmacyId,
        name: formData.name,
        contact_person: formData.contact_person,
        phone: formData.phone,
        email: formData.email,
        gstin: formData.gstin,
        address: formData.address
    };

    let error;
    if (formData.id) {
        const res = await supabase.from('suppliers').update(payload).eq('id', formData.id);
        error = res.error;
    } else {
        const res = await supabase.from('suppliers').insert([payload]);
        error = res.error;
    }

    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Supplier saved successfully', 'success');
        setIsModalOpen(false);
        fetchSuppliers();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteId);
    if (error) {
        showToast('Failed to delete supplier', 'error');
    } else {
        showToast('Supplier removed', 'success');
        fetchSuppliers();
    }
    setDeleteId(null);
  };

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in pb-10">
       <Toast message={toast.msg} type={toast.type} isVisible={toast.visible} onClose={() => setToast(prev => ({...prev, visible: false}))} />
       <ConfirmationModal 
         isOpen={!!deleteId} 
         onClose={() => setDeleteId(null)} 
         onConfirm={handleDelete} 
         title="Delete Supplier?" 
         message="Are you sure you want to remove this distributor? Linked purchase history may be affected."
         isDestructive={true}
       />

       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Suppliers</h2>
            <p className="text-slate-500 text-sm mt-1">Manage distributors and wholesalers</p>
        </div>
        <button 
            onClick={() => { setFormData({}); setIsModalOpen(true); }} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-200 transition flex items-center"
        >
            <Plus className="w-5 h-5 mr-2"/> Add Supplier
        </button>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex items-center">
         <Search className="w-5 h-5 text-slate-400 ml-3" />
         <input 
            className="w-full p-3 bg-transparent outline-none font-medium text-slate-700"
            placeholder="Search suppliers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
         />
      </div>

      {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-600"/></div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(supplier => (
                  <div key={supplier.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition group">
                      <div className="flex justify-between items-start mb-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                              <Building className="w-6 h-6" />
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => { setFormData(supplier); setIsModalOpen(true); }} className="p-2 bg-slate-50 rounded-lg hover:bg-emerald-50 hover:text-emerald-600"><Edit2 className="w-4 h-4"/></button>
                              <button onClick={() => setDeleteId(supplier.id)} className="p-2 bg-slate-50 rounded-lg hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                          </div>
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 mb-1">{supplier.name}</h3>
                      <p className="text-sm text-slate-500 mb-4">{supplier.contact_person}</p>
                      
                      <div className="space-y-2 text-sm">
                          {supplier.phone && (
                              <div className="flex items-center text-slate-600">
                                  <Phone className="w-4 h-4 mr-2 text-slate-400"/> {supplier.phone}
                              </div>
                          )}
                          {supplier.email && (
                              <div className="flex items-center text-slate-600">
                                  <Mail className="w-4 h-4 mr-2 text-slate-400"/> {supplier.email}
                              </div>
                          )}
                          {supplier.gstin && (
                              <div className="flex items-center text-slate-600">
                                  <FileText className="w-4 h-4 mr-2 text-slate-400"/> GST: <span className="font-mono ml-1 bg-slate-100 px-1 rounded">{supplier.gstin}</span>
                              </div>
                          )}
                      </div>
                  </div>
              ))}
          </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl relative">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-xl">{formData.id ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5"/></button>
                  </div>
                  <form onSubmit={handleSave} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Company Name *</label>
                          <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-medium" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Mahaveer Pharma" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contact Person</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-medium" value={formData.contact_person || ''} onChange={e => setFormData({...formData, contact_person: e.target.value})} placeholder="Mr. Sharma" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">GSTIN</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-medium" value={formData.gstin || ''} onChange={e => setFormData({...formData, gstin: e.target.value})} placeholder="29AAAAA0000A1Z5" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Phone</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-medium" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email</label>
                            <input type="email" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-medium" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Full Address</label>
                          <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-medium h-24 resize-none" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                      </div>
                      <button disabled={saving} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition flex items-center justify-center">
                          {saving ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Save Details'}
                      </button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default Suppliers;