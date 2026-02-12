import { Navigate, Route, Routes } from "react-router-dom";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import Protected from "./components/auth/Protected";
import GlobalPlayer from "./components/player/GlobalPlayer";

import Home from "./pages/Home";
import Generate from "./pages/Generate";
import Library from "./pages/Library";
import SongDetail from "./pages/SongDetail";
import Discover from "./pages/Discover";
import Playlists from "./pages/Playlists";
import Profile from "./pages/Profile";
import Pricing from "./pages/Pricing";
import Share from "./pages/Share";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/share/:shareId" element={<Share />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/generate"
          element={
            <Protected>
              <Generate />
            </Protected>
          }
        />
        <Route
          path="/library"
          element={
            <Protected>
              <Library />
            </Protected>
          }
        />
        <Route
          path="/playlists"
          element={
            <Protected>
              <Playlists />
            </Protected>
          }
        />
        <Route
          path="/songs/:songId"
          element={
            <Protected>
              <SongDetail />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile />
            </Protected>
          }
        />

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      <GlobalPlayer />
      <Footer />
    </div>
  );
}


