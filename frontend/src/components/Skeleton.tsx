/**
 * One shared loading placeholder, composed by each page/component into its own shape (a few
 * stacked Skeletons for a card, a row of them for a table line, etc). Theme tokens only.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-lg bg-[#E8DCC8] ${className}`}
    />
  );
}
