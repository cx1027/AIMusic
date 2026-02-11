import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="mt-2 text-sm text-gray-300">Page not found.</p>
      <Link className="mt-6 inline-block rounded-md bg-white px-3 py-2 text-sm text-black" to="/">
        Go home
      </Link>
    </div>
  );
}


