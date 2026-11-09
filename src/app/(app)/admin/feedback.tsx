/** Message de réussite ou d'erreur d'une action d'administration. */
export function Feedback({ state }: { state: { error?: string; message?: string } }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          {state.message}
        </p>
      )}
    </>
  );
}
