
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Smartphone, CheckCircle, Receipt, ShoppingCart, Printer, RotateCw, Mail, Save, Clock, User, Stethoscope, FileText, ChevronDown, Keyboard, Bell, Loader2, History, FileClock } from 'lucide-react';
import { Medicine, CartItem, Sale, PaymentMethod, AdminBooking, BookingStatus } from '../types';
import { supabase } from '../supabaseClient';
import Toast, { ToastType } from './Toast';

interface SalesBillingProps {
  inventory: Medicine[];
  onCompleteSale: (sale: Sale) => Promise<Sale | null>; // Changed to Promise
  pharmacyId: string;
  shopDetails?: {
      name: string;
      address: string;
      phone: string;
      gstin: string;
      drug_license_no: string;
  };
  bookings?: AdminBooking[];
  onBookingAction?: (id: string, status: BookingStatus) => void;
  recentSales?: Sale[];
}

const SalesBilling: React.FC<SalesBillingProps> = ({ inventory, onCompleteSale, pharmacyId, shopDetails, bookings = [], onBookingAction, recentSales = [] }) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  
  // Sidebars
  const [heldBills, setHeldBills] = useState<Sale[]>([]);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [showAppOrders, setShowAppOrders] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // New: Invoice History
  
  const [processing, setProcessing] = useState(false);
  
  // UI Helpers
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ msg: string, type: ToastType, visible: boolean }>({ msg: '', type: 'success', visible: false });

  // Filter Bookings
  const pendingBookings = bookings.filter(b => b.status === 'Pending' || b.status === 'Ready');

  const showToast = (msg: string, type: ToastType) => {
    setToast({ msg, type, visible: true });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'F2') {
            e.preventDefault();
            searchInputRef.current?.focus();
        }
        if (e.key === 'F4') {
            e.preventDefault();
            setPaymentMethod('Cash');
            showToast('Payment: Cash Selected', 'success');
        }
        if (e.key === 'F8') {
            e.preventDefault();
            setPaymentMethod('UPI');
            showToast('Payment: UPI Selected', 'success');
        }
        if (e.key === 'F10') {
            e.preventDefault();
            setPaymentMethod('Card');
            showToast('Payment: Card Selected', 'success');
        }
        if (e.key === 'F9' && cart.length > 0 && !processing) {
            e.preventDefault();
            handleCompleteSale();
        }
        if (e.key === 'Escape') {
            setSearchTerm('');
            setShowAppOrders(false);
            setShowHeldBills(false);
            setShowHistory(false);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, customerName, paymentMethod, discountAmount, processing]);

  const filteredInventory = useMemo(() => {
    if (!searchTerm) return [];
    return inventory.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.batchNumber && item.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 8); 
  }, [inventory, searchTerm]);

  // Calculations
  const calculateCartTotals = () => {
      let subtotal = 0;
      let taxableAmount = 0;
      let taxAmount = 0;

      cart.forEach(item => {
          const itemTotal = item.sellingPrice * item.quantity;
          subtotal += itemTotal;
          
          const gstDecimal = (item.gstPercentage || 12) / 100;
          const itemTaxable = itemTotal / (1 + gstDecimal);
          const itemTax = itemTotal - itemTaxable;

          taxableAmount += itemTaxable;
          taxAmount += itemTax;
      });

      const total = Math.round(Math.max(0, subtotal - discountAmount));

      return { subtotal, taxableAmount, taxAmount, total };
  };

  const { subtotal, taxableAmount, taxAmount, total } = calculateCartTotals();

  const addToCart = (medicine: Medicine) => {
    if ((medicine.stock || 0) <= 0) {
        showToast('Item is out of stock', 'error');
        return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === medicine.id);
      if (existing) {
        if (existing.quantity >= (medicine.stock || 0)) {
            showToast('Max stock reached', 'error');
            return prev;
        }
        return prev.map(item => 
          item.id === medicine.id ? { ...item, quantity: item.quantity + 1, total: item.sellingPrice * (item.quantity + 1) } : item
        );
      }
      
      const gstDecimal = (medicine.gstPercentage || 12) / 100;
      const initialTaxable = medicine.sellingPrice ? medicine.sellingPrice / (1 + gstDecimal) : 0;
      
      return [...prev, { 
          ...medicine, 
          quantity: 1, 
          sellingPrice: medicine.sellingPrice || 0,
          taxableAmount: initialTaxable,
          gstAmount: (medicine.sellingPrice || 0) - initialTaxable,
          total: medicine.sellingPrice || 0
      }];
    });
    setSearchTerm('');
    searchInputRef.current?.focus();
  };

  const loadBookingIntoCart = (booking: AdminBooking) => {
    // 1. Find the medicine in inventory
    const medicine = inventory.find(m => m.name === booking.medicineName);
    
    if (!medicine) {
        showToast(`Medicine "${booking.medicineName}" not found in current inventory.`, 'error');
        return;
    }

    // 2. Clear current cart and load this item
    setCart([]);
    addToCart(medicine);

    // 3. Set Customer Details
    setCustomerName(booking.customerName);
    setCustomerPhone(''); 

    // 4. Update Booking Status to Ready (since we are processing it)
    if (onBookingAction && booking.status === 'Pending') {
        onBookingAction(booking.id, 'Ready');
    }

    setShowAppOrders(false);
    showToast(`Order loaded for ${booking.customerName}`, 'success');
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const med = inventory.find(i => i.id === id);
        const maxStock = med?.stock || 0;
        const newQty = Math.max(1, item.quantity + delta);
        if (delta > 0 && newQty > maxStock) {
            showToast(`Only ${maxStock} units available`, 'error');
            return item;
        }
        return { 
            ...item, 
            quantity: newQty, 
            total: item.sellingPrice * newQty 
        };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0 || processing) return;
    
    setProcessing(true);
    
    try {
        const saleData: Sale = {
            id: '', // Will be assigned by backend
            invoiceNumber: '', // Will be assigned by backend
            pharmacyId,
            customerName: customerName || 'Walk-in Customer',
            customerPhone,
            doctorName,
            items: cart,
            subtotal,
            taxableAmount,
            taxAmount,
            discount: discountAmount,
            total,
            paymentMethod,
            status: 'Completed',
            date: new Date().toLocaleDateString() // Consistent date
        };
        
        const completedSale = await onCompleteSale(saleData);
        
        if (completedSale) {
            setLastCompletedSale(completedSale);
            setShowSuccess(true);
            
            // Also mark any bookings for this customer as completed if loaded
            if (onBookingAction) {
                 const matchedBooking = pendingBookings.find(b => b.customerName === customerName);
                 if (matchedBooking) {
                     onBookingAction(matchedBooking.id, 'Completed');
                 }
            }
        } else {
            showToast('Failed to process sale. Check inventory.', 'error');
        }

    } catch (error) {
        showToast('Failed to generate invoice', 'error');
    } finally {
        setProcessing(false);
    }
  };

  const handleHoldBill = () => {
      if (cart.length === 0) return;
      const heldBill: Sale = {
          id: `HOLD-${Date.now()}`,
          pharmacyId,
          customerName: customerName || `Held Bill ${new Date().toLocaleTimeString()}`,
          customerPhone,
          items: cart,
          subtotal,
          discount: discountAmount,
          total,
          paymentMethod,
          date: new Date().toLocaleString(),
          status: 'Hold',
          taxableAmount: 0,
          taxAmount: 0
      };
      setHeldBills(prev => [heldBill, ...prev]);
      handleReset(false);
      showToast('Bill put on hold', 'success');
  };

  const handleRecallBill = (bill: Sale) => {
      setCart(bill.items);
      setCustomerName(bill.customerName);
      setCustomerPhone(bill.customerPhone);
      setDiscountAmount(bill.discount);
      setHeldBills(prev => prev.filter(b => b.id !== bill.id));
      setShowHeldBills(false);
      showToast('Bill recalled', 'success');
  };

  const handleReset = (full = true) => {
      setShowSuccess(false);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDoctorName('');
      setDiscountAmount(0);
      if (full) setLastCompletedSale(null);
  };

  const generateReceiptHTML = (sale: Sale) => {
      return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt - ${sale.invoiceNumber}</title>
            <style>
                @page { margin: 0; size: 80mm auto; }
                body { 
                    font-family: 'Courier New', monospace; 
                    width: 72mm; 
                    margin: 2mm auto; 
                    padding: 0; 
                    font-size: 11px; 
                    color: #000; 
                    background: #fff;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .header { margin-bottom: 5px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                .shop-name { font-size: 14px; font-weight: bold; margin: 0; text-transform: uppercase; }
                .meta { font-size: 10px; margin-top: 2px; }
                .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
                
                table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                th { border-bottom: 1px dashed #000; text-align: left; padding: 2px 0; font-size: 10px; }
                td { padding: 2px 0; vertical-align: top; font-size: 10px; }
                
                .totals-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .grand-total { font-size: 14px; font-weight: bold; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; margin-top: 5px; }
                .footer { margin-top: 10px; text-align: center; font-size: 9px; }
                .gst-summary { font-size: 9px; margin-top: 5px; }
            </style>
        </head>
        <body>
            <div class="header text-center">
                <p class="shop-name">${shopDetails?.name || 'Pharmacy'}</p>
                <div class="meta">
                    ${shopDetails?.address ? `${shopDetails.address}<br>` : ''}
                    ${shopDetails?.phone ? `Ph: ${shopDetails.phone}` : ''}
                    ${shopDetails?.gstin ? `<br>GSTIN: ${shopDetails.gstin}` : ''}
                    ${shopDetails?.drug_license_no ? `<br>DL: ${shopDetails.drug_license_no}` : ''}
                </div>
            </div>
            
            <div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Inv: ${sale.invoiceNumber}</span>
                    <span>${sale.date}</span>
                </div>
                <div>Customer: ${sale.customerName}</div>
                ${sale.doctorName ? `<div>Dr: ${sale.doctorName}</div>` : ''}
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 45%">Item</th>
                        <th style="width: 15%">Batch</th>
                        <th style="width: 10%">Qty</th>
                        <th style="width: 30%" class="text-right">Amt</th>
                    </tr>
                </thead>
                <tbody>
                    ${sale.items.map(item => `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.batchNumber || '-'}</td>
                            <td>${item.quantity}</td>
                            <td class="text-right">${(item.sellingPrice * item.quantity).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="divider"></div>

            <div class="totals-row">
                <span>Subtotal:</span>
                <span>₹${sale.subtotal.toFixed(2)}</span>
            </div>
            ${sale.discount > 0 ? `
            <div class="totals-row">
                <span>Discount:</span>
                <span>-₹${sale.discount.toFixed(2)}</span>
            </div>
            ` : ''}
            
            <div class="totals-row gst-summary text-right" style="justify-content: flex-end; color: #444;">
               (Taxable: ${sale.taxableAmount?.toFixed(2)} | GST: ${sale.taxAmount?.toFixed(2)})
            </div>

            <div class="totals-row grand-total">
                <span>TOTAL PAYABLE:</span>
                <span>₹${sale.total.toFixed(2)}</span>
            </div>
            
            <div class="totals-row" style="font-size: 10px; margin-top:2px;">
                <span>Mode: ${sale.paymentMethod}</span>
                <span>Items: ${sale.items.reduce((a, b) => a + b.quantity, 0)}</span>
            </div>

            <div class="footer">
                <p>Terms: Goods once sold will not be taken back.</p>
                <p>*** GET WELL SOON ***</p>
                <p>Powered by Medzo Shop</p>
            </div>
        </body>
        </html>
      `;
  };

  const handlePrint = (sale: Sale | null) => {
      const targetSale = sale || lastCompletedSale;
      if (!targetSale) return;
      
      const receiptContent = generateReceiptHTML(targetSale);
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (printWindow) {
          printWindow.document.write(receiptContent);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
              printWindow.print();
              printWindow.close();
          }, 250);
      }
  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-fade-in min-h-[60vh] relative">
        <div className="bg-emerald-50 p-6 rounded-full mb-6">
            <CheckCircle className="w-16 h-16 text-emerald-600" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Sale Completed!</h2>
        <p className="text-slate-500 mt-2 font-mono">{lastCompletedSale?.invoiceNumber}</p>
        
        <div className="mt-8 bg-white p-6 rounded-2xl shadow-lg border border-slate-100 min-w-[320px] text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Received</p>
            <p className="text-4xl font-extrabold text-emerald-600 mb-6">₹{lastCompletedSale?.total}</p>
            <p className="text-xs font-bold text-slate-500 mb-4 bg-slate-100 py-1 px-3 rounded-full inline-block uppercase">Paid via {lastCompletedSale?.paymentMethod}</p>
            
            <div className="space-y-3">
                <button 
                    onClick={() => handlePrint(null)}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition flex items-center justify-center shadow-lg group"
                >
                    <Printer className="w-5 h-5 mr-2 group-hover:animate-pulse" /> Print Receipt
                </button>
                
                <button 
                    className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition flex items-center justify-center"
                    onClick={() => alert("Email invoice sent to customer!")}
                >
                    <Mail className="w-5 h-5 mr-2" /> Email Invoice
                </button>
            </div>
        </div>

        <button 
            onClick={() => handleReset(true)}
            className="mt-8 text-emerald-600 font-bold hover:text-emerald-700 flex items-center bg-emerald-50 px-6 py-2 rounded-full"
        >
            <RotateCw className="w-4 h-4 mr-2" /> Start New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row h-full gap-4 animate-fade-in relative">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.visible} onClose={() => setToast(prev => ({...prev, visible: false}))} />
      
      {/* Pending Orders Sidebar */}
      {showAppOrders && (
          <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 p-6 border-l border-slate-100 transform transition-transform animate-slide-in-right">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg flex items-center"><Smartphone className="w-5 h-5 mr-2 text-blue-500"/> Online Orders</h3>
                  <button onClick={() => setShowAppOrders(false)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronDown className="w-5 h-5 rotate-90"/></button>
              </div>
              <div className="space-y-4">
                  {pendingBookings.length === 0 ? (
                      <p className="text-slate-400 text-center text-sm py-10">No pending orders.</p>
                  ) : pendingBookings.map(booking => (
                      <div key={booking.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition cursor-pointer group" onClick={() => loadBookingIntoCart(booking)}>
                          <div className="flex justify-between mb-1">
                              <span className="font-bold text-slate-800 truncate">{booking.customerName}</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{booking.status}</span>
                          </div>
                          <p className="text-sm text-slate-600 mb-2 truncate">{booking.medicineName}</p>
                          <div className="text-xs text-slate-500 flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
                              <span>{booking.orderTime}</span>
                              <span className="text-emerald-600 font-bold">Load Bill →</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Invoice History Sidebar (Reprint) */}
      {showHistory && (
          <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 p-6 border-l border-slate-100 transform transition-transform animate-slide-in-right flex flex-col">
              <div className="flex justify-between items-center mb-6 flex-shrink-0">
                  <h3 className="font-bold text-lg flex items-center"><FileClock className="w-5 h-5 mr-2 text-slate-700"/> Invoice History</h3>
                  <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronDown className="w-5 h-5 rotate-90"/></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                  {recentSales.length === 0 ? (
                      <p className="text-slate-400 text-center text-sm py-10">No sales history found.</p>
                  ) : recentSales.map(sale => (
                      <div key={sale.id} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-200 hover:shadow-md transition group">
                          <div className="flex justify-between mb-1">
                              <span className="font-bold text-slate-800">{sale.customerName || 'Walk-in'}</span>
                              <span className="font-bold text-emerald-600">₹{sale.total}</span>
                          </div>
                          <div className="text-xs text-slate-500 flex justify-between mb-2">
                              <span className="font-mono">{sale.invoiceNumber}</span>
                              <span>{sale.date}</span>
                          </div>
                          <div className="border-t border-slate-100 pt-2 mt-2 flex justify-end">
                              <button 
                                onClick={() => handlePrint(sale)}
                                className="flex items-center text-xs font-bold text-slate-600 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition"
                              >
                                <Printer className="w-3 h-3 mr-1" /> Reprint
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Held Bills Sidebar */}
      {showHeldBills && (
          <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 p-6 border-l border-slate-100 transform transition-transform animate-slide-in-right">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg flex items-center"><Clock className="w-5 h-5 mr-2 text-amber-500"/> Held Bills</h3>
                  <button onClick={() => setShowHeldBills(false)} className="p-2 hover:bg-slate-100 rounded-full"><ChevronDown className="w-5 h-5 rotate-90"/></button>
              </div>
              <div className="space-y-4">
                  {heldBills.length === 0 ? (
                      <p className="text-slate-400 text-center text-sm py-10">No bills currently on hold.</p>
                  ) : heldBills.map(bill => (
                      <div key={bill.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:shadow-md transition cursor-pointer group" onClick={() => handleRecallBill(bill)}>
                          <div className="flex justify-between mb-2">
                              <span className="font-bold text-slate-800">{bill.customerName}</span>
                              <span className="font-bold text-emerald-600">₹{bill.total}</span>
                          </div>
                          <div className="text-xs text-slate-500 flex justify-between">
                              <span>{new Date(bill.date).toLocaleTimeString()}</span>
                              <span className="group-hover:text-emerald-600 font-bold">Recall</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Main Billing Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        
        {/* Top Bar: Search & Info */}
        <div className="p-4 border-b border-slate-100 bg-white z-10 grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="F2: Search Medicine / Batch..."
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-emerald-500/30 focus:ring-4 focus:ring-emerald-500/10 outline-none text-slate-800 font-medium transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="col-span-6 md:col-span-3 relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="Customer Name" 
                    className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-emerald-500 outline-none font-medium" 
                    value={customerName} 
                    onChange={e => setCustomerName(e.target.value)} 
                />
            </div>
            <div className="col-span-6 md:col-span-3 relative">
                <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="Doctor Name" 
                    className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:border-emerald-500 outline-none font-medium" 
                    value={doctorName} 
                    onChange={e => setDoctorName(e.target.value)} 
                />
            </div>
        </div>

        {/* Content Area: Search Results OR Cart Grid */}
        <div className="flex-1 overflow-y-auto p-0 relative">
          {searchTerm ? (
            <div className="p-4 space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Search Results</h3>
                {filteredInventory.map((item, idx) => (
                    <button 
                        key={item.id} 
                        onClick={() => addToCart(item)} 
                        disabled={(item.stock || 0) <= 0}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group ${
                            (item.stock || 0) <= 0 
                            ? 'opacity-50 bg-slate-50 border-transparent cursor-not-allowed' 
                            : 'bg-white border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/10'
                        }`}
                    >
                        <div className="flex items-center">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold mr-3">
                                {item.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-slate-800">{item.name}</p>
                                <p className="text-xs text-slate-500 font-mono">Batch: {item.batchNumber || 'N/A'} • Exp: {item.expiryDate || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-emerald-600">₹{item.sellingPrice}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{item.stock} LEFT</p>
                        </div>
                    </button>
                ))}
            </div>
          ) : (
            <div className="w-full">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 text-xs uppercase text-slate-500 font-bold tracking-wider">
                        <tr>
                            <th className="p-4 border-b">Medicine</th>
                            <th className="p-4 border-b">Batch</th>
                            <th className="p-4 border-b">Exp</th>
                            <th className="p-4 border-b w-32">Qty</th>
                            <th className="p-4 border-b text-right">Price</th>
                            <th className="p-4 border-b text-right">Total</th>
                            <th className="p-4 border-b w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-slate-700">
                        {cart.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-10 text-center text-slate-400">
                                    <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                                    <p>Cart is empty. Press F2 to search.</p>
                                </td>
                            </tr>
                        ) : (
                            cart.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/80 border-b border-slate-50 last:border-0 group">
                                    <td className="p-4 font-bold text-slate-800">{item.name}</td>
                                    <td className="p-4 font-mono text-xs">{item.batchNumber || '-'}</td>
                                    <td className="p-4 text-xs">{item.expiryDate || '-'}</td>
                                    <td className="p-4">
                                        <div className="flex items-center bg-slate-100 rounded-lg w-fit">
                                            <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-200 rounded-l-lg"><Minus className="w-3 h-3"/></button>
                                            <span className="w-8 text-center font-bold text-slate-800">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-200 rounded-r-lg"><Plus className="w-3 h-3"/></button>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">₹{item.sellingPrice}</td>
                                    <td className="p-4 text-right font-bold text-emerald-700">₹{(item.sellingPrice * item.quantity).toFixed(2)}</td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 className="w-4 h-4"/></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <div className="flex gap-2">
                 <button onClick={handleHoldBill} disabled={cart.length === 0} className="flex items-center px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-200 transition disabled:opacity-50">
                     <Clock className="w-4 h-4 mr-2"/> Hold
                 </button>
                 <button onClick={() => setShowHeldBills(!showHeldBills)} className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition relative">
                     Recall
                     {heldBills.length > 0 && <span className="ml-2 bg-slate-800 text-white text-[10px] px-1.5 rounded-full">{heldBills.length}</span>}
                 </button>
                 <button onClick={() => setShowAppOrders(!showAppOrders)} className="flex items-center px-4 py-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition relative ml-2">
                     <Smartphone className="w-4 h-4 mr-2"/> App Orders
                     {pendingBookings.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full animate-bounce">{pendingBookings.length}</span>}
                 </button>
                 <button onClick={() => setShowHistory(!showHistory)} className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition relative ml-2">
                     <History className="w-4 h-4 mr-2"/> History
                 </button>
             </div>
             
             <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                 <span className="flex items-center"><Keyboard className="w-3 h-3 mr-1"/> F2 Search</span>
                 <span className="flex items-center"><Keyboard className="w-3 h-3 mr-1"/> F4 Cash</span>
                 <span className="flex items-center"><Keyboard className="w-3 h-3 mr-1"/> F8 UPI</span>
                 <span className="flex items-center"><Keyboard className="w-3 h-3 mr-1"/> F10 Card</span>
                 <span className="flex items-center"><Keyboard className="w-3 h-3 mr-1"/> F9 Pay</span>
             </div>
        </div>
      </div>
      
      {/* Right Panel: Checkout */}
      <div className="w-full xl:w-96 flex flex-col shrink-0 h-auto xl:h-full gap-4">
        {/* Payment Methods */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center"><CreditCard className="w-5 h-5 mr-2 text-emerald-600"/> Payment Mode</h3>
            <div className="grid grid-cols-3 gap-3">
                {['Cash', 'UPI', 'Card'].map(m => (
                <button 
                    key={m} 
                    onClick={() => setPaymentMethod(m as PaymentMethod)} 
                    className={`py-3 px-2 text-sm font-bold rounded-xl border transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden ${
                        paymentMethod === m 
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200 transform scale-105 z-10' 
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-emerald-200'
                    }`}
                >
                    {paymentMethod === m && <div className="absolute inset-0 bg-white/10"></div>}
                    {m === 'Cash' && <Banknote className="w-5 h-5" />}
                    {m === 'UPI' && <Smartphone className="w-5 h-5" />}
                    {m === 'Card' && <CreditCard className="w-5 h-5" />}
                    {m}
                    <span className="text-[9px] opacity-60 font-normal">
                        {m === 'Cash' ? 'F4' : m === 'UPI' ? 'F8' : 'F10'}
                    </span>
                </button>
                ))}
            </div>
        </div>

        {/* Totals & Complete */}
        <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-emerald-500 to-teal-500 w-full"></div>
            <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center">
                    <Receipt className="w-5 h-5 mr-2 text-slate-500" /> Bill Summary
                </h3>

                <div className="space-y-4 flex-1">
                    <div className="flex justify-between text-slate-500 text-sm font-medium">
                        <span>Subtotal</span>
                        <span className="text-slate-800">₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-sm font-medium">
                        <span>GST (Included)</span>
                        <span className="text-slate-800">₹{taxAmount.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-slate-500 text-sm font-medium py-2 border-y border-dashed border-slate-200 my-2">
                        <span>Discount</span>
                        <div className="flex items-center">
                            <span className="mr-2 text-red-500 font-bold">- ₹</span>
                            <input 
                                type="number" 
                                min="0"
                                value={discountAmount === 0 ? '' : discountAmount} 
                                onChange={e => setDiscountAmount(Number(e.target.value))} 
                                placeholder="0"
                                className="w-20 px-2 py-1 bg-red-50 border border-red-100 rounded-lg text-right text-red-700 font-bold outline-none focus:ring-2 focus:ring-red-200" 
                            />
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-end">
                        <span className="text-lg font-bold text-slate-800">Total</span>
                        <span className="text-3xl font-extrabold text-emerald-600">₹{total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="mt-8 space-y-3">
                    <button 
                        onClick={handleCompleteSale} 
                        disabled={cart.length === 0 || processing} 
                        className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-black disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-xl active:scale-[0.98] flex justify-center items-center"
                    >
                        {processing ? <Loader2 className="w-6 h-6 animate-spin"/> : <>PAY NOW <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded">F9</span></>}
                    </button>
                    <button 
                        onClick={() => handleReset(false)}
                        className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition"
                    >
                        Reset Form
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SalesBilling;
