import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import app from "../src/app.js";

test("autorise les origines Capacitor natives pour les appels API", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: "OPTIONS",
      headers: {
        origin: "https://localhost",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://localhost");
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});
