export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight text-indigo-400">
            Focus<span className="text-zinc-100">Line</span>
          </span>
          <p className="mt-1 text-xs text-zinc-500 tracking-widest uppercase">
            Command Center
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
