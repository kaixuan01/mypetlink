// Route-level placeholder in the Dashboard's own shape: greeting, pet cards,
// then one content section — no stat tiles the page no longer has.
export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="min-h-screen bg-pet-cream p-4 sm:p-6">
      <div aria-hidden="true" className="mx-auto grid max-w-7xl gap-6">
        <div className="grid gap-2">
          <div className="h-7 w-40 rounded-full bg-white/80" />
          <div className="h-4 w-64 max-w-full rounded-full bg-white/70" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div className="h-[7.75rem] rounded-[1.375rem] bg-white/80" key={item} />
          ))}
        </div>
        <div className="h-44 rounded-[1.375rem] bg-white/80" />
      </div>
    </div>
  );
}
