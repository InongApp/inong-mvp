import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="font-serif text-3xl font-semibold leading-tight">
          Who&rsquo;s your
          <br />
          Inong?
        </h1>
        <p className="mt-4 max-w-xs text-mute">
          Choose the person who matters to you. Then find out how well you
          two actually know each other.
        </p>
      </div>

      <Link
        href="/pair"
        className="w-full rounded-full bg-coral py-4 text-center font-medium text-ink transition hover:opacity-90"
      >
        Add your Inong
      </Link>
    </div>
  );
}
