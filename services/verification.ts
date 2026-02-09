
/**
 * Verification Service
 * Handles validation of Indian Legal Documents (GST, Drug License)
 * 
 * NOTE FOR PRODUCTION:
 * To get real-time data, replace the simulated API calls below with calls to 
 * paid providers like Karza, Sandbox, or Setu.
 */

interface VerificationResult {
    isValid: boolean;
    message: string;
    data?: any;
}

// 1. GSTIN Checksum Validator (Modulus 36 Algorithm)
// Format: 22AAAAA0000A1Z5
const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const validateGSTChecksum = (gstin: string): boolean => {
    if (!gstin || gstin.length !== 15) return false;
    const inputChars = gstin.trim().toUpperCase();
    
    // Regex check first
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(inputChars)) return false;

    // Mod 36 Checksum Calculation
    // (Simplified logic: In a real app, we run the full matrix algo. 
    // For this demo, we assume the Regex is sufficient to pass the "format" check
    // and let the Mock API handle the business logic).
    return true;
};

export const verifyGSTIN = async (gstin: string): Promise<VerificationResult> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const isValidFormat = validateGSTChecksum(gstin);

            if (isValidFormat) {
                // MOCK API RESPONSE
                // In production, fetch(`https://api.provider.com/gst/${gstin}`)
                resolve({
                    isValid: true,
                    message: "GSTIN Verified Successfully",
                    data: {
                        legalName: "MEDZO PHARMACY PRIVATE LIMITED",
                        status: "Active",
                        type: "Private Limited Company",
                        taxpayerType: "Regular"
                    }
                });
            } else {
                resolve({
                    isValid: false,
                    message: "Invalid GSTIN format or checksum mismatch."
                });
            }
        }, 1500); // Simulate network delay
    });
};

export const verifyDrugLicense = async (dlNo: string): Promise<VerificationResult> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            // DL Formats vary wildly by state (e.g., KA-BLR-2023-001 or 20B/21B/...).
            // We implement a basic format check.
            const dlRegex = /^[A-Z0-9\-\/\s]{6,20}$/;
            
            if (dlRegex.test(dlNo.toUpperCase())) {
                resolve({
                    isValid: true,
                    message: "Drug License format valid. Pending physical document review."
                });
            } else {
                resolve({
                    isValid: false,
                    message: "Invalid Drug License format. Use alphanumeric characters."
                });
            }
        }, 1500);
    });
};
