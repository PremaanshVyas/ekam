// Instant, branded route-loading screen (shown by loading.tsx during navigation/data fetch).
export default function PageLoading({ label = "loading…" }: { label?: string }) {
  return (
    <div className="pageload">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ekam-mark.svg" width={52} height={52} alt="" className="pageload__mark" />
      <span className="pageload__label">{label}</span>
    </div>
  );
}
