/** Renders **bold** as <strong>; everything else stays plain text (no HTML injection). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {chunk.slice(2, -2)}
          </strong>
        ) : (
          chunk
        ),
      )}
    </>
  );
}
