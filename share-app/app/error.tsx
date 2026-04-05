"use client";

import { useEffect } from "react";
import { APP_URL } from "@/lib/site";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[share-app error]", error);
  }, [error]);

  const isNotFound = error?.digest === "NEXT_NOT_FOUND";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "#000",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#fff",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "1.5rem",
          padding: "2rem 1.5rem",
          backdropFilter: "blur(20px)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "2rem",
          }}
        >
          <a
            href={APP_URL}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
              color: "#fff",
              opacity: 0.7,
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>♪</span>
            <span style={{ fontSize: "1.125rem", fontWeight: 700 }}>Melodrift</span>
          </a>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              fontSize: "3rem",
              fontWeight: 800,
              color: isNotFound ? "rgba(236,72,153,0.6)" : "rgba(239,68,68,0.7)",
              lineHeight: 1,
            }}
          >
            {isNotFound ? "404" : "Oops"}
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#fff",
              margin: 0,
            }}
          >
            {isNotFound ? "Share not found" : "Something went wrong"}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "rgba(255,255,255,0.5)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {isNotFound
              ? "This share link may have been removed, expired, or never existed."
              : "An unexpected error occurred. Please try again."}
          </p>
        </div>

        <div style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexDirection: "column" }}>
          {!isNotFound && (
            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "0.75rem 1.5rem",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "0.75rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          )}
          <a
            href={APP_URL}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              padding: "0.75rem 1.5rem",
              background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
              borderRadius: "0.75rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Create Your Own Music
          </a>
        </div>
      </div>
    </div>
  );
}
