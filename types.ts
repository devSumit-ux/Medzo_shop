
export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';
export type BookingStatus = 'Pending' | 'Ready' | 'Completed';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card';
export type UserRole = 'super_admin' | 'shop_owner' | 'consumer';
export type VerificationStatus = 'unverified' | 'pending_review' | 'verified' | 'rejected';

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}

// Unified Medicine Interface
export interface Medicine {
  id: string;
  name: string;
  brand: string; // Used as Marketed By
  manufacturer?: string; // Manufactured By
  category: string;
  imageUrl: string;
  images?: string[]; // Array of image URLs for carousel
  pharmacyId?: string;
  storeName?: string; // New field for display
  
  // Professional ERP Fields
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  hsnCode?: string;
  rackNumber?: string; // e.g., "A-12"
  packing?: string; // e.g., "1x15 Strip"
  purchaseRate?: number; // Cost Price
  gstPercentage?: number;
  
  // Consumer specific fields
  dosage?: string;
  minPrice?: number;
  maxPrice?: number;
  availableStores?: number;

  // Admin/Inventory specific fields
  stock?: number;
  mrp?: number;
  sellingPrice?: number;
}

export interface Pharmacy {
  id: string;
  ownerId?: string; // Link to auth user
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance?: number;
  rating?: number;
  reviewCount?: number;
  phone?: string;
  price?: number; // Calculated field for UI
  stockStatus?: StockStatus; // Calculated field for UI
  stock?: number; // Calculated
  verified?: boolean; // Legacy boolean
  
  // Professional Settings
  gstin?: string;
  drug_license_no?: string;
  legal_trade_name?: string; // Fetched from GST API
  gst_verified_at?: string;
  upi_id?: string;
  invoice_terms?: string;
  low_stock_threshold?: number;
  expiry_alert_days?: number;

  // Verification Documents
  drug_license_url?: string;
  gst_certificate_url?: string;
  verification_status?: VerificationStatus;
}

// Prescription specific types
export interface PrescriptionItem {
  name: string;
  category?: string; // Added for AI categorization
  dosagePattern: string; // e.g., "1-0-1"
  days: number;
  quantity: number;
}

export interface PrescriptionShopResult {
  pharmacyId: string;
  name: string;
  address: string;
  totalCost: number;
  distance: number;
}

// Consumer Booking
export interface Booking {
  id: string;
  medicine: Medicine | null; // Can be null for prescription orders
  pharmacy: Pharmacy;
  date: string;
  time: string;
  status: BookingStatus;
  totalAmount: number;
  qrCodeData: string;
  // Prescription Additions
  prescriptionUrl?: string;
  itemsSnapshot?: PrescriptionItem[];
  // Rating
  isRated?: boolean;
}

// Admin Specific Types
export interface CartItem extends Medicine {
  quantity: number;
  sellingPrice: number; // Required for cart
  taxableAmount: number; // Calculated (Price / 1+GST)
  gstAmount: number; // Calculated (Price - Taxable)
  total: number;
}

export interface Sale {
  id: string;
  invoiceNumber?: string;
  pharmacyId: string;
  customerName: string;
  customerPhone: string;
  doctorName?: string;
  items: CartItem[];
  subtotal: number;
  taxableAmount?: number;
  taxAmount?: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  status?: 'Completed' | 'Hold' | 'Cancelled';
  date: string;
}

export interface AdminBooking {
  id: string;
  customerName: string;
  customerEmail?: string;
  medicineName: string;
  orderTime: string;
  status: BookingStatus;
  amount: number;
  qrCodeData?: string;
  prescriptionUrl?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}
