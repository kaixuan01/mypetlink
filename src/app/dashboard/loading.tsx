export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-pet-cream p-6">
      <div className="mx-auto grid max-w-7xl gap-4">
        <div className="h-28 rounded-[2rem] bg-white/70" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div className="h-36 rounded-[1.5rem] bg-white/70" key={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
