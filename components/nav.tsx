import { signOut } from "@/auth";
import Link from "next/link";

export default function Nav() {
  return (
    <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-sm font-medium text-zinc-300 tracking-tight hover:text-white transition-colors">
        Chuggernaut
      </Link>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
