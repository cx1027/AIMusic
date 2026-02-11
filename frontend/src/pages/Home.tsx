import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">AI Music</h1>
      <p className="mt-3 max-w-2xl text-gray-300">
        Generate songs with prompts, manage your library, and share creations.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black" to="/generate">
          Start generating
        </Link>
        <Link className="rounded-md border border-white/15 px-4 py-2 text-sm text-white" to="/discover">
          Explore discover
        </Link>
        <Link className="rounded-md border border-white/15 px-4 py-2 text-sm text-white" to="/pricing">
          View pricing
        </Link>
      </div>
    </div>
  );
}


