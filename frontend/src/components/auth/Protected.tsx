import { Navigate, useLocation } from "react-router-dom";
import { useSyncExternalStore } from "react";
import { getAccessToken, subscribeAuth } from "../../lib/auth";

export default function Protected({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = useSyncExternalStore(subscribeAuth, getAccessToken, () => null);
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}


