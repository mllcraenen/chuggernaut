import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Chuggernaut
          </h1>
          <p className="text-sm text-zinc-500">Sign in to continue</p>
        </div>

        <form
          className="space-y-4"
          action={async (formData: FormData) => {
            "use server";
            await signIn("credentials", {
              username: formData.get("username"),
              password: formData.get("password"),
              redirectTo: "/",
            });
          }}
        >
          <div className="space-y-3">
            <input
              name="username"
              type="text"
              placeholder="Username"
              required
              autoComplete="username"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-0"
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-0"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
