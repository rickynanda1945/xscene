"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main
      style={{
        fontFamily: "Arial",
        maxWidth: 560,
        margin: "80px auto",
        padding: 24,
      }}
    >
      <h1>We could not open XSCENE.</h1>
      <p>
        Please retry. If you are setting up the application, check the database
        and environment configuration in Dokploy.
      </p>
      <button onClick={reset}>Try again</button>
      <p>
        <a href="/login">Open sign in</a>
      </p>
    </main>
  );
}
