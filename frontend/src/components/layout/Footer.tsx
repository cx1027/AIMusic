export default function Footer() {
  return (
    <div className="mt-12 border-t border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6 text-sm text-gray-400">
        <div>© {new Date().getFullYear()} AI Music</div>
        <div className="text-gray-500">Built with Vite + React</div>
      </div>
    </div>
  );
}


