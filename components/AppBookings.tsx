
import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Check, QrCode, XCircle, RefreshCw, FileText, ChevronDown, ChevronUp, Loader2, Clock, Mail } from 'lucide-react';
import { AdminBooking, BookingStatus } from '../types';
import { supabase } from '../supabaseClient';

declare const Html5Qrcode: any;

interface AppBookingsProps {
  bookings: AdminBooking[];
  setBookings: React.Dispatch<React.SetStateAction<AdminBooking[]>>;
}

const AppBookings: React.FC<AppBookingsProps> = ({ bookings, setBookings }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraMode, setCameraMode] = useState<'environment' | 'user'>('environment');
  const [scanError, setScanError] = useState<string | null>(null);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  
  const scannerRef = useRef<any>(null);
  const bookingsRef = useRef(bookings);

  useEffect(() => {
      bookingsRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    return () => {
        if (scannerRef.current) {
            try {
                scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {});
            } catch (e) {}
        }
    };
  }, []);

  // Effect to manage scanner lifecycle based on UI state
  useEffect(() => {
    if (isScanning) {
        // Small delay to ensure DOM element exists
        const timer = setTimeout(() => {
            startScanner();
        }, 100);
        return () => clearTimeout(timer);
    } else {
        stopScanner();
    }
  }, [isScanning, cameraMode]);

  const startScanner = async () => {
    // Ensure cleanup first
    await stopScanner();
    
    setScanError(null);
    const element = document.getElementById('qr-reader');
    if (!element) return;

    try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;
        
        await html5QrCode.start(
            { facingMode: cameraMode }, 
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            (decodedText: string) => {
                // Success callback
                handleScanSuccess(decodedText);
            },
            () => {
                // Error callback (ignore frequent read errors)
            }
        );
    } catch (err: any) {
        console.error("Scanner Error", err);
        setScanError("Could not access camera. Ensure permission is granted.");
        setIsScanning(false);
    }
  };

  const stopScanner = async () => {
      if (scannerRef.current) {
          try {
              await scannerRef.current.stop();
              await scannerRef.current.clear();
          } catch (e) {
              console.log("Stop failed", e);
          }
          scannerRef.current = null;
      }
  };

  const handleScanSuccess = async (code: string) => {
      if (!scannerRef.current) return;
      
      // Pause scanning
      try { await scannerRef.current.pause(); } catch(e) {}

      const cleanCode = code.trim();
      const booking = bookingsRef.current.find(b => b.qrCodeData === cleanCode || b.id === cleanCode);
      
      if (booking) {
          if (booking.status === 'Completed') {
              alert(`Order for ${booking.customerName} is already Completed.`);
              setIsScanning(false);
              return;
          }
          
          // Automatically mark as completed without confirmation dialog
          await updateStatus(booking.id, 'Completed');
          
          // Play a simple success sound if browser allows
          try {
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'); 
             await audio.play();
          } catch(e) {}

          alert(`✅ SUCCESS! Order for ${booking.customerName} marked as COMPLETED.`);
          setIsScanning(false); 
      } else {
          alert(`❌ Order not found for code: ${code}`);
          try { await scannerRef.current.resume(); } catch(e) {}
      }
  };

  const toggleCamera = () => setCameraMode(prev => prev === 'environment' ? 'user' : 'environment');

  const updateStatus = async (id: string, status: BookingStatus) => {
    setUpdating(id);
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    await supabase.from('bookings').update({ status }).eq('id', id);
    setUpdating(null);
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Smartphone className="w-6 h-6 mr-2 text-emerald-600" /> App Orders
          </h2>
          <button 
            onClick={() => setIsScanning(!isScanning)}
            className={`px-4 py-2 rounded-xl flex items-center font-bold shadow-lg transition ${
                isScanning ? 'bg-slate-100 text-slate-700' : 'bg-emerald-600 text-white'
            }`}
          >
            {isScanning ? <><XCircle className="w-5 h-5 mr-2"/> Close</> : <><QrCode className="w-5 h-5 mr-2"/> Scan QR</>}
          </button>
      </div>

      {isScanning && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in">
              <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md relative flex flex-col items-center">
                  <button onClick={() => setIsScanning(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"><XCircle className="w-6 h-6" /></button>
                  <h3 className="font-bold text-xl mb-6 text-slate-800 flex items-center"><QrCode className="w-6 h-6 mr-2 text-emerald-600" /> Scan QR Code</h3>
                  
                  {scanError ? (
                      <div className="text-red-500 font-bold mb-4 bg-red-50 p-4 rounded-xl text-center w-full">
                          <p>{scanError}</p>
                          <button onClick={() => setIsScanning(false)} className="mt-2 text-sm underline">Close</button>
                      </div>
                  ) : (
                      <div id="qr-reader" className="w-full aspect-square bg-black rounded-xl mb-4 overflow-hidden border-4 border-slate-100 shadow-inner"></div>
                  )}
                  
                  <button onClick={toggleCamera} className="py-2 px-4 bg-slate-100 font-bold rounded-lg flex items-center hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 mr-2"/> Flip Camera</button>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bookings.length === 0 ? (
            <div className="col-span-full text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No active app orders.</p>
            </div>
        ) : (
            bookings.map(booking => (
            <div key={booking.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition group relative overflow-hidden flex flex-col">
                {/* Prescription Badge */}
                {booking.prescriptionUrl && (
                    <div className="absolute top-0 right-0 bg-blue-100 text-blue-700 px-3 py-1 rounded-bl-xl text-[10px] font-bold uppercase flex items-center shadow-sm">
                        <FileText className="w-3 h-3 mr-1" /> Rx Order
                    </div>
                )}

                <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0 pr-2">
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded">#{booking.id.substring(0,8)}</span>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Customer</p>
                        <h3 className="font-bold text-slate-800 text-base truncate" title={booking.customerName}>{booking.customerName}</h3>
                        {booking.customerEmail && (
                            <p className="text-xs text-slate-500 font-medium truncate flex items-center mt-0.5" title={booking.customerEmail}>
                                <Mail className="w-3 h-3 mr-1 opacity-50"/> {booking.customerEmail}
                            </p>
                        )}
                    </div>
                    {!booking.prescriptionUrl && (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase flex-shrink-0 ${booking.status === 'Pending' ? 'bg-amber-50 text-amber-600' : booking.status === 'Ready' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {booking.status}
                        </span>
                    )}
                </div>
                
                <div className="mb-4 flex-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Medicines / Items</p>
                    <div className="text-slate-700 font-medium text-sm whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto custom-scrollbar bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {booking.medicineName}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-50">
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 flex items-center font-medium">
                            <Clock className="w-3 h-3 mr-1"/> {booking.orderTime}
                        </span>
                        <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded border border-emerald-100">
                            Total: ₹{booking.amount}
                        </span>
                    </div>
                </div>

                {/* Prescription Details Expander */}
                {booking.prescriptionUrl && (
                    <div className="mb-4 bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <div 
                            className="flex justify-between items-center cursor-pointer" 
                            onClick={() => setExpandedBooking(expandedBooking === booking.id ? null : booking.id)}
                        >
                            <span className="text-xs font-bold text-slate-500">View Prescription Image</span>
                            {expandedBooking === booking.id ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                        </div>
                        {expandedBooking === booking.id && (
                            <div className="mt-3 animate-fade-in">
                                <a href={booking.prescriptionUrl} target="_blank" rel="noreferrer">
                                    <img src={booking.prescriptionUrl} className="w-full h-32 object-cover rounded-lg border border-slate-200 mb-2" alt="Rx" />
                                </a>
                                <div className="p-2 bg-amber-50 rounded text-[10px] text-amber-700 border border-amber-100 leading-tight">
                                    ⚠️ Verify prescription physical copy before dispensing.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-2 mt-auto">
                    {booking.status === 'Pending' && (
                        <button 
                            onClick={() => updateStatus(booking.id, 'Ready')} 
                            disabled={updating === booking.id}
                            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 disabled:opacity-70 transition-colors"
                        >
                            {updating === booking.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'Mark Ready'}
                        </button>
                    )}
                    {booking.status === 'Ready' && (
                        <button 
                            onClick={() => updateStatus(booking.id, 'Completed')} 
                            disabled={updating === booking.id}
                            className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 flex justify-center items-center disabled:opacity-70 transition-colors"
                        >
                            {updating === booking.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Check className="w-4 h-4 mr-1"/> Complete</>}
                        </button>
                    )}
                    {booking.status === 'Completed' && (
                        <div className="flex-1 bg-slate-50 text-slate-400 py-2 rounded-xl text-sm font-bold text-center border border-slate-200">
                            Completed
                        </div>
                    )}
                </div>
            </div>
            ))
        )}
      </div>
    </div>
  );
};

export default AppBookings;
