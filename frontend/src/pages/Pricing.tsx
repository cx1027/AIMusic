export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Pricing</h1>
      <p className="mt-2 text-sm text-gray-300">Simple tiers for MVP.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { name: "Free", price: "$0", desc: "Try it out" },
          { name: "Pro", price: "$9", desc: "More credits + faster queue" },
          { name: "Studio", price: "$29", desc: "Teams + commercial use" }
        ].map((t) => (
          <div key={t.name} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-semibold">{t.name}</div>
            <div className="mt-2 text-3xl font-semibold">{t.price}</div>
            <div className="mt-2 text-sm text-gray-300">{t.desc}</div>
            <button className="mt-4 w-full rounded-md bg-white px-3 py-2 text-black">Choose</button>
          </div>
        ))}
      </div>
    </div>
  );
}


