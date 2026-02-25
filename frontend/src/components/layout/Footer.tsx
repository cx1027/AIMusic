import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Product Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">Product</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link to="/discover" className="hover:text-white transition">
                  Discover
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white transition">
                  Plans
                </Link>
              </li>
              <li>
                <Link to="/generate" className="hover:text-white transition">
                  Generate
                </Link>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Help
                </a>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">Company</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a href="#" className="hover:text-white transition">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Contact
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Press
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Careers
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">Legal</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a href="#" className="hover:text-white transition">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Cookie Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  DMCA
                </a>
              </li>
            </ul>
          </div>

          {/* Copyright */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white">Connect</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <a href="#" className="hover:text-white transition">
                  Twitter
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Instagram
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="text-sm text-slate-400">
              © {new Date().getFullYear()} AI Music. All rights reserved.
            </div>
            <div className="flex flex-wrap gap-6 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-400 transition">
                Terms
              </a>
              <a href="#" className="hover:text-slate-400 transition">
                Privacy
              </a>
              <a href="#" className="hover:text-slate-400 transition">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
