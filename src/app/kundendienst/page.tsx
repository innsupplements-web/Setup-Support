import KundendienstLeitfaden from "@/components/KundendienstLeitfaden";

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 relative">
      {/* Hintergrundbild – du hast /public/kwb-bg.jpg.webp */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-25"
        style={{
          backgroundImage: 'url("/kwb-bg.jpg.webp")',
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="py-6 md:py-10">
        <KundendienstLeitfaden />
      </div>
    </div>
  );
}
