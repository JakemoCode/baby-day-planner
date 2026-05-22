import type { NextConfig } from "next";

const FIREBASE_PROJECT_ID = "baby-day-planner-24256";

const nextConfig: NextConfig = {
  // Proxy Firebase Auth helper paths from this app's origin so cookies are
  // first-party. Required for signInWithRedirect to work in browsers that
  // block third-party cookies (Chrome incognito, Safari, etc.) — without
  // this, the post-redirect hidden iframe to {project}.firebaseapp.com
  // can't read its own cookies, so the auth state never makes it back to
  // the app and the user lands back at /sign-in.
  //
  // Paired with NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN set to this app's domain
  // (e.g. baby-day-planner.vercel.app), the Firebase SDK opens iframes to
  // /__/auth/* on our origin which we transparently reverse-proxy to
  // Firebase's hosting at {project}.firebaseapp.com.
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/:path*`,
      },
      {
        source: "/__/firebase/:path*",
        destination: `https://${FIREBASE_PROJECT_ID}.firebaseapp.com/__/firebase/:path*`,
      },
    ];
  },
};

export default nextConfig;
