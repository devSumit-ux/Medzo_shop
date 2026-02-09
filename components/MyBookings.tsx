
import React, { useState } from 'react';
import { Booking, BookingStatus } from '../types';
import { Calendar, MapPin, ChevronRight, QrCode, Star, MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';

interface MyBookingsProps {
  bookings: Booking[];
}

const MyBookings: React.FC<MyBookingsProps> = ({ bookings: initialBookings }) => {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [activeTab, setActiveTab] = useState<'Active' | 'Completed'>('Active');
  const [selectedQR, setSelectedQR] = useState<string | null>(null);

  // Rating State
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [selectedBookingForRating, setSelectedBookingForRating] = useState<Booking | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Update local state when props change
  React.useEffect(() => {
      setBookings(initialBookings);
  }, [initialBookings]);

  const filteredBookings = bookings.filter(b => {
    if (activeTab === 'Active') return b.status === 'Pending' || b.status === 'Ready';
    return b.status === 'Completed';
  });

  const getStatusStyle = (status: BookingStatus) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Ready': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Completed': return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const openRatingModal = (booking: Booking) => {
      setSelectedBookingForRating(booking);
      setRatingValue(0);
      setRatingComment('');
      setRatingModalOpen(true);
  };

  const submitRating = async () => {
      if (!selectedBookingForRating || ratingValue === 0) return;
      setIsSubmittingRating(true);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user found");

        // Use the actual full ID from the DB. 
        // Note: In `App.tsx`, we shorten the ID for display. We need to find the full ID if possible, 
        // but since we only have the shortened ID in the frontend object in some cases, 
        // we might rely on the `booking_id` passed to the RPC being the one we have.
        // However, `booking.id` in `types.ts` is likely the UUID from DB if not sliced.
        // Let's assume `booking.id` holds enough info or is the UUID. 
        // *Correction*: In App.tsx: `id: b.id.substring(0, 8).toUpperCase()`
        // This is problematic for the RPC update which needs the full UUID. 
        // FIX: Ideally App.tsx should store full ID. 
        // WORKAROUND: We will query the DB for the booking using the short ID logic if needed, 
        // OR better, we update App.tsx to store full ID in a separate field? 
        // ACTUALLY, checking App.tsx, we only store substring. 
        // Let's rely on the fact that `bookings` in DB are indexed by UUID.
        // We will try to pass the short ID, but the DB update `WHERE id = p_booking_id` will fail if it expects UUID.
        
        // Let's optimistically assume we can't fix App.tsx in this specific XML block without fetching data again.
        // Wait, I can try to find the booking using the QR code data which is unique?
        // Or, I can fetch the booking ID based on the `qrCodeData` since that is stored fully.
        
        // Better: I will use `qr_code_data` to identify the booking in the RPC if ID fails, 
        // BUT the cleaner way is to update App.tsx to store full ID.
        // I'll stick to using the `id` we have. If it's a substring, we might have an issue.
        // Let's assume for this specific task that `booking.id` works or the user has updated App.tsx. 
        // (I updated App.tsx in previous steps? No, I only updated `isRated` mapping).
        // Actually, looking at the App.tsx provided in context, `id` IS truncated.
        // I will assume the backend RPC handles text IDs or I should try to use `qrCodeData` to find it.
        // Let's try to find the full ID first.
        
        const { data: fullBooking } = await supabase
            .from('bookings')
            .select('id')
            .eq('qr_code_data', selectedBookingForRating.qrCodeData)
            .single();

        if (!fullBooking) throw new Error("Booking not found");

        const { error } = await supabase.rpc('submit_review', {
            p_booking_id: fullBooking.id,
            p_pharmacy_id: selectedBookingForRating.pharmacy.id,
            p_user_id: user.id,
            p_rating: ratingValue,
            p_comment: ratingComment
        });

        if (error) throw error;

        // Update local state
        setBookings(prev => prev.map(b => b.id === selectedBookingForRating.id ? { ...b, isRated: true } : b));
        setRatingModalOpen(false);
        alert("Thanks for your feedback!");

      } catch (e: any) {
          console.error(e);
          alert("Failed to submit rating: " + e.message);
      } finally {
          setIsSubmittingRating(false);
      }
  };

  return (
    <div className="bg-gray-50 min-h-full pb-8 relative">
      <div className="bg-white px-6 md:px-12 pt-12 pb-6 shadow-sm border-b border-gray-100 mb-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
            <div className="flex p-1 bg-gray-100 rounded-xl w-full md:w-auto">
            <button
                onClick={() => setActiveTab('Active')}
                className={`flex-1 md:w-32 py-2.5 text-sm font-bold rounded-lg transition-all ${
                activeTab === 'Active' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                Active
            </button>
            <button
                onClick={() => setActiveTab('Completed')}
                className={`flex-1 md:w-32 py-2.5 text-sm font-bold rounded-lg transition-all ${
                activeTab === 'Completed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                History
            </button>
            </div>
        </div>
      </div>

      <div className="px-6 md:px-12 max-w-5xl mx-auto">
        {filteredBookings.length === 0 ? (
            <div className="text-center py-24 opacity-50 bg-white rounded-3xl border border-gray-100">
                <div className="w-20 h-20 bg-gray-50 rounded-full mx-auto mb-6 flex items-center justify-center">
                    <Calendar className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-lg font-medium text-gray-500">No {activeTab.toLowerCase()} bookings found.</p>
                <button className="mt-4 text-emerald-600 font-bold hover:underline">Browse Medicines</button>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {filteredBookings.map(booking => (
                <div key={booking.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center">
                            <div className="w-14 h-14 rounded-xl bg-gray-50 mr-4 overflow-hidden border border-gray-100">
                                <img src={booking.medicine.imageUrl} alt="" className="w-full h-full object-cover mix-blend-multiply" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-base">{booking.medicine.name}</h3>
                                <div className="mt-1">
                                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide border ${getStatusStyle(booking.status)}`}>
                                        {booking.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <p className="font-bold text-gray-900 text-lg">₹{booking.totalAmount}</p>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
                        <div className="flex items-start mb-3">
                            <MapPin className="w-4 h-4 text-emerald-500 mr-3 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-gray-800">{booking.pharmacy.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{booking.pharmacy.address}</p>
                            </div>
                        </div>
                        <div className="flex items-center text-xs text-gray-500 ml-7 font-medium">
                            <Calendar className="w-4 h-4 mr-2 text-gray-400" /> {booking.date}, {booking.time}
                        </div>
                    </div>

                    {activeTab === 'Active' && (
                        <button 
                            onClick={() => setSelectedQR(booking.qrCodeData)}
                            className="w-full py-3 bg-emerald-50 text-emerald-600 font-bold text-sm rounded-xl hover:bg-emerald-100 transition flex items-center justify-center border border-emerald-100"
                        >
                            <QrCode className="w-4 h-4 mr-2" /> Show QR Code
                        </button>
                    )}
                    {activeTab === 'Completed' && (
                        <div className="flex gap-3">
                            {!booking.isRated ? (
                                <button 
                                    onClick={() => openRatingModal(booking)}
                                    className="flex-1 py-3 bg-yellow-50 text-yellow-700 font-bold text-sm rounded-xl hover:bg-yellow-100 transition flex items-center justify-center border border-yellow-200"
                                >
                                    <Star className="w-4 h-4 mr-2" /> Rate
                                </button>
                            ) : (
                                <div className="flex-1 py-3 bg-gray-50 text-emerald-600 font-bold text-sm rounded-xl flex items-center justify-center border border-gray-100">
                                    <Star className="w-4 h-4 mr-2 fill-emerald-600" /> Rated
                                </div>
                            )}
                            <button className="flex-1 py-3 bg-gray-50 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-100 transition flex items-center justify-center border border-gray-200">
                                Reorder
                            </button>
                        </div>
                    )}
                </div>
                ))}
            </div>
        )}
      </div>

      {/* QR Code Modal */}
      {selectedQR && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 animate-fade-in" onClick={() => setSelectedQR(null)}>
            <div className="bg-white p-8 rounded-3xl w-full max-w-sm flex flex-col items-center relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedQR(null)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">×</button>
                <h3 className="font-bold text-xl mb-8 text-gray-900">Scan at Pharmacy</h3>
                <div className="p-6 border-4 border-emerald-50 rounded-3xl mb-8 bg-white shadow-inner">
                    <QRCodeSVG value={selectedQR} size={200} />
                </div>
                <p className="text-center text-sm text-gray-500 mb-8 max-w-[200px]">Show this code to the pharmacist to pickup your order.</p>
                <button 
                    onClick={() => setSelectedQR(null)}
                    className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
      )}

      {/* Rating Modal */}
      {ratingModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setRatingModalOpen(false)}>
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden relative" onClick={e => e.stopPropagation()}>
                <div className="p-6 text-center border-b border-gray-100 bg-emerald-50/50">
                    <h3 className="font-bold text-xl text-gray-900">Rate Your Experience</h3>
                    <p className="text-sm text-gray-500 mt-1">How was your order at {selectedBookingForRating?.pharmacy.name}?</p>
                    <button onClick={() => setRatingModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="p-8 flex flex-col items-center">
                    <div className="flex gap-2 mb-8">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button 
                                key={star} 
                                onClick={() => setRatingValue(star)}
                                className={`p-2 transition-transform hover:scale-110 ${ratingValue >= star ? 'text-yellow-400' : 'text-gray-200'}`}
                            >
                                <Star className={`w-10 h-10 ${ratingValue >= star ? 'fill-current' : ''}`} strokeWidth={1.5} />
                            </button>
                        ))}
                    </div>
                    
                    <div className="w-full mb-6">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 block">Leave a comment (Optional)</label>
                        <div className="relative">
                            <MessageSquare className="absolute top-3 left-3 w-5 h-5 text-gray-400" />
                            <textarea 
                                value={ratingComment}
                                onChange={e => setRatingComment(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-emerald-500 outline-none transition text-sm font-medium resize-none h-24"
                                placeholder="Was the medicine in stock? How was the service?"
                            />
                        </div>
                    </div>

                    <button 
                        onClick={submitRating}
                        disabled={ratingValue === 0 || isSubmittingRating}
                        className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmittingRating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5 mr-2" /> Submit Review</>}
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default MyBookings;
