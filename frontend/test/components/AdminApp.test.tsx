import test from "node:test";
import assert from "node:assert/strict";
import { render, waitFor, cleanup } from "@testing-library/react";

test("redirige vers / quand aucune session n'est enregistrée", async (t) => {
  const pushCalls: string[] = [];
  t.mock.module("next/navigation", {
    namedExports: { useRouter: () => ({ push: (path: string) => { pushCalls.push(path); } }) },
  });
  const { default: AdminApp } = await import("../../components/AdminApp");

  window.localStorage.clear();
  try {
    render(<AdminApp />);
    await waitFor(() => {
      assert.ok(pushCalls.includes("/"));
    });
  } finally {
    cleanup();
  }
});
