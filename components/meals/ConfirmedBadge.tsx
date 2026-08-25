import { Check } from "@/components/ui/icons";

/**
 * The cook has answered for this meal — either confirmed it or renamed it to
 * what they're actually making. Quiet by design: by mid-week most of the
 * schedule carries this, and it should read as settled, not as an alert.
 */
export function ConfirmedBadge() {
  return (
    <span className="label inline-flex items-center gap-1 text-pine">
      <Check className="h-3 w-3" />
      Confirmed
    </span>
  );
}
