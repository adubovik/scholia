"use client";
import { useRouter } from "next/navigation";
import { ImportForm } from "@/components/ImportForm";

export default function NewDocumentPage() {
  const router = useRouter();
  return (
    <main className="page page--import">
      <header className="import-head">
        <p className="import-eyebrow">New text</p>
        <h1>Add to the library</h1>
      </header>
      <ImportForm onDone={(id) => router.push(`/d/${id}`)} />
    </main>
  );
}
