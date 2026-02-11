const storageBucketFromEnv = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();

export const firebaseConfig = {
  "projectId": process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "studio-3274070059-be589",
  "appId": process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:797045355004:web:4f740fcc3af386eee64279",
  "storageBucket": storageBucketFromEnv || "studio-3274070059-be589.firebasestorage.app",
  "apiKey": process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyC0LZf8syk5PXu7SO8hLmfBtdv8d6TIRTI",
  "authDomain": process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "studio-3274070059-be589.firebaseapp.com",
  "measurementId": process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
  "messagingSenderId": process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "797045355004"
};
